"""In-process file locks and atomic replacement for CSV-backed data."""

import hashlib
import json
import os
import tempfile
import threading
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Callable, Iterator

from fastapi import HTTPException

from app.config import DATA_DIR

_registry_guard = threading.Lock()
_lock_registry: dict[str, threading.RLock] = {}
# Acquire file locks before _CACHE_LOCK; readers stay lock-free and serializers rely on caller-held locks.


def _lock_for(key: str) -> threading.RLock:
    with _registry_guard:
        return _lock_registry.setdefault(key, threading.RLock())


@contextmanager
def locked_files(*targets: str | Path) -> Iterator[None]:
    paths = [DATA_DIR / target if isinstance(target, str) else target for target in targets]
    keys = sorted({os.path.normcase(os.path.abspath(path)) for path in paths})
    locks = [_lock_for(key) for key in keys]
    acquired = []
    try:
        for lock in locks:
            if not lock.acquire(timeout=30):
                raise HTTPException(
                    status_code=503,
                    detail={"code": "busy", "message": "Data is busy, please retry."},
                )
            acquired.append(lock)
        yield
    finally:
        for lock in reversed(acquired):
            lock.release()


_FILE_IN_USE_ATTEMPTS = 10
_FILE_IN_USE_DELAY_SECONDS = 0.3


def retry_file_in_use(operation: Callable[[], None]) -> None:
    """Run a file operation, retrying while Windows reports the file as in use (e.g. open in Excel).

    Raises a 503 `busy` HTTPException once all attempts are exhausted.
    """
    for attempt in range(_FILE_IN_USE_ATTEMPTS):
        try:
            operation()
            return
        except PermissionError:
            if attempt == _FILE_IN_USE_ATTEMPTS - 1:
                break
            time.sleep(_FILE_IN_USE_DELAY_SECONDS)
    raise HTTPException(
        status_code=503,
        detail={
            "code": "busy",
            "message": "Data file is in use (it may be open in Excel). Please retry.",
        },
    )


def append_bytes(path: Path, data: bytes) -> None:
    """Append to a file, retrying while it is locked by another program."""
    path.parent.mkdir(parents=True, exist_ok=True)

    def _append() -> None:
        with path.open("ab") as target:
            target.write(data)
            target.flush()
            os.fsync(target.fileno())

    retry_file_in_use(_append)


def atomic_write_bytes(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temp_name = tempfile.mkstemp(
        dir=path.parent, prefix=f".{path.name}.", suffix=".tmp"
    )
    temp_path = Path(temp_name)
    try:
        with os.fdopen(descriptor, "wb") as temp_file:
            temp_file.write(data)
            temp_file.flush()
            os.fsync(temp_file.fileno())

        retry_file_in_use(lambda: os.replace(temp_path, path))
    finally:
        temp_path.unlink(missing_ok=True)


def record_version(fields: dict[str, Any]) -> str:
    normalized = {
        key: "" if value is None else str(value).strip()
        for key, value in fields.items()
    }
    payload = json.dumps(
        normalized,
        sort_keys=True,
        ensure_ascii=False,
        separators=(",", ":"),
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]
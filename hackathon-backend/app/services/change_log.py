"""Append-only field-level change log stored at Auth/ChangeLog.csv under DATA_DIR.

One row per changed field. Rows written by one save request share a request_id.
The file is created lazily; a missing file reads as empty.
"""

import csv
import io
import logging
import uuid
from collections.abc import Iterable, Iterator, Mapping
from dataclasses import dataclass
from pathlib import Path

from app import config
from app.auth import timestamp_now
from app.io.concurrency import append_bytes, locked_files
from app.io.csv_excel import value_to_str
from app.io.generic_csv import split_pipe_value
from app.services.pypcs_service import ACTION_ITEM_HEADERS, canonical_module_key

CHANGE_LOG_HEADERS = [
    "change_id",
    "changed_at",
    "username",
    "role",
    "entity_type",
    "entity_id",
    "ticket_label",
    "action",
    "field",
    "module_key",
    "old_value",
    "new_value",
    "request_id",
]
ENTITY_TYPES = ("product_info", "action_item", "matrix_decision", "user", "option")
MAX_VALUE_LENGTH = 2000
EXPORT_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")
_SECRET_FIELD_MARKERS = ("password", "token", "secret", "hash")
_UTF8_BOM = b"\xef\xbb\xbf"
logger = logging.getLogger(__name__)
_SEARCH_FIELDS = ("ticket_label", "field", "old_value", "new_value")

PRODUCT_INFO_SUBMISSION_FIELDS = ("status", "selected_modules", "product_name", "prodgroup3")
ACTION_ITEM_LOG_FIELDS = tuple(
    header for header in ACTION_ITEM_HEADERS if header not in {"nbr", "updated_at"}
)
MATRIX_DECISION_FIELDS = ("status", "decision_state", "comment")


@dataclass(frozen=True)
class FieldChange:
    field: str
    old_value: str = ""
    new_value: str = ""
    module_key: str = ""
    action: str = ""


@dataclass(frozen=True)
class ChangeFilters:
    entity_type: str = ""
    entity_id: str = ""
    username: str = ""
    q: str = ""
    date_from: str = ""
    date_to: str = ""


def change_log_path() -> Path:
    return config.DATA_DIR / "Auth" / "ChangeLog.csv"


def new_request_id() -> str:
    return str(uuid.uuid4())


def _clip(value: object) -> str:
    return value_to_str(value)[:MAX_VALUE_LENGTH]


def _append_rows(rows: list[dict[str, str]]) -> None:
    """Append audit rows. Failures are logged at ERROR and never raised to the caller.

    The business write has already been committed when this runs; an audit write
    failure must not turn a saved change into a 5xx response.
    """
    path = change_log_path()
    try:
        with locked_files(path):
            is_new = not path.exists() or path.stat().st_size == 0
            buffer = io.StringIO()
            writer = csv.DictWriter(buffer, fieldnames=CHANGE_LOG_HEADERS, lineterminator="\r\n")
            if is_new:
                writer.writeheader()
            writer.writerows(rows)
            data = buffer.getvalue().encode("utf-8")
            if is_new:
                data = _UTF8_BOM + data
            append_bytes(path, data)
    except Exception:  # noqa: BLE001 - audit failure must not fail the saved change
        logger.exception("Change log write failed; %d row(s) were not recorded", len(rows))


def record_changes(
    *,
    username: str,
    role: str,
    entity_type: str,
    entity_id: str,
    ticket_label: str,
    action: str,
    request_id: str,
    changes: Iterable[FieldChange],
) -> None:
    """Append one row per change. Values of secret-looking fields are never written."""
    items = list(changes)
    if not items:
        return
    if entity_type not in ENTITY_TYPES:
        raise ValueError(f"Unknown change-log entity type: {entity_type}")
    changed_at = timestamp_now()
    rows = []
    for change in items:
        field = value_to_str(change.field)
        secret = any(marker in field.casefold() for marker in _SECRET_FIELD_MARKERS)
        rows.append(
            {
                "change_id": str(uuid.uuid4()),
                "changed_at": changed_at,
                "username": value_to_str(username),
                "role": value_to_str(role),
                "entity_type": entity_type,
                "entity_id": value_to_str(entity_id),
                "ticket_label": _clip(ticket_label),
                "action": change.action or action,
                "field": field,
                "module_key": value_to_str(change.module_key),
                "old_value": "" if secret else _clip(change.old_value),
                "new_value": "" if secret else _clip(change.new_value),
                "request_id": request_id,
            }
        )
    _append_rows(rows)


def read_change_log() -> list[dict[str, str]]:
    """Read all audit rows without taking the write lock.

    Appends are whole-record writes, so a reader may only see a partially written
    final line. That line has no trailing newline and is skipped.
    """
    path = change_log_path()
    try:
        raw = path.read_bytes()
    except FileNotFoundError:
        return []
    if raw and not raw.endswith(b"\n"):
        last_newline = raw.rfind(b"\n")
        raw = raw[: last_newline + 1] if last_newline >= 0 else b""
    if raw.startswith(_UTF8_BOM):
        raw = raw[len(_UTF8_BOM):]
    text = raw.decode("utf-8", errors="replace")
    return [dict(row) for row in csv.DictReader(io.StringIO(text, newline=""))]


def has_status_entry(submission_id: str, status: str) -> bool:
    """True when the log already records a product_info status change to `status`."""
    return any(
        row.get("entity_type") == "product_info"
        and value_to_str(row.get("entity_id", "")) == submission_id
        and row.get("field") == "status"
        and value_to_str(row.get("new_value", "")) == status
        for row in read_change_log()
    )


def filter_changes(
    rows: list[dict[str, str]], filters: ChangeFilters
) -> list[dict[str, str]]:
    """Return matching rows newest first (the file is append-only, so reverse order)."""
    needle = filters.q.strip().casefold()
    entity_id = filters.entity_id.strip()
    username = filters.username.strip().casefold()
    result = []
    for row in reversed(rows):
        if filters.entity_type and row.get("entity_type", "") != filters.entity_type:
            continue
        if entity_id and value_to_str(row.get("entity_id", "")) != entity_id:
            continue
        if username and value_to_str(row.get("username", "")).casefold() != username:
            continue
        day = value_to_str(row.get("changed_at", ""))[:10]
        if filters.date_from and day < filters.date_from:
            continue
        if filters.date_to and day > filters.date_to:
            continue
        if needle and not any(
            needle in value_to_str(row.get(field, "")).casefold() for field in _SEARCH_FIELDS
        ):
            continue
        result.append(row)
    return result


def sanitize_export_value(value: object) -> str:
    """Prefix formula-like values with an apostrophe so spreadsheets do not run them."""
    text = value_to_str(value)
    return "'" + text if text.startswith(EXPORT_FORMULA_PREFIXES) else text


def iter_change_rows_csv(rows: Iterable[dict[str, str]]) -> Iterator[bytes]:
    """Yield the export CSV one row at a time so large exports are not built in memory."""
    buffer = io.StringIO()
    writer = csv.DictWriter(
        buffer, fieldnames=CHANGE_LOG_HEADERS, lineterminator="\r\n", extrasaction="ignore"
    )
    writer.writeheader()
    yield _UTF8_BOM + buffer.getvalue().encode("utf-8")
    for row in rows:
        buffer.seek(0)
        buffer.truncate(0)
        writer.writerow({header: sanitize_export_value(row.get(header, "")) for header in CHANGE_LOG_HEADERS})
        yield buffer.getvalue().encode("utf-8")


def field_changes(
    before: Mapping[str, object],
    after: Mapping[str, object],
    fields: Iterable[str],
    *,
    action: str,
) -> list[FieldChange]:
    """Diff plain field maps. Use an empty before for create and an empty after for delete."""
    changes = []
    for field in fields:
        old = value_to_str(before.get(field, ""))
        new = value_to_str(after.get(field, ""))
        if old != new:
            changes.append(FieldChange(field, old, new, action=action))
    return changes


def matrix_decision_changes(
    before: Mapping[str, object], after: Mapping[str, object]
) -> list[FieldChange]:
    changes = []
    for field in MATRIX_DECISION_FIELDS:
        old = value_to_str(before.get(field, ""))
        new = value_to_str(after.get(field, ""))
        if old == new:
            continue
        action = "status_change" if field == "status" else "update"
        changes.append(FieldChange(field, old, new, action=action))
    return changes


def _submission_value(submission: Mapping[str, object], field: str) -> str:
    if field == "selected_modules":
        return "|".join(
            canonical_module_key(module)
            for module in split_pipe_value(value_to_str(submission.get(field, "")))
        )
    return value_to_str(submission.get(field, "")).strip()


def _module_cells(cells: Iterable[Mapping[str, object]]) -> dict[tuple[str, str], tuple[str, str]]:
    """Map (question_id, casefolded module) to (canonical module, answer); legacy blank-module rows are skipped."""
    result: dict[tuple[str, str], tuple[str, str]] = {}
    for cell in cells:
        question_id = value_to_str(cell.get("question_id", "")).strip()
        module_key = canonical_module_key(cell.get("module_key", ""))
        if not question_id or not module_key:
            continue
        result[(question_id, module_key.casefold())] = (
            module_key,
            value_to_str(cell.get("answer", "")),
        )
    return result


def product_info_changes(
    before_submission: Mapping[str, object],
    after_submission: Mapping[str, object],
    before_cells: Iterable[Mapping[str, object]],
    after_cells: Iterable[Mapping[str, object]],
    *,
    creating: bool = False,
) -> list[FieldChange]:
    changes = []
    for field in PRODUCT_INFO_SUBMISSION_FIELDS:
        old = _submission_value(before_submission, field)
        new = _submission_value(after_submission, field)
        if old == new:
            continue
        if creating:
            action = "create"
        elif field == "status":
            action = "status_change"
        else:
            action = "update"
        changes.append(FieldChange(field, old, new, action=action))

    cell_action = "create" if creating else "update"
    before = _module_cells(before_cells)
    after = _module_cells(after_cells)
    for key in sorted(set(before) | set(after)):
        display_module = (after.get(key) or before.get(key))[0]
        old = before.get(key, ("", ""))[1]
        new = after.get(key, ("", ""))[1]
        if old == new:
            continue
        changes.append(
            FieldChange(key[0], old, new, module_key=display_module, action=cell_action)
        )
    return changes


def product_info_delete_changes(
    submission: Mapping[str, object],
    cells: Iterable[Mapping[str, object]],
) -> list[FieldChange]:
    changes = []
    for field in PRODUCT_INFO_SUBMISSION_FIELDS:
        old = _submission_value(submission, field)
        if old:
            changes.append(FieldChange(field, old, "", action="delete"))
    for (question_id, _folded), (module_key, answer) in sorted(_module_cells(cells).items()):
        if answer:
            changes.append(
                FieldChange(question_id, answer, "", module_key=module_key, action="delete")
            )
    return changes

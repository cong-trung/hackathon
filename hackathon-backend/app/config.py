"""Environment loading and app-wide settings."""

import os
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


load_env_file(BACKEND_ROOT / ".env.production")

DATA_DIR = Path(os.getenv("QUALITY_MATRIX_DATA_DIR", "data"))
ALLOWED_ORIGINS = [
    x.strip()
    for x in os.getenv(
        "ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000"
    ).split(",")
]

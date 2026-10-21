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


if os.getenv("QUALITY_MATRIX_SKIP_ENV_FILES") != "1":
    load_env_file(BACKEND_ROOT / ".env.local")
    load_env_file(BACKEND_ROOT / ".env.production")

DATA_DIR = Path(os.getenv("QUALITY_MATRIX_DATA_DIR", "data"))
QUALITY_MATRIX_EDIT_PIN = os.getenv("QUALITY_MATRIX_EDIT_PIN", "").strip()
PROXY_SHARED_SECRET = os.getenv("PROXY_SHARED_SECRET", "").strip()
ALLOWED_ORIGINS = [
    x.strip()
    for x in os.getenv(
        "ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000"
    ).split(",")
]
QUALITY_MATRIX_DB_FEATURES = frozenset(
    feature.strip().casefold()
    for feature in os.getenv("QUALITY_MATRIX_DB_FEATURES", "").split(",")
    if feature.strip()
)


def database_feature_enabled(feature: str) -> bool:
    return feature.casefold() in QUALITY_MATRIX_DB_FEATURES

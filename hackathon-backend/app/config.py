"""Environment loading and app-wide settings."""

import logging
import os
import secrets
import sys
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
QUALITY_MATRIX_AUTH_SECRET = os.getenv("QUALITY_MATRIX_AUTH_SECRET", "").strip()
if QUALITY_MATRIX_AUTH_SECRET and len(QUALITY_MATRIX_AUTH_SECRET) < 32:
    raise ValueError(
        "QUALITY_MATRIX_AUTH_SECRET must be at least 32 characters when set."
    )
if not QUALITY_MATRIX_AUTH_SECRET:
    QUALITY_MATRIX_AUTH_SECRET = secrets.token_urlsafe(48)
    logging.getLogger(__name__).warning(
        "QUALITY_MATRIX_AUTH_SECRET is unset; authentication tokens will reset on restart."
    )
try:
    QUALITY_MATRIX_TOKEN_TTL_HOURS = max(
        1, int(os.getenv("QUALITY_MATRIX_TOKEN_TTL_HOURS", "12"))
    )
except ValueError:
    QUALITY_MATRIX_TOKEN_TTL_HOURS = 12
QUALITY_MATRIX_ADMIN_USERNAME = os.getenv("QUALITY_MATRIX_ADMIN_USERNAME", "").strip()
QUALITY_MATRIX_ADMIN_PASSWORD = os.getenv("QUALITY_MATRIX_ADMIN_PASSWORD", "")
ALLOWED_ORIGINS = [
    x.strip()
    for x in os.getenv(
        "ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000"
    ).split(",")
]
QUALITY_MATRIX_TRUSTED_PROXIES = frozenset(
    value.strip()
    for value in os.getenv("QUALITY_MATRIX_TRUSTED_PROXIES", "127.0.0.1,::1").split(",")
    if value.strip()
)
QUALITY_MATRIX_PUBLIC_URL = os.getenv(
    "QUALITY_MATRIX_PUBLIC_URL", "http://localhost:5173"
).strip().rstrip("/")
QUALITY_MATRIX_MAIL_ENABLED = os.getenv("QUALITY_MATRIX_MAIL_ENABLED", "true").strip().lower() in {"1", "true", "yes", "on"}
QUALITY_MATRIX_MAIL_FROM = os.getenv("QUALITY_MATRIX_MAIL_FROM", "ba-chu-YP@intel.com").strip()
QUALITY_MATRIX_SMTP_HOST = os.getenv("QUALITY_MATRIX_SMTP_HOST", "").strip()
try:
    QUALITY_MATRIX_SMTP_PORT = int(os.getenv("QUALITY_MATRIX_SMTP_PORT", "25"))
except ValueError:
    QUALITY_MATRIX_SMTP_PORT = 25
QUALITY_MATRIX_SMTP_STARTTLS = os.getenv("QUALITY_MATRIX_SMTP_STARTTLS", "false").strip().lower() in {"1", "true", "yes", "on"}
QUALITY_MATRIX_SMTP_USERNAME = os.getenv("QUALITY_MATRIX_SMTP_USERNAME", "").strip()
QUALITY_MATRIX_SMTP_PASSWORD = os.getenv("QUALITY_MATRIX_SMTP_PASSWORD", "")

_MAIL_TRANSPORTS = frozenset({"outlook", "smtp", "log"})
_mail_transport_env = os.getenv("QUALITY_MATRIX_MAIL_TRANSPORT", "").strip().lower()
if _mail_transport_env and _mail_transport_env not in _MAIL_TRANSPORTS:
    logging.getLogger(__name__).warning(
        "Unknown QUALITY_MATRIX_MAIL_TRANSPORT=%r; using the default transport.",
        _mail_transport_env,
    )
    _mail_transport_env = ""
if not QUALITY_MATRIX_MAIL_ENABLED:
    QUALITY_MATRIX_MAIL_TRANSPORT = "log"
elif _mail_transport_env:
    QUALITY_MATRIX_MAIL_TRANSPORT = _mail_transport_env
elif QUALITY_MATRIX_SMTP_HOST:
    QUALITY_MATRIX_MAIL_TRANSPORT = "smtp"
elif sys.platform == "win32":
    QUALITY_MATRIX_MAIL_TRANSPORT = "outlook"
else:
    QUALITY_MATRIX_MAIL_TRANSPORT = "log"
if QUALITY_MATRIX_MAIL_TRANSPORT == "smtp" and not QUALITY_MATRIX_SMTP_HOST:
    logging.getLogger(__name__).warning(
        "QUALITY_MATRIX_MAIL_TRANSPORT=smtp but QUALITY_MATRIX_SMTP_HOST is empty; emails will be logged only."
    )

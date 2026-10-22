"""Local account storage, password hashing, signed tokens, and auth dependencies."""

import base64
import csv
import hashlib
import hmac
import io
import json
import logging
import secrets
import time
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

from fastapi import Depends, HTTPException, Request

from app.config import (
    DATA_DIR,
    QUALITY_MATRIX_ADMIN_PASSWORD,
    QUALITY_MATRIX_ADMIN_USERNAME,
    QUALITY_MATRIX_AUTH_SECRET,
    QUALITY_MATRIX_TOKEN_TTL_HOURS,
)
from app.io.concurrency import atomic_write_bytes, locked_files

USER_FILE = DATA_DIR / "Auth" / "Users.csv"
AUDIT_FILE = DATA_DIR / "Auth" / "AuditLog.csv"
USER_HEADERS = [
    "username", "display_name", "email", "password_hash", "role", "status",
    "created_at", "decided_by", "decided_at",
]
AUDIT_HEADERS = ["timestamp", "username", "method", "path", "status_code"]
TOKEN_SECRET = QUALITY_MATRIX_AUTH_SECRET.encode("utf-8")
_DUMMY_SALT = secrets.token_bytes(16)
_DUMMY_HASH = hashlib.scrypt(
    b"unknown-user-password", salt=_DUMMY_SALT, n=2**14, r=8, p=1, dklen=32
)


def timestamp_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace(
        "+00:00", "Z"
    )


def _csv_bytes(headers: list[str], rows: list[dict[str, str]]) -> bytes:
    output = io.StringIO(newline="")
    writer = csv.DictWriter(
        output, fieldnames=headers, extrasaction="ignore", lineterminator="\r\n"
    )
    writer.writeheader()
    writer.writerows(rows)
    return b"\xef\xbb\xbf" + output.getvalue().encode("utf-8")


def _read_csv(path: Path, headers: list[str]) -> list[dict[str, str]]:
    if not path.exists():
        atomic_write_bytes(path, _csv_bytes(headers, []))
        return []
    with path.open("r", encoding="utf-8-sig", newline="") as source:
        return list(csv.DictReader(source))


def _write_users(rows: list[dict[str, str]]) -> None:
    atomic_write_bytes(USER_FILE, _csv_bytes(USER_HEADERS, rows))


def public_user(row: dict[str, str]) -> dict[str, str]:
    return {key: row.get(key, "") for key in USER_HEADERS if key != "password_hash"}


def normalize_username(value: str) -> str:
    return value.strip().lower()


def validate_username(value: str) -> str:
    username = normalize_username(value)
    if not (3 <= len(username) <= 32) or any(
        char not in "abcdefghijklmnopqrstuvwxyz0123456789._-" for char in username
    ):
        raise HTTPException(
            status_code=422,
            detail={"code": "invalid_username", "message": "Invalid username."},
        )
    return username


def validate_display_name(value: str) -> str:
    display_name = value.strip()
    if (
        not 1 <= len(display_name) <= 80
        or display_name[0] in "=+-@"
        or "|" in display_name
        or any(unicodedata.category(char) == "Cc" for char in display_name)
    ):
        raise HTTPException(
            status_code=422,
            detail={"code": "invalid_display_name", "message": "Invalid display_name."},
        )
    return display_name


def validate_email(value: str) -> str:
    email = value.strip()
    parts = email.rsplit("@", 1)
    if any(unicodedata.category(char) == "Cc" for char in value) or (
        email
        and (
            len(email) > 254
            or email[0] in "=+-@"
            or email.count("@") != 1
            or len(parts) != 2
            or not parts[0]
            or "." not in parts[1]
            or parts[1].startswith(".")
            or parts[1].endswith(".")
            or any(char.isspace() for char in email)
        )
    ):
        raise HTTPException(
            status_code=422,
            detail={"code": "invalid_email", "message": "Invalid email."},
        )
    return email


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    password_hash = hashlib.scrypt(
        password.encode("utf-8"), salt=salt, n=2**14, r=8, p=1, dklen=32
    )
    salt_b64 = base64.b64encode(salt).decode("ascii")
    hash_b64 = base64.b64encode(password_hash).decode("ascii")
    return f"scrypt$16384$8$1${salt_b64}${hash_b64}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        algorithm, n, r, p, salt_text, hash_text = stored_hash.split("$")
        if algorithm != "scrypt" or (int(n), int(r), int(p)) != (2**14, 8, 1):
            return False
        salt = base64.b64decode(salt_text, validate=True)
        expected = base64.b64decode(hash_text, validate=True)
        if len(salt) != 16 or len(expected) != 32:
            return False
        actual = hashlib.scrypt(
            password.encode("utf-8"),
            salt=salt,
            n=int(n),
            r=int(r),
            p=int(p),
            dklen=len(expected),
        )
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError, MemoryError):
        return False


def issue_token(username: str) -> tuple[str, str]:
    now = int(time.time())
    expires = now + QUALITY_MATRIX_TOKEN_TTL_HOURS * 3600
    payload = json.dumps(
        {"sub": username, "iat": now, "exp": expires},
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    encoded = base64.urlsafe_b64encode(payload).rstrip(b"=")
    signature = hmac.new(TOKEN_SECRET, encoded, hashlib.sha256).digest()
    token = b".".join(
        (encoded, base64.urlsafe_b64encode(signature).rstrip(b"="))
    ).decode("ascii")
    expires_at = datetime.fromtimestamp(expires, timezone.utc).isoformat().replace(
        "+00:00", "Z"
    )
    return token, expires_at


def verify_token(token: str) -> dict[str, int | str] | None:
    try:
        encoded, signature_text = token.encode("ascii").split(b".", 1)
        signature = base64.urlsafe_b64decode(
            signature_text + b"=" * (-len(signature_text) % 4)
        )
        expected = hmac.new(TOKEN_SECRET, encoded, hashlib.sha256).digest()
        if not hmac.compare_digest(signature, expected):
            return None
        payload = base64.urlsafe_b64decode(encoded + b"=" * (-len(encoded) % 4))
        claims = json.loads(payload)
        if (
            not isinstance(claims, dict)
            or not isinstance(claims.get("sub"), str)
            or int(claims.get("exp", 0)) <= int(time.time())
        ):
            return None
        return claims
    except (ValueError, UnicodeError, json.JSONDecodeError, TypeError):
        return None


async def get_current_user(request: Request) -> dict[str, str]:
    authorization = request.headers.get("authorization", "")
    scheme, separator, token = authorization.partition(" ")
    claims = (
        verify_token(token.strip())
        if separator and scheme.lower() == "bearer"
        else None
    )
    if not claims:
        raise HTTPException(status_code=401, detail={"code": "unauthenticated"})
    with locked_files(USER_FILE):
        rows = _read_csv(USER_FILE, USER_HEADERS)
    username = normalize_username(str(claims["sub"]))
    row = next(
        (item for item in rows if item.get("username", "").lower() == username), None
    )
    if not row or row.get("status") != "active":
        raise HTTPException(status_code=401, detail={"code": "unauthenticated"})
    user = public_user(row)
    request.state.auth_user = user
    return user


async def require_admin(user: dict[str, str] = Depends(get_current_user)) -> dict[str, str]:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail={"code": "admin_required"})
    return user


def bootstrap_admin() -> None:
    with locked_files(USER_FILE):
        rows = _read_csv(USER_FILE, USER_HEADERS)
        if any(
            row.get("role") == "admin" and row.get("status") == "active"
            for row in rows
        ):
            return
        if not QUALITY_MATRIX_ADMIN_USERNAME or not QUALITY_MATRIX_ADMIN_PASSWORD:
            return
        username = validate_username(QUALITY_MATRIX_ADMIN_USERNAME)
        matching = next(
            (row for row in rows if row.get("username", "").lower() == username), None
        )
        now = timestamp_now()
        admin_row = {
            "username": username,
            "display_name": username,
            "email": "",
            "password_hash": hash_password(QUALITY_MATRIX_ADMIN_PASSWORD),
            "role": "admin",
            "status": "active",
            "created_at": matching.get("created_at", now) if matching else now,
            "decided_by": username,
            "decided_at": now,
        }
        if matching:
            rows[rows.index(matching)] = admin_row
        else:
            rows.append(admin_row)
        _write_users(rows)
        logging.getLogger(__name__).info("Bootstrapped local admin account %s", username)


def record_audit(username: str, method: str, path: str, status_code: int) -> None:
    with locked_files(AUDIT_FILE):
        rows = _read_csv(AUDIT_FILE, ["timestamp", "username", "method", "path", "status_code"])
        rows.append(
            {
                "timestamp": timestamp_now(),
                "username": username,
                "method": method,
                "path": path,
                "status_code": str(status_code),
            }
        )
        atomic_write_bytes(
            AUDIT_FILE,
            _csv_bytes(["timestamp", "username", "method", "path", "status_code"], rows),
        )
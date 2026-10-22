"""Local account request, login, and administration endpoints."""

import hashlib
import hmac
import ipaddress
import threading
import time

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field

from app.config import QUALITY_MATRIX_TRUSTED_PROXIES
from app.auth import (
    USER_FILE,
    USER_HEADERS,
    _DUMMY_HASH,
    _DUMMY_SALT,
    _read_csv,
    _write_users,
    ensure_guest_user,
    get_current_user,
    hash_password,
    issue_token,
    normalize_username,
    public_user,
    require_admin,
    timestamp_now,
    validate_display_name,
    validate_email,
    validate_username,
    verify_password,
)
from app.io.concurrency import locked_files

router = APIRouter()
_LOGIN_WINDOW_SECONDS = 300
_LOGIN_FAILURE_LIMIT = 5
_LOGIN_IP_FAILURE_LIMIT = 20
_LOGIN_FAILURES_MAX_KEYS = 10_000
_LOGIN_FAILURES: dict[tuple[str, str, str], list[float]] = {}
_LOGIN_FAILURES_LOCK = threading.Lock()


class AccountRequest(BaseModel):
    username: str = Field(min_length=3, max_length=32)
    display_name: str = Field(min_length=1, max_length=80)
    email: str | None = Field(default="", max_length=254)
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=128)
    password: str = Field(min_length=1, max_length=128)


class ApproveRequest(BaseModel):
    role: str


def _client_ip(request: Request) -> str:
    peer = request.client.host if request.client else "unknown"
    try:
        normalized_peer = str(ipaddress.ip_address(peer))
    except ValueError:
        normalized_peer = peer
    forwarded = request.headers.get("x-forwarded-for", "")
    if normalized_peer not in QUALITY_MATRIX_TRUSTED_PROXIES or not forwarded:
        return normalized_peer
    first_hop = forwarded.split(",", 1)[0].strip()
    try:
        return str(ipaddress.ip_address(first_hop))
    except ValueError:
        return normalized_peer


def _prune_login_failures(now: float) -> None:
    for key, attempts in list(_LOGIN_FAILURES.items()):
        recent = [
            attempt for attempt in attempts if now - attempt < _LOGIN_WINDOW_SECONDS
        ]
        if recent:
            _LOGIN_FAILURES[key] = recent
        else:
            _LOGIN_FAILURES.pop(key, None)


def _cap_login_failures() -> None:
    while len(_LOGIN_FAILURES) > _LOGIN_FAILURES_MAX_KEYS:
        oldest_key = min(_LOGIN_FAILURES, key=lambda key: _LOGIN_FAILURES[key][-1])
        _LOGIN_FAILURES.pop(oldest_key, None)


def _check_login_throttle(username: str, client_ip: str) -> None:
    now = time.monotonic()
    pair_key = ("user", username, client_ip)
    ip_key = ("ip", "", client_ip)
    with _LOGIN_FAILURES_LOCK:
        _prune_login_failures(now)
        if (
            len(_LOGIN_FAILURES.get(pair_key, [])) >= _LOGIN_FAILURE_LIMIT
            or len(_LOGIN_FAILURES.get(ip_key, [])) >= _LOGIN_IP_FAILURE_LIMIT
        ):
            raise HTTPException(status_code=429, detail={"code": "too_many_attempts"})


def _record_login_failure(username: str, client_ip: str) -> None:
    now = time.monotonic()
    pair_key = ("user", username, client_ip)
    ip_key = ("ip", "", client_ip)
    with _LOGIN_FAILURES_LOCK:
        _prune_login_failures(now)
        _LOGIN_FAILURES[pair_key] = _LOGIN_FAILURES.get(pair_key, []) + [now]
        _LOGIN_FAILURES[ip_key] = _LOGIN_FAILURES.get(ip_key, []) + [now]
        _cap_login_failures()


def _clear_login_failures(username: str, client_ip: str) -> None:
    with _LOGIN_FAILURES_LOCK:
        _LOGIN_FAILURES.pop(("user", username, client_ip), None)


def _find_user(rows: list[dict[str, str]], username: str):
    return next(
        (row for row in rows if row.get("username", "").lower() == username), None
    )


@router.post("/auth/request-account", status_code=201)
def request_account(payload: AccountRequest):
    username = validate_username(payload.username)
    display_name = validate_display_name(payload.display_name)
    email = validate_email(payload.email or "")
    password_hash = hash_password(payload.password)
    with locked_files(USER_FILE):
        rows = _read_csv(USER_FILE, USER_HEADERS)
        if _find_user(rows, username):
            raise HTTPException(status_code=409, detail={"code": "username_taken"})
        row = {
            "username": username,
            "display_name": display_name,
            "email": email,
            "password_hash": password_hash,
            "role": "editor",
            "status": "pending",
            "created_at": timestamp_now(),
            "decided_by": "",
            "decided_at": "",
        }
        rows.append(row)
        _write_users(rows)
    return {"user": public_user(row)}


@router.post("/auth/login")
def login(payload: LoginRequest, request: Request):
    username = normalize_username(payload.username)
    client_ip = _client_ip(request)
    _check_login_throttle(username, client_ip)
    with locked_files(USER_FILE):
        rows = _read_csv(USER_FILE, USER_HEADERS)
    row = _find_user(rows, username)
    if not row:
        candidate = hashlib.scrypt(
            payload.password.encode("utf-8"),
            salt=_DUMMY_SALT,
            n=2**14,
            r=8,
            p=1,
            dklen=len(_DUMMY_HASH),
        )
        hmac.compare_digest(candidate, _DUMMY_HASH)
        _record_login_failure(username, client_ip)
        raise HTTPException(status_code=401, detail={"code": "invalid_credentials"})
    if not verify_password(payload.password, row.get("password_hash", "")):
        _record_login_failure(username, client_ip)
        raise HTTPException(status_code=401, detail={"code": "invalid_credentials"})
    _clear_login_failures(username, client_ip)
    if row.get("status") == "pending":
        raise HTTPException(status_code=403, detail={"code": "account_pending"})
    if row.get("status") != "active":
        raise HTTPException(status_code=403, detail={"code": "account_disabled"})
    token, expires_at = issue_token(username)
    return {"token": token, "expires_at": expires_at, "user": public_user(row)}


@router.post("/auth/guest")
def guest_login():
    """One-click, password-less sign in for the read-only guest account."""
    user = ensure_guest_user()
    token, expires_at = issue_token(user["username"])
    return {"token": token, "expires_at": expires_at, "user": user}


@router.get("/auth/me")
def auth_me(user: dict[str, str] = Depends(get_current_user)):
    return {"user": user}


@router.get("/auth/users")
def list_users(
    status: str | None = Query(default=None),
    _admin: dict[str, str] = Depends(require_admin),
):
    if status and status not in {"pending", "active", "rejected", "disabled"}:
        raise HTTPException(status_code=422, detail={"code": "invalid_status"})
    with locked_files(USER_FILE):
        rows = _read_csv(USER_FILE, USER_HEADERS)
    return {"users": [
        public_user(row) for row in rows if not status or row.get("status") == status
    ]}


@router.post("/auth/users/{username}/approve")
def approve_user(
    username: str,
    payload: ApproveRequest,
    admin: dict[str, str] = Depends(require_admin),
):
    if payload.role not in {"editor", "admin"}:
        raise HTTPException(status_code=422, detail={"code": "invalid_role"})
    with locked_files(USER_FILE):
        rows = _read_csv(USER_FILE, USER_HEADERS)
        row = _find_user(rows, normalize_username(username))
        if not row:
            raise HTTPException(status_code=404, detail={"code": "user_not_found"})
        if row.get("role") == "admin" and payload.role != "admin" and row.get("status") == "active":
            active_admins = [item for item in rows if item.get("role") == "admin" and item.get("status") == "active"]
            if len(active_admins) <= 1:
                raise HTTPException(status_code=409, detail={"code": "last_admin"})
        row.update(
            role=payload.role,
            status="active",
            decided_by=admin["username"],
            decided_at=timestamp_now(),
        )
        _write_users(rows)
    return {"user": public_user(row)}


def _decide_user(username: str, admin: dict[str, str], status: str):
    target = normalize_username(username)
    with locked_files(USER_FILE):
        rows = _read_csv(USER_FILE, USER_HEADERS)
        acting_admin = _find_user(rows, normalize_username(admin["username"]))
        if (
            not acting_admin
            or acting_admin.get("status") != "active"
            or acting_admin.get("role") != "admin"
        ):
            raise HTTPException(status_code=403, detail={"code": "admin_required"})
        row = _find_user(rows, target)
        if not row:
            raise HTTPException(status_code=404, detail={"code": "user_not_found"})
        if (
            status != "active"
            and row.get("status") == "active"
            and row.get("role") == "admin"
        ):
            active_admins = [item for item in rows if item.get("role") == "admin" and item.get("status") == "active"]
            if len(active_admins) <= 1:
                raise HTTPException(status_code=409, detail={"code": "last_admin"})
        if target == acting_admin.get("username"):
            raise HTTPException(status_code=403, detail={"code": "cannot_change_self"})
        row.update(status=status, decided_by=acting_admin["username"], decided_at=timestamp_now())
        _write_users(rows)
    return {"user": public_user(row)}


@router.post("/auth/users/{username}/reject")
def reject_user(username: str, admin: dict[str, str] = Depends(require_admin)):
    return _decide_user(username, admin, "rejected")


@router.post("/auth/users/{username}/disable")
def disable_user(username: str, admin: dict[str, str] = Depends(require_admin)):
    return _decide_user(username, admin, "disabled")
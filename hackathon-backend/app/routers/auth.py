"""Local account request, login, and administration endpoints."""

import hashlib
import hmac
import ipaddress
import threading
import time
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, ConfigDict, Field

from app.config import QUALITY_MATRIX_TRUSTED_PROXIES
from app.auth import (
    ROLE_ADMIN,
    ROLE_ME,
    ROLE_TI,
    GUEST_USERNAME,
    ROLE_VIEWER,
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
    normalize_role,
    normalize_username,
    public_user,
    record_audit,
    require_admin,
    timestamp_now,
    validate_display_name,
    validate_email,
    validate_username,
    verify_password,
)
from app.io.concurrency import locked_files
from app.io.csv_excel import value_to_str
from app.services.change_log import (
    FieldChange,
    field_changes,
    new_request_id,
    record_changes,
)

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


class RoleChangeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: str


# Roles accepted on approval. Legacy "editor" is stored as ti.
_APPROVABLE_ROLES = {ROLE_ADMIN, ROLE_TI, ROLE_ME, ROLE_VIEWER, "editor"}
_ASSIGNABLE_ROLES = {ROLE_ADMIN, ROLE_TI, ROLE_ME, ROLE_VIEWER}


class ChangePasswordRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


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
        if email and any(
            value_to_str(item.get("email", "")).strip().casefold() == email.casefold() for item in rows
        ):
            raise HTTPException(status_code=409, detail={"code": "email_in_use"})
        row = {
            "username": username,
            "display_name": display_name,
            "email": email,
            "password_hash": password_hash,
            "role": ROLE_VIEWER,
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


@router.post("/auth/change-password")
def change_password(
    payload: ChangePasswordRequest,
    request: Request,
    user: dict[str, str] = Depends(get_current_user),
):
    if normalize_role(user.get("role")) == ROLE_VIEWER:
        raise HTTPException(status_code=403, detail={"code": "guest_not_allowed"})
    username = normalize_username(user["username"])
    client_ip = _client_ip(request)
    _check_login_throttle(username, client_ip)
    with locked_files(USER_FILE):
        rows = _read_csv(USER_FILE, USER_HEADERS)
        row = _find_user(rows, username)
        if not row or row.get("status") != "active" or normalize_role(row.get("role")) == ROLE_VIEWER:
            raise HTTPException(status_code=401, detail={"code": "unauthenticated"})
        if not verify_password(payload.current_password, row.get("password_hash", "")):
            _record_login_failure(username, client_ip)
            raise HTTPException(
                status_code=400,
                detail={"code": "invalid_current_password", "message": "Current password is incorrect."},
            )
        if payload.new_password == payload.current_password:
            raise HTTPException(
                status_code=422,
                detail={"field": "new_password", "code": "password_unchanged"},
            )
        row["password_hash"] = hash_password(payload.new_password)
        _write_users(rows)
        record_changes(
            username=username,
            role=normalize_role(user.get("role")),
            entity_type="user",
            entity_id=username,
            ticket_label=username,
            action="password_change",
            request_id=new_request_id(),
            changes=[FieldChange("password", action="password_change")],
        )
    record_audit(username, "POST", "/auth/change-password", 200)
    return {"ok": True}


@router.post("/auth/guest")
def guest_login():
    """One-click, password-less sign in for the read-only guest account."""
    user = ensure_guest_user()
    token, expires_at = issue_token(user["username"])
    return {"token": token, "expires_at": expires_at, "user": user}


@router.get("/auth/me")
def auth_me(user: dict[str, str] = Depends(get_current_user)):
    role = user.get("role")
    return {
        "user": user,
        "permissions": {
            "can_create_product": role in {ROLE_ADMIN, ROLE_TI},
            "can_edit_action_items": role in {ROLE_ADMIN, ROLE_TI},
            "is_admin": role == ROLE_ADMIN,
        },
    }


_USER_STATUSES = ("pending", "active", "rejected", "disabled")


@router.get("/auth/users/meta")
def users_meta(_admin: dict[str, str] = Depends(require_admin)):
    with locked_files(USER_FILE):
        rows = _read_csv(USER_FILE, USER_HEADERS)
    counts = {key: 0 for key in _USER_STATUSES}
    for row in rows:
        if row.get("status") in counts:
            counts[row["status"]] += 1
    return {"tabs": [{"key": key, "count": counts[key]} for key in _USER_STATUSES]}


@router.get("/auth/users")
def list_users(
    status: str | None = Query(default=None),
    view: Literal["page"] | None = Query(default=None),
    q: str | None = Query(default=None, max_length=200),
    limit: int | None = Query(default=None, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    _admin: dict[str, str] = Depends(require_admin),
):
    if status and status not in _USER_STATUSES:
        raise HTTPException(status_code=422, detail={"code": "invalid_status"})
    with locked_files(USER_FILE):
        rows = _read_csv(USER_FILE, USER_HEADERS)
    paged = view == "page" or limit is not None or q is not None
    term = (q or "").strip().casefold()
    users = [
        public_user(row)
        for row in rows
        if (not status or row.get("status") == status)
        and (
            not term
            or any(
                term in value_to_str(row.get(field, "")).casefold()
                for field in ("username", "display_name", "email")
            )
        )
    ]
    if not paged:
        return {"users": users}
    page_size = limit if limit is not None else 50
    return {
        "items": users[offset : offset + page_size],
        "total": len(users),
        "limit": page_size,
        "offset": offset,
    }


@router.post("/auth/users/{username}/approve")
def approve_user(
    username: str,
    payload: ApproveRequest,
    admin: dict[str, str] = Depends(require_admin),
):
    raw_role = value_to_str(payload.role).strip().lower()
    if raw_role not in _APPROVABLE_ROLES:
        raise HTTPException(status_code=422, detail={"code": "invalid_role"})
    role = normalize_role(raw_role)
    with locked_files(USER_FILE):
        rows = _read_csv(USER_FILE, USER_HEADERS)
        row = _find_user(rows, normalize_username(username))
        if not row:
            raise HTTPException(status_code=404, detail={"code": "user_not_found"})
        if row.get("username", "").lower() == GUEST_USERNAME:
            raise HTTPException(status_code=409, detail={"code": "guest_account_locked"})
        if normalize_username(row.get("username", "")) == normalize_username(admin["username"]):
            raise HTTPException(status_code=409, detail={"code": "cannot_change_own_role"})
        if row.get("status") not in {"pending", "rejected"}:
            raise HTTPException(status_code=409, detail={"code": "not_approvable"})
        if role == ROLE_ME and not value_to_str(row.get("email", "")).strip():
            raise HTTPException(status_code=422, detail={"code": "email_required_for_me"})
        if normalize_role(row.get("role")) == ROLE_ADMIN and role != ROLE_ADMIN and row.get("status") == "active":
            active_admins = [item for item in rows if normalize_role(item.get("role")) == ROLE_ADMIN and item.get("status") == "active"]
            if len(active_admins) <= 1:
                raise HTTPException(status_code=409, detail={"code": "last_admin"})
        before = {"status": row.get("status", ""), "role": normalize_role(row.get("role"))}
        row.update(
            role=role,
            status="active",
            decided_by=admin["username"],
            decided_at=timestamp_now(),
        )
        _write_users(rows)
        record_changes(
            username=admin["username"],
            role=normalize_role(admin.get("role")),
            entity_type="user",
            entity_id=row["username"],
            ticket_label=row["username"],
            action="approve",
            request_id=new_request_id(),
            changes=field_changes(
                before, {"status": "active", "role": role}, ("status", "role"), action="approve"
            ),
        )
    return {"user": public_user(row)}


@router.patch("/auth/users/{username}/role")
def change_user_role(
    username: str,
    payload: RoleChangeRequest,
    admin: dict[str, str] = Depends(require_admin),
):
    role = value_to_str(payload.role).strip().lower()
    if role not in _ASSIGNABLE_ROLES:
        raise HTTPException(status_code=422, detail={"code": "invalid_role"})
    target = normalize_username(username)
    if target == normalize_username(admin["username"]):
        raise HTTPException(status_code=409, detail={"code": "cannot_change_own_role"})
    if target == GUEST_USERNAME:
        raise HTTPException(status_code=409, detail={"code": "guest_account_locked"})
    with locked_files(USER_FILE):
        rows = _read_csv(USER_FILE, USER_HEADERS)
        row = _find_user(rows, target)
        if not row:
            raise HTTPException(status_code=404, detail={"code": "user_not_found"})
        if row.get("status") == "pending":
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "account_pending",
                    "message": "Approve the account before changing its role.",
                },
            )
        if row.get("status") != "active":
            raise HTTPException(status_code=409, detail={"code": "user_not_active"})
        if role == ROLE_ME and not value_to_str(row.get("email", "")).strip():
            raise HTTPException(status_code=422, detail={"code": "email_required_for_me"})
        if normalize_role(row.get("role")) == ROLE_ADMIN and role != ROLE_ADMIN:
            active_admins = [item for item in rows if normalize_role(item.get("role")) == ROLE_ADMIN and item.get("status") == "active"]
            if len(active_admins) <= 1:
                raise HTTPException(status_code=409, detail={"code": "last_admin"})
        before_role = normalize_role(row.get("role"))
        row["role"] = role
        _write_users(rows)
        record_changes(
            username=admin["username"],
            role=normalize_role(admin.get("role")),
            entity_type="user",
            entity_id=row["username"],
            ticket_label=row["username"],
            action="role_change",
            request_id=new_request_id(),
            changes=field_changes(
                {"role": before_role}, {"role": role}, ("role",), action="role_change"
            ),
        )
    return {"user": public_user(row)}


def _decide_user(username: str, admin: dict[str, str], status: str, action: str):
    target = normalize_username(username)
    with locked_files(USER_FILE):
        rows = _read_csv(USER_FILE, USER_HEADERS)
        acting_admin = _find_user(rows, normalize_username(admin["username"]))
        if (
            not acting_admin
            or acting_admin.get("status") != "active"
            or normalize_role(acting_admin.get("role")) != ROLE_ADMIN
        ):
            raise HTTPException(status_code=403, detail={"code": "admin_required"})
        row = _find_user(rows, target)
        if not row:
            raise HTTPException(status_code=404, detail={"code": "user_not_found"})
        if target == GUEST_USERNAME:
            raise HTTPException(status_code=409, detail={"code": "guest_account_locked"})
        if (
            status != "active"
            and row.get("status") == "active"
            and normalize_role(row.get("role")) == ROLE_ADMIN
        ):
            active_admins = [item for item in rows if normalize_role(item.get("role")) == ROLE_ADMIN and item.get("status") == "active"]
            if len(active_admins) <= 1:
                raise HTTPException(status_code=409, detail={"code": "last_admin"})
        if target == acting_admin.get("username"):
            raise HTTPException(status_code=403, detail={"code": "cannot_change_self"})
        before_status = row.get("status", "")
        row.update(status=status, decided_by=acting_admin["username"], decided_at=timestamp_now())
        _write_users(rows)
        record_changes(
            username=admin["username"],
            role=normalize_role(admin.get("role")),
            entity_type="user",
            entity_id=row["username"],
            ticket_label=row["username"],
            action=action,
            request_id=new_request_id(),
            changes=field_changes(
                {"status": before_status}, {"status": status}, ("status",), action=action
            ),
        )
    return {"user": public_user(row)}


@router.post("/auth/users/{username}/reject")
def reject_user(username: str, admin: dict[str, str] = Depends(require_admin)):
    return _decide_user(username, admin, "rejected", "reject")


@router.post("/auth/users/{username}/disable")
def disable_user(username: str, admin: dict[str, str] = Depends(require_admin)):
    return _decide_user(username, admin, "disabled", "disable")
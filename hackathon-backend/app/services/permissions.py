"""Role-based permission helpers for PYPCS submissions and product action matrix rows.

ME (module owner) scope: a signed-in ME user owns every module whose per-module
`pdo_owner` cell lists their account email. Owner emails are split on `,`, `;`,
and line breaks, and compared case-insensitively.
"""

import re
from typing import Any

from app.auth import ROLE_ADMIN, ROLE_ME, ROLE_TI
from app.io.csv_excel import value_to_str
from app.io.generic_csv import read_optional_csv, split_pipe_value
from app.services.pypcs_service import (
    PYPCS_SUBMISSION_CELLS_FILE,
    canonical_module_key,
)

PDO_OWNER_QUESTION_ID = "pdo_owner"
ME_QUESTION_ROLE = "ME"
_EMAIL_SPLIT = re.compile(r"[,;\r\n]+")

# submission_id -> canonical module key -> {casefolded email: original email}
OwnerIndex = dict[str, dict[str, dict[str, str]]]


def split_emails(value: Any) -> dict[str, str]:
    """Return {casefolded: original} for each distinct email in an owner cell."""
    emails: dict[str, str] = {}
    for part in _EMAIL_SPLIT.split(value_to_str(value)):
        email = part.strip()
        if email:
            emails.setdefault(email.casefold(), email)
    return emails


def user_email(user: dict[str, Any] | None) -> str:
    if not user:
        return ""
    return value_to_str(user.get("email", "")).strip().casefold()


def user_role(user: dict[str, Any] | None) -> str | None:
    return user.get("role") if user else None


def build_owner_index(cells: list[dict[str, str]] | None = None) -> OwnerIndex:
    """Build the pdo_owner index once from submission cells (module cells only)."""
    if cells is None:
        cells = read_optional_csv(PYPCS_SUBMISSION_CELLS_FILE)
    index: OwnerIndex = {}
    for row in cells:
        if value_to_str(row.get("question_id", "")) != PDO_OWNER_QUESTION_ID:
            continue
        module_key = canonical_module_key(row.get("module_key", ""))
        if not module_key:
            continue
        submission_id = value_to_str(row.get("submission_id", ""))
        owners = split_emails(row.get("answer", ""))
        if not owners:
            continue
        index.setdefault(submission_id, {}).setdefault(module_key, {}).update(owners)
    return index


def owned_modules(index: OwnerIndex, submission_id: str, email: str) -> list[str]:
    """Canonical module keys in a submission whose owner list contains the email."""
    if not email:
        return []
    return [
        module_key
        for module_key, owners in index.get(submission_id, {}).items()
        if email in owners
    ]


def pdo_owner_emails(index: OwnerIndex, submission_id: str) -> list[str]:
    """Distinct owner emails across all modules of a submission, original casing."""
    emails: dict[str, str] = {}
    for owners in index.get(submission_id, {}).values():
        for folded, original in owners.items():
            emails.setdefault(folded, original)
    return list(emails.values())


def submission_permissions(
    user: dict[str, Any] | None,
    status: str,
    owned: list[str],
) -> dict[str, Any]:
    """Permission block for one submission (see GET /pypcs/submissions[/id]).

    can_submit_ti is true for TI/admin while the submission is draft (or new), so the TI
    part can be sent to waiting_me. can_final stays TI/admin and is not final.
    """
    role = user_role(user)
    status_key = value_to_str(status).strip().lower()
    is_final = status_key == "final"
    can_submit_ti = role in {ROLE_ADMIN, ROLE_TI} and status_key in {"draft", "new"}
    if role == ROLE_ADMIN or (role == ROLE_TI and not is_final):
        return {
            "can_edit": True,
            "can_final": True,
            "can_submit_ti": can_submit_ti,
            "can_delete": True,
            "editable_modules": "all",
            "editable_question_roles": ["TI", "ME"],
        }
    if role == ROLE_ME and not is_final and owned:
        return {
            "can_edit": True,
            "can_final": False,
            "can_submit_ti": False,
            "can_delete": False,
            "editable_modules": list(owned),
            "editable_question_roles": [ME_QUESTION_ROLE],
        }
    return {
        "can_edit": False,
        "can_final": False,
        "can_submit_ti": False,
        "can_delete": False,
        "editable_modules": [],
        "editable_question_roles": [],
    }


def can_edit_matrix_row(
    user: dict[str, Any] | None,
    row_module_keys: list[str],
    owned: list[str],
) -> bool:
    """True when the user may save a product action matrix row."""
    role = user_role(user)
    if role in {ROLE_ADMIN, ROLE_TI}:
        return True
    if role == ROLE_ME:
        owned_folded = {module.casefold() for module in owned}
        return any(
            value_to_str(module).strip().casefold() in owned_folded
            for module in row_module_keys
        )
    return False


def me_owned_folded(index: OwnerIndex, submission_id: str, email: str) -> set[str]:
    return {module.casefold() for module in owned_modules(index, submission_id, email)}


def _module_cell_map(rows: list[dict[str, str]], submission_id: str) -> dict[tuple[str, str], dict[str, str]]:
    cells: dict[tuple[str, str], dict[str, str]] = {}
    for row in rows:
        if value_to_str(row.get("submission_id", "")) != submission_id:
            continue
        module_key = canonical_module_key(row.get("module_key", "")).casefold()
        if not module_key:
            continue
        question_id = value_to_str(row.get("question_id", ""))
        cells[(question_id, module_key)] = row
    return cells


def out_of_scope_cell_fields(
    existing_cells: list[dict[str, str]],
    merged_cells: list[dict[str, str]],
    submission_id: str,
    owned_folded: set[str],
) -> list[str]:
    """Module cells changed, added, or removed that an ME user may not change."""
    before = _module_cell_map(existing_cells, submission_id)
    after = _module_cell_map(merged_cells, submission_id)
    fields = set()
    for key in set(before) | set(after):
        old = before.get(key)
        new = after.get(key)
        old_answer = value_to_str(old.get("answer", "")) if old else ""
        new_answer = value_to_str(new.get("answer", "")) if new else ""
        if old_answer == new_answer:
            continue
        source = new or old or {}
        question_id, module_key = key
        is_me_question = (
            value_to_str(source.get("role", "")).strip().upper() == ME_QUESTION_ROLE
        )
        if not is_me_question or module_key not in owned_folded:
            fields.add(f"{question_id}:{module_key}")
    return sorted(fields)


def submission_field_changes(
    existing: dict[str, str],
    submission_row: dict[str, str],
) -> list[str]:
    """Submission-level fields an ME user may not change (role is preserved server-side)."""
    changed = []
    old_modules = sorted(
        canonical_module_key(module).casefold()
        for module in split_pipe_value(existing.get("selected_modules", ""))
    )
    new_modules = sorted(
        canonical_module_key(module).casefold()
        for module in split_pipe_value(submission_row.get("selected_modules", ""))
    )
    if old_modules != new_modules:
        changed.append("selected_modules")
    for field in ("product_name", "prodgroup3", "operation"):
        if value_to_str(existing.get(field, "")).strip() != value_to_str(
            submission_row.get(field, "")
        ).strip():
            changed.append(field)
    return changed


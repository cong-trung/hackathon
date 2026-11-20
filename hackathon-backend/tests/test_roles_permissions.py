import csv
import os
import shutil
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


os.environ.setdefault(
    "QUALITY_MATRIX_AUTH_SECRET", "test-auth-secret-at-least-thirty-two-characters"
)

BACKEND_ROOT = Path(__file__).resolve().parents[1]
SOURCE_DATA_DIR = BACKEND_ROOT / "data"
OWNER_EMAIL = "me.owner@example.com"
OTHER_EMAIL = "other.owner@example.com"


def _write_csv(path, rows, fieldnames):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as target:
        writer = csv.DictWriter(target, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def _read_csv(path):
    with path.open(encoding="utf-8-sig", newline="") as source:
        return list(csv.DictReader(source))


def _user(username, role, status="active", email=""):
    return {
        "username": username,
        "display_name": username,
        "email": email,
        "role": role,
        "status": status,
        "password_hash": "",
    }


USERS = [
    _user("admin1", "admin", email="admin@example.com"),
    _user("admin2", "admin", email="admin2@example.com"),
    _user("ti1", "TI", email="ti@example.com"),
    _user("legacyeditor", "editor", email="legacy@example.com"),
    _user("me1", "ME", email=OWNER_EMAIL),
    _user("me2", "ME", email=OTHER_EMAIL),
    _user("viewer1", "viewer", email="viewer@example.com"),
    _user("legacyguest", "guest", email=""),
    _user("pending1", "viewer", status="pending", email="pending@example.com"),
    _user("noemail1", "viewer", email=""),
]


@pytest.fixture
def env(tmp_path, monkeypatch):
    monkeypatch.delenv("PROXY_SHARED_SECRET", raising=False)
    monkeypatch.delenv("EDIT_PIN", raising=False)
    data_dir = tmp_path / "data"
    for folder in ("QualityMatrix", "View2", "View3"):
        shutil.copytree(SOURCE_DATA_DIR / folder, data_dir / folder)

    import app.auth as auth
    import app.config as config
    import app.io.concurrency as concurrency
    import app.io.generic_csv as generic_csv
    import app.routers.auth as auth_router
    import app.services.product_action_matrix_service as matrix_service
    import app.services.pypcs_service as pypcs_service
    from app.main import app

    app.dependency_overrides.clear()
    user_file = data_dir / "Auth" / "Users.csv"
    _write_csv(user_file, USERS, auth.USER_HEADERS)

    monkeypatch.setattr(config, "DATA_DIR", data_dir)
    monkeypatch.setattr(concurrency, "DATA_DIR", data_dir)
    monkeypatch.setattr(generic_csv, "DATA_DIR", data_dir)
    monkeypatch.setattr(matrix_service, "DATA_DIR", data_dir)
    monkeypatch.setattr(auth, "USER_FILE", user_file)
    monkeypatch.setattr(auth, "AUDIT_FILE", data_dir / "Auth" / "AuditLog.csv")
    monkeypatch.setattr(auth_router, "USER_FILE", user_file, raising=False)
    pypcs_service._canonical_module_keys.cache_clear()

    client = TestClient(app)
    yield client, data_dir, auth
    client.close()
    pypcs_service._canonical_module_keys.cache_clear()


def _headers(auth, username):
    token, _expires_at = auth.issue_token(username)
    return {"Authorization": f"Bearer {token}"}


def _save(client, headers, **payload):
    body = {"status": "draft", **payload}
    return client.post("/pypcs/matrix-submission", json=body, headers=headers)


def _owned_submission(client, headers):
    """Admin creates a draft STHI submission owned by OWNER_EMAIL with a TI cell."""
    response = _save(
        client,
        headers,
        selected_modules=["STHI"],
        product_name="Owned Product",
        cells=[
            {"question_id": "product_name", "module_key": "STHI", "answer": "Owned Product"},
            {"question_id": "pdo_owner", "module_key": "STHI", "answer": OWNER_EMAIL},
        ],
    )
    assert response.status_code == 200, response.text
    return response.json()["submission_id"]


def _cells(data_dir, submission_id):
    return [
        row
        for row in _read_csv(data_dir / "QualityMatrix" / "PYPCS_SubmissionCells.csv")
        if row["submission_id"] == submission_id
    ]


# --- Roles and aliases -----------------------------------------------------


def test_legacy_role_names_are_normalized_on_read(env):
    client, _data_dir, auth = env
    editor = client.get("/auth/me", headers=_headers(auth, "legacyeditor"))
    assert editor.status_code == 200
    assert editor.json()["user"]["role"] == "ti"

    guest = client.get("/auth/me", headers=_headers(auth, "legacyguest"))
    assert guest.status_code == 200
    assert guest.json()["user"]["role"] == "viewer"


def test_auth_me_reports_permission_flags(env):
    client, _data_dir, auth = env
    admin = client.get("/auth/me", headers=_headers(auth, "admin1")).json()
    assert admin["permissions"]["is_admin"] is True
    assert admin["permissions"]["can_create_product"] is True
    assert admin["permissions"]["can_edit_action_items"] is True

    me = client.get("/auth/me", headers=_headers(auth, "me1")).json()
    assert me["permissions"]["is_admin"] is False
    assert me["permissions"]["can_create_product"] is False

    viewer = client.get("/auth/me", headers=_headers(auth, "viewer1")).json()
    assert viewer["permissions"]["can_create_product"] is False
    assert viewer["permissions"]["can_edit_action_items"] is False


def test_viewer_is_blocked_from_data_writes(env):
    client, _data_dir, auth = env
    response = client.delete(
        "/pypcs/submissions/does-not-exist", headers=_headers(auth, "viewer1")
    )
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "role_forbidden"


def test_viewer_cannot_change_password(env):
    client, _data_dir, auth = env
    response = client.post(
        "/auth/change-password",
        json={"current_password": "x", "new_password": "a-new-password-1"},
        headers=_headers(auth, "viewer1"),
    )
    assert response.status_code == 403


def test_me_cannot_delete_submission(env):
    client, _data_dir, auth = env
    response = client.delete(
        "/pypcs/submissions/does-not-exist", headers=_headers(auth, "me1")
    )
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "role_forbidden"


# --- ME scope on matrix submissions -----------------------------------------


def test_me_cannot_create_submission(env):
    client, _data_dir, auth = env
    response = _save(
        client,
        _headers(auth, "me1"),
        role="ME",
        selected_modules=["STHI"],
        cells=[{"question_id": "ppv_sw_platform", "module_key": "STHI", "answer": "SST"}],
    )
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "me_cannot_create"


def test_me_cannot_set_final_status(env):
    client, data_dir, auth = env
    submission_id = _owned_submission(client, _headers(auth, "admin1"))
    response = _save(
        client,
        _headers(auth, "me1"),
        role="ME",
        submission_id=submission_id,
        status="final",
        selected_modules=["STHI"],
        cells=[{"question_id": "ppv_sw_platform", "module_key": "STHI", "answer": "SST"}],
    )
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "me_cannot_change_status"


def test_me_save_on_owned_module_preserves_ti_cells(env):
    client, data_dir, auth = env
    submission_id = _owned_submission(client, _headers(auth, "admin1"))
    response = _save(
        client,
        _headers(auth, "me1"),
        role="ME",
        submission_id=submission_id,
        selected_modules=["STHI"],
        cells=[
            {"question_id": "ppv_sw_platform", "module_key": "STHI", "answer": "SST"},
        ],
    )
    assert response.status_code == 200, response.text

    cells = _cells(data_dir, submission_id)
    by_question = {row["question_id"]: row for row in cells}
    assert by_question["product_name"]["answer"] == "Owned Product"
    assert by_question["pdo_owner"]["answer"] == OWNER_EMAIL
    assert by_question["ppv_sw_platform"]["answer"] == "SST"


def test_me_cannot_change_submission_fields_on_owned_module(env):
    client, _data_dir, auth = env
    submission_id = _owned_submission(client, _headers(auth, "admin1"))
    response = _save(
        client,
        _headers(auth, "me1"),
        role="ME",
        submission_id=submission_id,
        selected_modules=["STHI"],
        product_name="Hijacked",
        cells=[
            {"question_id": "ppv_sw_platform", "module_key": "STHI", "answer": "SST"},
        ],
    )
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "forbidden_fields"


def test_me_cannot_save_module_owned_by_someone_else(env):
    client, _data_dir, auth = env
    submission_id = _owned_submission(client, _headers(auth, "admin1"))
    response = _save(
        client,
        _headers(auth, "me2"),
        role="ME",
        submission_id=submission_id,
        selected_modules=["STHI"],
        cells=[{"question_id": "ppv_sw_platform", "module_key": "STHI", "answer": "SST"}],
    )
    assert response.status_code == 403


def test_me_save_without_role_is_rejected(env):
    client, data_dir, auth = env
    submission_id = _owned_submission(client, _headers(auth, "admin1"))
    before = _cells(data_dir, submission_id)
    response = _save(
        client,
        _headers(auth, "me1"),
        submission_id=submission_id,
        selected_modules=["STHI"],
        cells=[{"question_id": "ppv_sw_platform", "module_key": "STHI", "answer": "SST"}],
    )
    assert response.status_code == 403
    assert _cells(data_dir, submission_id) == before


# --- Submission permission flags -------------------------------------------


def test_submission_detail_permissions_per_role(env):
    client, _data_dir, auth = env
    submission_id = _owned_submission(client, _headers(auth, "admin1"))
    path = f"/pypcs/submissions/{submission_id}"

    admin = client.get(path, headers=_headers(auth, "admin1")).json()["permissions"]
    assert admin["can_edit"] is True
    assert admin["can_final"] is True
    assert admin["can_delete"] is True

    owner = client.get(path, headers=_headers(auth, "me1")).json()["permissions"]
    assert owner["can_edit"] is True
    assert owner["can_final"] is False
    assert owner["can_delete"] is False
    assert owner["editable_modules"] == ["STHI"]

    stranger = client.get(path, headers=_headers(auth, "me2")).json()["permissions"]
    assert stranger["can_edit"] is False

    viewer = client.get(path, headers=_headers(auth, "viewer1")).json()["permissions"]
    assert viewer["can_edit"] is False


def test_submission_list_flags_for_anonymous_and_owner(env):
    client, _data_dir, auth = env
    submission_id = _owned_submission(client, _headers(auth, "admin1"))

    anonymous = client.get("/pypcs/submissions")
    assert anonymous.status_code == 200
    anonymous_item = next(
        item for item in anonymous.json()["items"] if item["submission_id"] == submission_id
    )
    assert anonymous_item["can_edit"] is False

    owner = client.get("/pypcs/submissions", headers=_headers(auth, "me1"))
    owner_item = next(
        item for item in owner.json()["items"] if item["submission_id"] == submission_id
    )
    assert owner_item["can_edit"] is True
    assert owner_item["can_delete"] is False


def test_product_action_matrix_can_edit_follows_ownership(env):
    client, _data_dir, auth = env
    _owned_submission(client, _headers(auth, "admin1"))

    response = client.get(
        "/pypcs/product-action-matrix", headers=_headers(auth, "me1")
    )
    assert response.status_code == 200
    for row in response.json()["rows"]:
        assert isinstance(row["can_edit"], bool)
        if row["can_edit"]:
            modules = [str(module).casefold() for module in row["module_keys"]]
            assert "sthi" in modules

    anonymous = client.get("/pypcs/product-action-matrix")
    assert all(row["can_edit"] is False for row in anonymous.json()["rows"])


def test_product_action_matrix_write_blocked_for_viewer(env):
    client, _data_dir, auth = env
    response = client.put(
        "/pypcs/product-action-matrix/rows",
        json={"rows": []},
        headers=_headers(auth, "viewer1"),
    )
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "role_forbidden"


# --- Role change endpoint -----------------------------------------------------


def test_admin_can_change_role(env):
    client, _data_dir, auth = env
    response = client.patch(
        "/auth/users/viewer1/role",
        json={"role": "ti"},
        headers=_headers(auth, "admin1"),
    )
    assert response.status_code == 200, response.text
    assert response.json()["user"]["role"] == "ti"


def test_admin_can_promote_to_me_with_email(env):
    client, _data_dir, auth = env
    response = client.patch(
        "/auth/users/viewer1/role",
        json={"role": "ME"},
        headers=_headers(auth, "admin1"),
    )
    assert response.status_code == 200, response.text
    assert response.json()["user"]["role"] == "me"


def test_role_change_rejects_non_admin(env):
    client, _data_dir, auth = env
    response = client.patch(
        "/auth/users/viewer1/role",
        json={"role": "ti"},
        headers=_headers(auth, "ti1"),
    )
    assert response.status_code == 403


def test_role_change_rejects_invalid_role(env):
    client, _data_dir, auth = env
    response = client.patch(
        "/auth/users/viewer1/role",
        json={"role": "superuser"},
        headers=_headers(auth, "admin1"),
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "invalid_role"


def test_admin_cannot_change_own_role(env):
    client, _data_dir, auth = env
    response = client.patch(
        "/auth/users/admin1/role",
        json={"role": "ti"},
        headers=_headers(auth, "admin1"),
    )
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "cannot_change_own_role"


def test_role_change_requires_email_for_me(env):
    client, _data_dir, auth = env
    response = client.patch(
        "/auth/users/noemail1/role",
        json={"role": "ME"},
        headers=_headers(auth, "admin1"),
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "email_required_for_me"


def test_role_change_rejects_pending_account(env):
    client, _data_dir, auth = env
    response = client.patch(
        "/auth/users/pending1/role",
        json={"role": "ti"},
        headers=_headers(auth, "admin1"),
    )
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "account_pending"


def test_role_change_unknown_user(env):
    client, _data_dir, auth = env
    response = client.patch(
        "/auth/users/nobody/role",
        json={"role": "ti"},
        headers=_headers(auth, "admin1"),
    )
    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "user_not_found"


# --- Duplicate ticket --------------------------------------------------------


def _set_submission_status(data_dir, submission_id, status):
    path = data_dir / "QualityMatrix" / "PYPCS_Submissions.csv"
    rows = _read_csv(path)
    for row in rows:
        if row["submission_id"] == submission_id:
            row["status"] = status
    _write_csv(path, rows, list(rows[0]))


def _duplicate(client, headers, submission_id):
    return client.post(
        f"/pypcs/submissions/{submission_id}/duplicate", headers=headers
    )


def _cells_by_question(data_dir, submission_id):
    return {
        row["question_id"]: row["answer"] for row in _cells(data_dir, submission_id)
    }


def test_ti_can_duplicate_saved_draft_into_new_draft(env):
    client, data_dir, auth = env
    source_id = _owned_submission(client, _headers(auth, "admin1"))

    response = _duplicate(client, _headers(auth, "ti1"), source_id)
    assert response.status_code == 201, response.text
    result = response.json()
    new_id = result["submission_id"]

    assert new_id != source_id
    assert result["duplicated_from"] == source_id
    assert result["status"] == "draft"
    assert result["selected_modules"] == ["STHI"]
    assert result["versions"], "versions must be returned for conflict checks"

    # The copy carries every cell of the source draft.
    assert _cells_by_question(data_dir, new_id) == _cells_by_question(
        data_dir, source_id
    )

    # The source ticket is untouched.
    source_detail = client.get(
        f"/pypcs/submissions/{source_id}", headers=_headers(auth, "admin1")
    ).json()
    assert source_detail["submission"]["status"] == "draft"
    assert source_detail["submission"]["product_name"] == "Owned Product"

    # The change log records the new ticket and where it came from.
    created = [
        row
        for row in _read_csv(data_dir / "Auth" / "ChangeLog.csv")
        if row["entity_id"] == new_id
    ]
    assert created and all(row["action"] == "create" for row in created)
    assert any(
        row["field"] == "duplicated_from" and row["new_value"] == source_id
        for row in created
    )


def test_admin_can_duplicate_saved_draft(env):
    client, _data_dir, auth = env
    source_id = _owned_submission(client, _headers(auth, "admin1"))

    response = _duplicate(client, _headers(auth, "admin1"), source_id)
    assert response.status_code == 201, response.text
    assert response.json()["submission_id"] != source_id


def test_duplicate_rejects_non_draft_submissions(env):
    client, data_dir, auth = env
    source_id = _owned_submission(client, _headers(auth, "admin1"))

    for status in ("waiting_me", "final"):
        _set_submission_status(data_dir, source_id, status)
        response = _duplicate(client, _headers(auth, "ti1"), source_id)
        assert response.status_code == 409, response.text
        assert response.json()["detail"]["code"] == "not_draft"


def test_duplicate_unknown_submission_returns_404(env):
    client, _data_dir, auth = env
    response = _duplicate(client, _headers(auth, "ti1"), "missing-ticket")
    assert response.status_code == 404


def test_me_and_viewer_cannot_duplicate(env):
    client, _data_dir, auth = env
    source_id = _owned_submission(client, _headers(auth, "admin1"))

    for username in ("me1", "viewer1"):
        response = _duplicate(client, _headers(auth, username), source_id)
        assert response.status_code == 403
        assert response.json()["detail"]["code"] == "role_forbidden"


def test_editing_after_duplicate_updates_only_the_new_ticket(env):
    client, data_dir, auth = env
    source_id = _owned_submission(client, _headers(auth, "admin1"))
    new_id = _duplicate(
        client, _headers(auth, "ti1"), source_id
    ).json()["submission_id"]

    response = _save(
        client,
        _headers(auth, "ti1"),
        submission_id=new_id,
        role="TI",
        selected_modules=["STHI"],
        product_name="Renamed After Duplicate",
        cells=[
            {
                "question_id": "product_name",
                "module_key": "STHI",
                "answer": "Renamed After Duplicate",
            },
            {"question_id": "pdo_owner", "module_key": "STHI", "answer": OWNER_EMAIL},
        ],
    )
    assert response.status_code == 200, response.text

    assert (
        _cells_by_question(data_dir, new_id)["product_name"]
        == "Renamed After Duplicate"
    )
    assert _cells_by_question(data_dir, source_id)["product_name"] == "Owned Product"

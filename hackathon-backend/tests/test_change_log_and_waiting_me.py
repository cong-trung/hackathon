import csv
import logging
import os
import shutil
import smtplib
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient


os.environ.setdefault(
    "QUALITY_MATRIX_AUTH_SECRET", "test-auth-secret-at-least-thirty-two-characters"
)

BACKEND_ROOT = Path(__file__).resolve().parents[1]
SOURCE_DATA_DIR = BACKEND_ROOT / "data"
QUESTION_MODULE_MAP = "QualityMatrix/Settings/PYPCS_QuestionModuleMap.csv"

MODULES = ["STHI", "HDMx_Class"]
PRODUCT = "Workflow Product"
PRODGROUP3 = "GNRLCP/GNRLR1S"
OWNER_EMAIL = "me.owner@example.com"
GROUP_EMAIL = "group.dl@example.com"
PASSWORD = "old-password-1"
OWNERS = {"STHI": OWNER_EMAIL, "HDMx_Class": OWNER_EMAIL.upper()}
# Only these cells are required in the test copy: TI cells for STHI and the ME cell for STHI.
REQUIRED_IN_TEST = {
    ("product_group_email", "STHI"),
    ("nsb", "STHI"),
    ("ppv_sw_platform", "STHI"),
}


def _write_csv(path, rows, fieldnames):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as target:
        writer = csv.DictWriter(target, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def _read_csv(path):
    with path.open(encoding="utf-8-sig", newline="") as source:
        return list(csv.DictReader(source))


def _user(username, display, email, role, status="active", password_hash=""):
    return {
        "username": username,
        "display_name": display,
        "email": email,
        "role": role,
        "status": status,
        "password_hash": password_hash,
    }


USERS = [
    _user("admin1", "Admin One", "admin@example.com", "admin"),
    _user("ti1", "TI One", "ti@example.com", "ti"),
    _user("me1", "ME One", OWNER_EMAIL, "me"),
    _user("pwuser", "PW User", "pw@example.com", "ti"),
    _user("pending1", "Pending", "pending@example.com", "viewer", status="pending"),
]


class FakeSMTP:
    """Stands in for smtplib.SMTP so no real mail is sent."""

    sent = []

    def __init__(self, host, port, timeout=None):
        self.host = host
        self.port = port

    def __enter__(self):
        return self

    def __exit__(self, *exc_info):
        return False

    def starttls(self, context=None):
        return None

    def login(self, username, password):
        return None

    def send_message(self, message, to_addrs=None):
        FakeSMTP.sent.append(message)


@pytest.fixture
def env(tmp_path, monkeypatch):
    monkeypatch.delenv("PROXY_SHARED_SECRET", raising=False)
    monkeypatch.delenv("EDIT_PIN", raising=False)
    data_dir = tmp_path / "data"
    for folder in ("QualityMatrix", "View2", "View3"):
        shutil.copytree(SOURCE_DATA_DIR / folder, data_dir / folder)

    map_path = data_dir / QUESTION_MODULE_MAP
    map_rows = _read_csv(map_path)
    for row in map_rows:
        key = (row["question_id"], row["module_key"])
        row["required"] = "Y" if key in REQUIRED_IN_TEST else "N"
    _write_csv(map_path, map_rows, list(map_rows[0]))

    import app.auth as auth
    import app.config as config
    import app.io.concurrency as concurrency
    import app.io.generic_csv as generic_csv
    import app.routers.auth as auth_router
    import app.services.notification_service as notification_service
    import app.services.product_action_matrix_service as matrix_service
    import app.services.pypcs_service as pypcs_service
    from app.main import app

    app.dependency_overrides.clear()
    users = [dict(row) for row in USERS]
    for row in users:
        if row["username"] == "pwuser":
            row["password_hash"] = auth.hash_password(PASSWORD)
    user_file = data_dir / "Auth" / "Users.csv"
    _write_csv(user_file, users, auth.USER_HEADERS)

    monkeypatch.setattr(config, "DATA_DIR", data_dir)
    monkeypatch.setattr(concurrency, "DATA_DIR", data_dir)
    monkeypatch.setattr(generic_csv, "DATA_DIR", data_dir)
    monkeypatch.setattr(matrix_service, "DATA_DIR", data_dir)
    monkeypatch.setattr(auth, "USER_FILE", user_file)
    monkeypatch.setattr(auth, "AUDIT_FILE", data_dir / "Auth" / "AuditLog.csv")
    monkeypatch.setattr(auth_router, "USER_FILE", user_file, raising=False)

    FakeSMTP.sent = []
    monkeypatch.setattr(notification_service.smtplib, "SMTP", FakeSMTP)
    monkeypatch.setattr(notification_service, "QUALITY_MATRIX_MAIL_TRANSPORT", "smtp")
    monkeypatch.setattr(notification_service, "QUALITY_MATRIX_SMTP_HOST", "smtp.test")
    monkeypatch.setattr(notification_service, "QUALITY_MATRIX_SMTP_PORT", 2525)
    monkeypatch.setattr(notification_service, "QUALITY_MATRIX_SMTP_STARTTLS", False)
    monkeypatch.setattr(notification_service, "QUALITY_MATRIX_SMTP_USERNAME", "")
    pypcs_service._canonical_module_keys.cache_clear()

    client = TestClient(app)
    yield SimpleNamespace(client=client, data_dir=data_dir, auth=auth, smtp=FakeSMTP)
    client.close()
    pypcs_service._canonical_module_keys.cache_clear()


def _headers(env, username):
    token, _expires_at = env.auth.issue_token(username)
    return {"Authorization": f"Bearer {token}"}


def _cell(question_id, module_key, answer):
    return {"question_id": question_id, "module_key": module_key, "answer": answer}


def _ti_body(status, *, product=PRODUCT, nsb="N", submission_id=None, omit=()):
    cells = []
    for module in MODULES:
        cells.append(_cell("product_name", module, product))
        cells.append(_cell("prodgroup3", module, PRODGROUP3))
        if OWNERS.get(module):
            cells.append(_cell("pdo_owner", module, OWNERS[module]))
    cells.append(_cell("product_group_email", "STHI", GROUP_EMAIL))
    cells.append(_cell("nsb", "STHI", nsb))
    body = {
        "status": status,
        "role": "TI",
        "selected_modules": MODULES,
        "product_name": product,
        "prodgroup3": PRODGROUP3,
        "cells": [cell for cell in cells if cell["question_id"] not in omit],
    }
    if submission_id:
        body["submission_id"] = submission_id
    return body


def _me_body(submission_id, status="waiting_me", answer="SST"):
    return {
        "status": status,
        "role": "ME",
        "submission_id": submission_id,
        "selected_modules": MODULES,
        "product_name": PRODUCT,
        "prodgroup3": PRODGROUP3,
        "cells": [_cell("ppv_sw_platform", "STHI", answer)],
    }


def _save(env, username, body):
    return env.client.post(
        "/pypcs/matrix-submission", json=body, headers=_headers(env, username)
    )


def _change_rows(env, **params):
    response = env.client.get(
        "/admin/changes", params=params, headers=_headers(env, "admin1")
    )
    assert response.status_code == 200, response.text
    return response.json()["items"]


def _find(rows, **expected):
    return [row for row in rows if all(row.get(k) == v for k, v in expected.items())]


# ---------- change log ----------


def test_product_info_edits_are_recorded_field_by_field(env):
    response = _save(env, "admin1", _ti_body("draft", product="Old Name", nsb="N"))
    assert response.status_code == 200, response.text
    sid = response.json()["submission_id"]

    response = _save(
        env, "admin1", _ti_body("draft", product="New Name", nsb="Y", submission_id=sid)
    )
    assert response.status_code == 200, response.text

    rows = _change_rows(env, entity_type="product_info", entity_id=sid)
    assert _find(rows, action="create"), rows
    renamed = [r for r in rows if r["old_value"] == "Old Name" and r["new_value"] == "New Name"]
    assert renamed and all(r["action"] == "update" for r in renamed)
    nsb_changes = [r for r in rows if "nsb" in r["field"] and r["old_value"] == "N" and r["new_value"] == "Y"]
    assert nsb_changes
    # One save shares one request_id across all of its field rows.
    assert len({r["request_id"] for r in renamed + nsb_changes}) == 1


def test_status_transition_is_recorded(env):
    sid = _save(env, "admin1", _ti_body("draft")).json()["submission_id"]
    assert _save(env, "admin1", _ti_body("waiting_me", submission_id=sid)).status_code == 200

    rows = _change_rows(env, entity_type="product_info", entity_id=sid)
    transitions = _find(rows, field="status", action="status_change")
    assert any(r["old_value"] == "draft" and r["new_value"] == "waiting_me" for r in transitions)


def test_deleting_submission_records_old_values(env):
    sid = _save(env, "admin1", _ti_body("draft")).json()["submission_id"]
    response = env.client.delete(f"/pypcs/submissions/{sid}", headers=_headers(env, "admin1"))
    assert response.status_code == 200, response.text

    rows = _change_rows(env, entity_type="product_info", entity_id=sid)
    deletes = _find(rows, action="delete")
    assert deletes
    assert any(r["old_value"] == PRODUCT for r in deletes)
    assert all(r["new_value"] == "" for r in deletes)


def test_action_item_create_update_delete_are_recorded_and_exported_safely(env):
    payload = {
        "actionable_item": "=SUM(1,2)",
        "reference": "REF",
        "owner": "Owner",
        "module": ["STHI"],
    }
    created = env.client.post(
        "/pypcs/action-items", json=payload, headers=_headers(env, "admin1")
    )
    assert created.status_code == 201, created.text
    nbr = created.json()["nbr"]

    updated = dict(payload, actionable_item="Changed item")
    assert env.client.put(
        f"/pypcs/action-items/{nbr}", json=updated, headers=_headers(env, "admin1")
    ).status_code == 200
    assert env.client.delete(
        f"/pypcs/action-items/{nbr}", headers=_headers(env, "admin1")
    ).status_code == 200

    rows = _change_rows(env, entity_type="action_item", entity_id=str(nbr))
    assert _find(rows, action="create", field="actionable_item", new_value="=SUM(1,2)")
    assert _find(rows, action="update", old_value="=SUM(1,2)", new_value="Changed item")
    assert _find(rows, action="delete", old_value="Changed item")

    export = env.client.get(
        "/admin/changes/export.csv",
        params={"entity_type": "action_item"},
        headers=_headers(env, "admin1"),
    )
    assert export.status_code == 200
    assert export.headers["content-type"].startswith("text/csv")
    assert "attachment" in export.headers["content-disposition"]
    assert "change-log-" in export.headers["content-disposition"]
    assert export.headers["cache-control"] == "no-store"
    text = export.content.decode("utf-8-sig")
    assert "'=SUM(1,2)" in text


def test_password_change_is_logged_without_values(env):
    response = env.client.post(
        "/auth/change-password",
        json={"current_password": PASSWORD, "new_password": "new-password-2"},
        headers=_headers(env, "pwuser"),
    )
    assert response.status_code == 200, response.text

    rows = _change_rows(env, entity_type="user", entity_id="pwuser")
    assert _find(rows, action="password_change", field="password")
    raw = (env.data_dir / "Auth" / "ChangeLog.csv").read_text(encoding="utf-8-sig")
    assert "new-password-2" not in raw
    assert PASSWORD not in raw


def test_role_change_and_approval_are_logged(env):
    response = env.client.patch(
        "/auth/users/ti1/role", json={"role": "me"}, headers=_headers(env, "admin1")
    )
    assert response.status_code == 200, response.text
    rows = _change_rows(env, entity_type="user", entity_id="ti1")
    assert _find(rows, action="role_change", field="role", new_value="me")

    response = env.client.post(
        "/auth/users/pending1/approve", json={"role": "ti"}, headers=_headers(env, "admin1")
    )
    assert response.status_code == 200, response.text
    rows = _change_rows(env, entity_type="user", entity_id="pending1")
    assert _find(rows, action="approve", field="status", old_value="pending", new_value="active")


def test_change_log_endpoints_are_admin_only_and_filter(env):
    _save(env, "admin1", _ti_body("draft", product="Filter Marker"))

    assert env.client.get("/admin/changes", headers=_headers(env, "ti1")).status_code == 403
    assert env.client.get("/admin/changes/export.csv", headers=_headers(env, "ti1")).status_code == 403
    assert env.client.get("/admin/changes").status_code in (401, 403)

    bad_type = env.client.get(
        "/admin/changes", params={"entity_type": "bogus"}, headers=_headers(env, "admin1")
    )
    assert bad_type.status_code == 422
    assert "invalid_entity_type" in bad_type.text

    bad_date = env.client.get(
        "/admin/changes", params={"from": "not-a-date"}, headers=_headers(env, "admin1")
    )
    assert bad_date.status_code == 422
    assert "invalid_date" in bad_date.text

    limited = env.client.get(
        "/admin/changes", params={"limit": 2}, headers=_headers(env, "admin1")
    ).json()
    assert len(limited["items"]) <= 2
    assert limited["total"] >= len(limited["items"])

    by_user = _change_rows(env, username="ADMIN1")
    assert by_user and all(row["username"] == "admin1" for row in by_user)

    by_query = _change_rows(env, q="Filter Marker")
    assert by_query and all("Filter Marker" in row["ticket_label"] for row in by_query)


# ---------- waiting_me workflow ----------


def test_waiting_me_requires_only_ti_cells(env):
    response = _save(env, "admin1", _ti_body("waiting_me"))
    assert response.status_code == 200, response.text
    sid = response.json()["submission_id"]

    listing = env.client.get("/pypcs/submissions", headers=_headers(env, "admin1")).json()
    item = next(i for i in listing["items"] if i["submission_id"] == sid)
    assert item["status"] == "waiting_me"
    assert item["can_submit_ti"] is False


def test_waiting_me_rejects_missing_ti_required_cell(env):
    response = _save(env, "admin1", _ti_body("waiting_me", omit=("nsb",)))
    assert response.status_code == 400
    assert "nsb" in response.text


def test_final_requires_ti_and_me_required_cells(env):
    sid = _save(env, "admin1", _ti_body("waiting_me")).json()["submission_id"]

    missing_me = _save(env, "admin1", _ti_body("final", submission_id=sid))
    assert missing_me.status_code == 400
    assert "ppv_sw_platform" in missing_me.text

    assert _save(env, "me1", _me_body(sid, status="waiting_me")).status_code == 200

    final = _save(env, "admin1", _ti_body("final", submission_id=sid))
    assert final.status_code == 200, final.text


def test_me_saves_on_waiting_me_but_cannot_change_status(env):
    sid = _save(env, "admin1", _ti_body("waiting_me")).json()["submission_id"]

    assert _save(env, "me1", _me_body(sid, status="waiting_me")).status_code == 200

    for status in ("final", "draft"):
        response = _save(env, "me1", _me_body(sid, status=status))
        assert response.status_code == 403
        assert "me_cannot_change_status" in response.text


def test_waiting_me_emails_pdo_owner_once_per_address(env):
    response = _save(env, "admin1", _ti_body("waiting_me"))
    assert response.status_code == 200, response.text

    assert len(env.smtp.sent) == 1
    message = env.smtp.sent[0]
    assert message["To"] == OWNER_EMAIL
    from app.services.notification_service import QUALITY_MATRIX_MAIL_FROM

    assert message["From"] == QUALITY_MATRIX_MAIL_FROM
    assert message["Reply-To"] == "admin@example.com"
    assert message["Subject"] == (
        f"[Quality Matrix] admin1 needs ME input for {PRODUCT} ({PRODGROUP3})"
    )
    plain = message.get_body(preferencelist=("plain",)).get_content()
    assert "/product-info?submission=" in plain
    assert "module=STHI" in plain
    assert "module=HDMx_Class" in plain


def test_draft_to_waiting_me_emails_once_and_resave_does_not_repeat(env):
    sid = _save(env, "admin1", _ti_body("draft")).json()["submission_id"]
    assert env.smtp.sent == []

    assert _save(env, "admin1", _ti_body("waiting_me", submission_id=sid)).status_code == 200
    assert len(env.smtp.sent) == 1

    assert _save(env, "admin1", _ti_body("waiting_me", submission_id=sid)).status_code == 200
    assert len(env.smtp.sent) == 1


def test_waiting_me_email_not_resent_after_returning_to_draft(env):
    sid = _save(env, "admin1", _ti_body("waiting_me")).json()["submission_id"]
    assert len(env.smtp.sent) == 1

    assert _save(env, "admin1", _ti_body("draft", submission_id=sid)).status_code == 200
    assert _save(env, "admin1", _ti_body("waiting_me", submission_id=sid)).status_code == 200
    assert len(env.smtp.sent) == 1


def test_owner_email_outside_allowed_domains_is_rejected(env):
    body = _ti_body("draft")
    for cell in body["cells"]:
        if cell["question_id"] == "pdo_owner" and cell["module_key"] == "STHI":
            cell["answer"] = "owner@outside.org"

    response = _save(env, "admin1", body)

    assert response.status_code == 422
    assert "Email domain not allowed: owner@outside.org" in response.text
    assert env.smtp.sent == []


def test_me_save_keeps_submitted_by_of_ti_creator(env):
    sid = _save(env, "ti1", _ti_body("waiting_me")).json()["submission_id"]
    assert _save(env, "me1", _me_body(sid, status="waiting_me")).status_code == 200

    listing = env.client.get("/pypcs/submissions", headers=_headers(env, "admin1")).json()
    item = next(i for i in listing["items"] if i["submission_id"] == sid)
    assert item["submitted_by"] == "ti1"


def test_anonymous_submission_list_omits_pdo_owner_emails(env):
    sid = _save(env, "admin1", _ti_body("draft")).json()["submission_id"]

    anonymous = env.client.get("/pypcs/submissions").json()
    item = next(i for i in anonymous["items"] if i["submission_id"] == sid)
    assert "pdo_owner_emails" not in item

    authed = env.client.get("/pypcs/submissions", headers=_headers(env, "admin1")).json()
    item = next(i for i in authed["items"] if i["submission_id"] == sid)
    assert any(email.casefold() == OWNER_EMAIL for email in item["pdo_owner_emails"])


def test_matrix_save_without_status_defaults_to_draft(env):
    body = _ti_body("draft")
    del body["status"]

    response = _save(env, "admin1", body)

    assert response.status_code == 200, response.text
    assert response.json()["status"] == "draft"
    assert env.smtp.sent == []


def test_waiting_me_without_owner_logs_warning_and_sends_nothing(env, caplog):
    caplog.set_level(logging.WARNING)
    body = _ti_body("waiting_me")
    body["cells"] = [cell for cell in body["cells"] if cell["question_id"] != "pdo_owner"]

    response = _save(env, "admin1", body)
    assert response.status_code == 200, response.text
    assert env.smtp.sent == []
    assert "no valid PdO owner emails" in caplog.text


def test_final_after_waiting_me_notifies_owners(env):
    sid = _save(env, "admin1", _ti_body("waiting_me")).json()["submission_id"]
    assert _save(env, "me1", _me_body(sid, status="waiting_me")).status_code == 200
    assert len(env.smtp.sent) == 1

    assert _save(env, "admin1", _ti_body("final", submission_id=sid)).status_code == 200
    # One waiting_me mail plus one final mail each for the PdO owner and the product group email.
    assert len(env.smtp.sent) == 3
    final_recipients = sorted(message["To"] for message in env.smtp.sent[1:])
    assert final_recipients == sorted([OWNER_EMAIL, GROUP_EMAIL])
    assert all(message["Subject"].endswith("for review") for message in env.smtp.sent[1:])


def test_admin_edit_of_final_is_admin_only_and_sends_no_mail(env):
    sid = _save(env, "admin1", _ti_body("waiting_me")).json()["submission_id"]
    assert _save(env, "me1", _me_body(sid, status="waiting_me")).status_code == 200
    assert _save(env, "admin1", _ti_body("final", submission_id=sid)).status_code == 200
    sent_before = len(env.smtp.sent)

    ti_edit = _save(env, "ti1", _ti_body("final", product="TI Edit", submission_id=sid))
    assert ti_edit.status_code == 403
    assert ti_edit.json()["detail"]["code"] == "admin_required"

    admin_edit = _save(env, "admin1", _ti_body("final", product="Edited Final", submission_id=sid))
    assert admin_edit.status_code == 200, admin_edit.text
    assert len(env.smtp.sent) == sent_before


def test_waiting_me_email_links_point_to_each_module(env):
    from app.config import QUALITY_MATRIX_PUBLIC_URL

    sid = _save(env, "admin1", _ti_body("waiting_me")).json()["submission_id"]
    plain = env.smtp.sent[0].get_body(preferencelist=("plain",)).get_content()
    assert f"- STHI: {QUALITY_MATRIX_PUBLIC_URL}/product-info?submission={sid}&module=STHI" in plain
    assert f"- HDMx_Class: {QUALITY_MATRIX_PUBLIC_URL}/product-info?submission={sid}&module=HDMx_Class" in plain
    assert f"Open Product Info: {QUALITY_MATRIX_PUBLIC_URL}/product-info" in plain


def test_matrix_decision_put_is_recorded_as_one_request(env):
    nbr = env.client.post(
        "/pypcs/action-items",
        json={"actionable_item": "Matrix item", "reference": "REF", "owner": "Owner", "module": ["STHI"]},
        headers=_headers(env, "admin1"),
    ).json()["nbr"]
    _save(env, "admin1", _ti_body("draft", product="Matrix Product"))
    matrix = env.client.get("/pypcs/product-action-matrix").json()
    row = next(
        r for r in matrix["rows"]
        if r["module_group"] == "STHI" and str(nbr) in r["cells"]
    )

    response = env.client.put(
        "/pypcs/product-action-matrix/rows",
        json={
            "product_key": row["product_key"],
            "module_group": "STHI",
            "mode": "final",
            "cells": [{"action_nbr": nbr, "status": "Y", "comment": "Reviewed"}],
        },
        headers=_headers(env, "admin1"),
    )
    assert response.status_code == 200, response.text

    rows = _change_rows(
        env, entity_type="matrix_decision", entity_id=f"{row['product_key']}|STHI|{nbr}"
    )
    assert _find(rows, field="status", old_value="", new_value="Y")
    assert _find(rows, field="comment", new_value="Reviewed")
    assert len({r["request_id"] for r in rows}) == 1


def test_change_log_offset_pages_newest_first(env):
    _save(env, "admin1", _ti_body("draft", product="Page One"))
    _save(env, "admin1", _ti_body("draft", product="Page Two"))
    everything = env.client.get(
        "/admin/changes", params={"limit": 1000}, headers=_headers(env, "admin1")
    ).json()
    page = env.client.get(
        "/admin/changes", params={"limit": 1, "offset": 1}, headers=_headers(env, "admin1")
    ).json()
    assert page["total"] == everything["total"]
    assert page["items"] == everything["items"][1:2]
    assert env.client.get(
        "/admin/changes", params={"limit": 1001}, headers=_headers(env, "admin1")
    ).status_code == 422

import os
import shutil
import tempfile
import csv
from pathlib import Path
import pytest

TEST_DATA_DIR = Path(tempfile.mkdtemp(prefix="thematrix-auth-tests-"))
os.environ["QUALITY_MATRIX_DATA_DIR"] = str(TEST_DATA_DIR)
os.environ["QUALITY_MATRIX_AUTH_SECRET"] = "test-auth-secret-at-least-thirty-two-characters"
os.environ["QUALITY_MATRIX_TRUSTED_PROXIES"] = "127.0.0.1,::1"
os.environ["QUALITY_MATRIX_ADMIN_USERNAME"] = "rootadmin"
os.environ["QUALITY_MATRIX_ADMIN_PASSWORD"] = "root-admin-password"

from fastapi.testclient import TestClient
from starlette.requests import Request

from app.auth import hash_password, issue_token, verify_password, verify_token
from app.routers import auth as auth_router
from app.main import app


@pytest.fixture(autouse=True)
def clear_login_failures():
    with auth_router._LOGIN_FAILURES_LOCK:
        auth_router._LOGIN_FAILURES.clear()


def login(client, username, password, headers=None):
    return client.post(
        "/auth/login",
        json={"username": username, "password": password},
        headers=headers,
    )


def admin_headers(client):
    result = login(client, "rootadmin", "root-admin-password")
    assert result.status_code == 200
    return {"Authorization": f"Bearer {result.json()['token']}"}


def test_password_and_token_roundtrip():
    stored = hash_password("correct horse battery")
    assert stored.startswith("scrypt$16384$8$1$")
    assert verify_password("correct horse battery", stored)
    assert not verify_password("wrong", stored)
    token, _expires_at = issue_token("test-user")
    assert verify_token(token)["sub"] == "test-user"


def test_request_approval_and_login():
    shutil.rmtree(TEST_DATA_DIR, ignore_errors=True)
    with TestClient(app) as client:
        requested = client.post(
            "/auth/request-account",
            json={
                "username": "New.Editor",
                "display_name": "New Editor",
                "email": "editor@example.com",
                "password": "a-secure-password",
            },
        )
        assert requested.status_code == 201
        assert requested.json()["user"]["status"] == "pending"
        assert "password_hash" not in requested.json()["user"]
        pending = login(client, "new.editor", "a-secure-password")
        assert pending.status_code == 403
        assert pending.json()["detail"]["code"] == "account_pending"

        headers = admin_headers(client)
        approved = client.post(
            "/auth/users/new.editor/approve", json={"role": "editor"}, headers=headers
        )
        assert approved.status_code == 200
        signed_in = login(client, "NEW.EDITOR", "a-secure-password")
        assert signed_in.status_code == 200
        assert signed_in.json()["user"]["username"] == "new.editor"
        assert "password_hash" not in signed_in.json()["user"]


@pytest.mark.parametrize("email", ["=formula@example.com", "\nuser@example.com"])
def test_email_formula_prefix_or_control_character_is_rejected(email):
    shutil.rmtree(TEST_DATA_DIR, ignore_errors=True)
    with TestClient(app) as client:
        response = client.post(
            "/auth/request-account",
            json={
                "username": "emailuser",
                "display_name": "Email User",
                "email": email,
                "password": "a-secure-password",
            },
        )
        assert response.status_code == 422
        assert response.json()["detail"]["code"] == "invalid_email"


def test_approve_requires_explicit_role():
    shutil.rmtree(TEST_DATA_DIR, ignore_errors=True)
    with TestClient(app) as client:
        response = client.post(
            "/auth/users/someuser/approve", headers=admin_headers(client)
        )
        assert response.status_code == 422


def test_client_ip_uses_forwarded_hop_only_for_trusted_proxy():
    trusted_request = Request(
        {
            "type": "http",
            "headers": [(b"x-forwarded-for", b"198.51.100.10, 203.0.113.1")],
            "client": ("127.0.0.1", 5100),
        }
    )
    untrusted_request = Request(
        {
            "type": "http",
            "headers": [(b"x-forwarded-for", b"198.51.100.10")],
            "client": ("198.51.100.20", 5100),
        }
    )
    assert auth_router._client_ip(trusted_request) == "198.51.100.10"
    assert auth_router._client_ip(untrusted_request) == "198.51.100.20"


def test_per_ip_and_user_login_throttles_are_independent(monkeypatch):
    shutil.rmtree(TEST_DATA_DIR, ignore_errors=True)
    monkeypatch.setattr(
        auth_router,
        "_client_ip",
        lambda request: request.headers.get("x-test-client-ip", "testclient"),
    )
    with TestClient(app) as client:
        headers = admin_headers(client)
        for username in ("victimuser", "otheruser"):
            requested = client.post(
                "/auth/request-account",
                json={
                    "username": username,
                    "display_name": username,
                    "password": "a-secure-password",
                },
            )
            assert requested.status_code == 201
            approved = client.post(
                f"/auth/users/{username}/approve",
                json={"role": "editor"},
                headers=headers,
            )
            assert approved.status_code == 200

        attacker = {"X-Test-Client-IP": "198.51.100.10"}
        for _ in range(5):
            failed = login(client, "victimuser", "wrong-password", attacker)
            assert failed.status_code == 401
        throttled = login(client, "victimuser", "a-secure-password", attacker)
        assert throttled.status_code == 429

        other_ip = {"X-Test-Client-IP": "198.51.100.11"}
        signed_in = login(client, "otheruser", "a-secure-password", other_ip)
        assert signed_in.status_code == 200

        spray_ip = {"X-Test-Client-IP": "198.51.100.12"}
        for index in range(20):
            failed = login(client, f"unknown-user-{index}", "wrong-password", spray_ip)
            assert failed.status_code == 401
        ip_throttled = login(client, "unknown-user-final", "wrong-password", spray_ip)
        assert ip_throttled.status_code == 429


def test_last_active_admin_cannot_be_demoted():
    shutil.rmtree(TEST_DATA_DIR, ignore_errors=True)
    with TestClient(app) as client:
        response = client.post(
            "/auth/users/rootadmin/approve",
            json={"role": "editor"},
            headers=admin_headers(client),
        )
        assert response.status_code == 409
        assert response.json()["detail"]["code"] == "last_admin"


def test_last_active_admin_cannot_be_rejected():
    shutil.rmtree(TEST_DATA_DIR, ignore_errors=True)
    with TestClient(app) as client:
        response = client.post(
            "/auth/users/rootadmin/reject", headers=admin_headers(client)
        )
        assert response.status_code == 409
        assert response.json()["detail"]["code"] == "last_admin"


def test_unauthenticated_write_is_rejected():
    shutil.rmtree(TEST_DATA_DIR, ignore_errors=True)
    with TestClient(app) as client:
        response = client.post(
            "/product-basis/STHI",
            json={"product": "Product", "prodgroup3": "PG3", "module": "STHI"},
        )
        assert response.status_code == 401
        assert response.json()["detail"]["code"] == "unauthenticated"


def test_write_uses_authenticated_identity():
    shutil.rmtree(TEST_DATA_DIR, ignore_errors=True)
    with TestClient(app) as client:
        response = client.post(
            "/pypcs/action-items",
            headers=admin_headers(client),
            json={
                "actionable_item": "Test action",
                "reference": "REF-1",
                "owner": "TRB",
                "update_by": "forged-user",
            },
        )
        assert response.status_code == 201
        assert response.json()["update_by"] == "rootadmin"
        with (TEST_DATA_DIR / "Auth" / "AuditLog.csv").open(
            encoding="utf-8-sig", newline=""
        ) as source:
            audit_rows = list(csv.DictReader(source))
        assert audit_rows[-1]["username"] == "rootadmin"
        assert audit_rows[-1]["path"] == "/pypcs/action-items"


def test_final_submission_changes_require_admin():
    shutil.rmtree(TEST_DATA_DIR, ignore_errors=True)
    with TestClient(app) as client:
        admin = admin_headers(client)
        account = client.post(
            "/auth/request-account",
            json={
                "username": "matrixeditor",
                "display_name": "Matrix Editor",
                "password": "editor-password",
            },
        )
        assert account.status_code == 201
        client.post(
            "/auth/users/matrixeditor/approve",
            json={"role": "editor"},
            headers=admin,
        )
        editor_login = login(client, "matrixeditor", "editor-password")
        editor = {"Authorization": f"Bearer {editor_login.json()['token']}"}

        settings_path = TEST_DATA_DIR / "QualityMatrix" / "Settings"
        settings_path.mkdir(parents=True, exist_ok=True)
        with (settings_path / "PYPCS_Questions.csv").open(
            "w", encoding="utf-8", newline=""
        ) as target:
            writer = csv.DictWriter(
                target,
                fieldnames=["question_id", "display_label", "required_default"],
            )
            writer.writeheader()
            writer.writerow(
                {"question_id": "product_name", "display_label": "Product Name"}
            )
        with (settings_path / "PYPCS_QuestionModuleMap.csv").open(
            "w", encoding="utf-8", newline=""
        ) as target:
            writer = csv.DictWriter(
                target,
                fieldnames=["question_id", "module_key", "visible_default", "required"],
            )
            writer.writeheader()
            writer.writerow(
                {
                    "question_id": "product_name",
                    "module_key": "STHI",
                    "visible_default": "Y",
                    "required": "Y",
                }
            )

        submission_path = TEST_DATA_DIR / "QualityMatrix" / "PYPCS_Submissions.csv"
        submission_path.parent.mkdir(parents=True, exist_ok=True)
        with submission_path.open("w", encoding="utf-8", newline="") as target:
            writer = csv.DictWriter(
                target,
                fieldnames=[
                    "submission_id", "created_at", "updated_at", "submitted_by",
                    "role", "selected_modules", "product_name", "prodgroup3",
                    "operation", "answer_count", "status",
                ],
            )
            writer.writeheader()
            writer.writerow({"submission_id": "final-1", "status": "final"})

        edit_payload = {
            "submission_id": "final-1",
            "status": "final",
            "selected_modules": ["STHI"],
            "submitted_by": "forged-user",
            "cells": [
                {
                    "question_id": "product_name",
                    "module_key": "STHI",
                    "answer": "Edited product",
                }
            ],
        }
        denied_edit = client.post(
            "/pypcs/matrix-submission", headers=editor, json=edit_payload
        )
        assert denied_edit.status_code == 403
        assert denied_edit.json()["detail"]["code"] == "admin_required"
        allowed_edit = client.post(
            "/pypcs/matrix-submission", headers=admin, json=edit_payload
        )
        assert allowed_edit.status_code == 200
        detail = client.get("/pypcs/submissions/final-1").json()
        assert detail["submission"]["submitted_by"] == "rootadmin"

        denied = client.delete("/pypcs/submissions/final-1", headers=editor)
        assert denied.status_code == 403
        assert denied.json()["detail"]["code"] == "admin_required"
        deleted = client.delete("/pypcs/submissions/final-1", headers=admin)
        assert deleted.status_code == 200
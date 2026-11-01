import csv
import logging
import shutil
import sys
from pathlib import Path
from types import ModuleType, SimpleNamespace

import pytest
from fastapi.testclient import TestClient


BACKEND_ROOT = Path(__file__).resolve().parents[1]
SOURCE_DATA_DIR = BACKEND_ROOT / "data"
QUESTION_MODULE_MAP = "QualityMatrix/Settings/PYPCS_QuestionModuleMap.csv"

MODULES = ["HDMx_Class", "HDMx_EQA", "STHI"]
PRODGROUP3 = "GNRLCP/GNRLR1S"
OWNER_A = "owner.a@example.com"
OWNER_B = "owner.b@example.com"


def _write_csv(path, rows, fieldnames):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as target:
        writer = csv.DictWriter(target, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def _read_csv(path):
    with path.open(encoding="utf-8-sig", newline="") as source:
        return list(csv.DictReader(source))


class FakeSMTP:
    """Stands in for smtplib.SMTP; records every message it is asked to send."""

    created = []
    sent = []
    fail = False

    def __init__(self, host, port, timeout=None):
        self.host = host
        self.port = port
        self.started_tls = False
        self.logged_in = None
        FakeSMTP.created.append(self)

    def __enter__(self):
        return self

    def __exit__(self, *exc_info):
        return False

    def starttls(self, context=None):
        self.started_tls = True

    def login(self, username, password):
        self.logged_in = username

    def send_message(self, message):
        if FakeSMTP.fail:
            raise OSError("relay unavailable")
        FakeSMTP.sent.append(message)


@pytest.fixture
def mail(monkeypatch):
    import app.services.notification_service as notification_service

    FakeSMTP.created = []
    FakeSMTP.sent = []
    FakeSMTP.fail = False
    monkeypatch.setattr(notification_service.smtplib, "SMTP", FakeSMTP)
    monkeypatch.setattr(notification_service, "QUALITY_MATRIX_MAIL_TRANSPORT", "smtp")
    monkeypatch.setattr(notification_service, "QUALITY_MATRIX_SMTP_HOST", "smtp.test")
    monkeypatch.setattr(notification_service, "QUALITY_MATRIX_SMTP_PORT", 2525)
    monkeypatch.setattr(notification_service, "QUALITY_MATRIX_SMTP_STARTTLS", False)
    monkeypatch.setattr(notification_service, "QUALITY_MATRIX_SMTP_USERNAME", "")
    return FakeSMTP


@pytest.fixture
def matrix(tmp_path, monkeypatch, mail):
    monkeypatch.delenv("PROXY_SHARED_SECRET", raising=False)
    monkeypatch.delenv("EDIT_PIN", raising=False)
    data_dir = tmp_path / "data"
    for folder in ("QualityMatrix", "View2", "View3"):
        shutil.copytree(SOURCE_DATA_DIR / folder, data_dir / folder)
    # Turn off required flags in the test copy so a final submit only needs the cells we send.
    map_path = data_dir / QUESTION_MODULE_MAP
    map_rows = _read_csv(map_path)
    for row in map_rows:
        row["required"] = "N"
    _write_csv(map_path, map_rows, list(map_rows[0]))
    monkeypatch.setenv("QUALITY_MATRIX_DATA_DIR", str(data_dir))

    import app.config as config
    import app.io.concurrency as concurrency
    import app.io.generic_csv as generic_csv
    import app.services.product_action_matrix_service as matrix_service
    import app.services.pypcs_service as pypcs_service
    from app.auth import require_writer
    from app.main import app

    monkeypatch.setattr(config, "DATA_DIR", data_dir)
    monkeypatch.setattr(concurrency, "DATA_DIR", data_dir)
    monkeypatch.setattr(generic_csv, "DATA_DIR", data_dir)
    monkeypatch.setattr(matrix_service, "DATA_DIR", data_dir)
    pypcs_service._canonical_module_keys.cache_clear()

    user = {
        "username": "notify-test",
        "role": "admin",
        "email": "submitter@example.com",
        "display_name": "Submitter Name",
    }
    app.dependency_overrides[require_writer] = lambda: dict(user)
    client = TestClient(app)
    yield client, user
    client.close()
    app.dependency_overrides.pop(require_writer, None)
    pypcs_service._canonical_module_keys.cache_clear()


def _payload(status, owners, submission_id=None):
    cells = []
    for module in MODULES:
        cells.append({"question_id": "product_name", "module_key": module, "answer": "Notify Product"})
        cells.append({"question_id": "prodgroup3", "module_key": module, "answer": PRODGROUP3})
        if owners.get(module):
            cells.append({"question_id": "pdo_owner", "module_key": module, "answer": owners[module]})
    body = {
        "selected_modules": MODULES,
        "role": "TI",
        "product_name": "Notify Product",
        "prodgroup3": PRODGROUP3,
        "status": status,
        "cells": cells,
    }
    if submission_id:
        body["submission_id"] = submission_id
    return body


OWNERS = {
    "HDMx_Class": OWNER_A,
    "HDMx_EQA": OWNER_A.upper(),
    "STHI": OWNER_B,
}


def test_new_final_submit_emails_each_unique_owner_once(matrix, mail):
    client, _ = matrix
    response = client.post("/pypcs/matrix-submission", json=_payload("final", OWNERS))
    assert response.status_code == 200

    recipients = sorted(message["To"] for message in mail.sent)
    assert recipients == [OWNER_A, OWNER_B]
    assert len(mail.created) == 2

    owner_a = next(message for message in mail.sent if message["To"] == OWNER_A)
    assert owner_a["Subject"] == (
        f"[Quality Matrix] New product to review: Notify Product ({PRODGROUP3})"
    )
    assert owner_a["From"] == "submitter@example.com"
    assert owner_a["Reply-To"] == "submitter@example.com"
    plain = owner_a.get_body(preferencelist=("plain",)).get_content()
    assert "Submitter Name has final-submitted" in plain
    assert "/quality-product-matrix?module=" in plain


def test_draft_save_sends_no_email(matrix, mail):
    client, _ = matrix
    response = client.post("/pypcs/matrix-submission", json=_payload("draft", OWNERS))
    assert response.status_code == 200
    assert mail.sent == []


def test_draft_to_final_sends_once_and_admin_edit_of_final_sends_nothing(matrix, mail):
    client, _ = matrix
    draft = client.post("/pypcs/matrix-submission", json=_payload("draft", OWNERS))
    assert draft.status_code == 200
    submission_id = draft.json()["submission_id"]

    final = client.post(
        "/pypcs/matrix-submission", json=_payload("final", OWNERS, submission_id)
    )
    assert final.status_code == 200
    assert sorted(message["To"] for message in mail.sent) == [OWNER_A, OWNER_B]

    mail.sent.clear()
    edit = client.post(
        "/pypcs/matrix-submission", json=_payload("final", OWNERS, submission_id)
    )
    assert edit.status_code == 200
    assert mail.sent == []


def test_malformed_owner_email_is_rejected_before_any_mail(matrix, mail):
    client, _ = matrix
    owners = {"STHI": f"{OWNER_B}; {OWNER_B.upper()}"}
    response = client.post("/pypcs/matrix-submission", json=_payload("final", owners))
    assert response.status_code == 400
    assert mail.sent == []


def test_send_failure_does_not_fail_the_submit(matrix, mail):
    client, _ = matrix
    mail.fail = True
    response = client.post("/pypcs/matrix-submission", json=_payload("final", OWNERS))
    assert response.status_code == 200
    assert response.json()["submission_id"]
    assert mail.sent == []


def test_log_mode_logs_and_does_not_open_smtp(matrix, mail, monkeypatch, caplog):
    import app.services.notification_service as notification_service

    monkeypatch.setattr(notification_service, "QUALITY_MATRIX_SMTP_HOST", "")
    monkeypatch.setattr(notification_service, "QUALITY_MATRIX_MAIL_TRANSPORT", "log")
    caplog.set_level(logging.INFO, logger="app.services.notification_service")
    client, _ = matrix
    response = client.post("/pypcs/matrix-submission", json=_payload("final", OWNERS))
    assert response.status_code == 200
    assert mail.created == []
    assert "log mode" in caplog.text
    assert OWNER_A in caplog.text
    assert OWNER_B in caplog.text
    assert any(record.levelno == logging.WARNING and "log mode" in record.getMessage() for record in caplog.records)


def test_smtp_settings_are_used_when_host_is_set(matrix, mail, monkeypatch):
    import app.services.notification_service as notification_service

    monkeypatch.setattr(notification_service, "QUALITY_MATRIX_SMTP_STARTTLS", True)
    monkeypatch.setattr(notification_service, "QUALITY_MATRIX_SMTP_USERNAME", "relay-user")
    client, _ = matrix
    response = client.post("/pypcs/matrix-submission", json=_payload("final", {"STHI": OWNER_B}))
    assert response.status_code == 200
    assert len(mail.created) == 1
    smtp = mail.created[0]
    assert (smtp.host, smtp.port) == ("smtp.test", 2525)
    assert smtp.started_tls is True
    assert smtp.logged_in == "relay-user"


def test_html_body_escapes_product_and_owner_text():
    from app.services.notification_service import build_final_submission_messages

    messages = build_final_submission_messages(
        recipients={"a@example.com": ("a@example.com", ["Group <b>"])},
        product_name="<script>x</script>",
        prodgroup3=PRODGROUP3,
        submitter_name="Tester",
        submitter_email="",
    )
    (_, message), = messages
    html_part = message.get_body(preferencelist=("html",)).get_content()
    assert "<script>" not in html_part
    assert "Group &lt;b&gt;" in html_part
    assert message["From"] == "no-reply@localhost"
    assert message["Reply-To"] is None


class FakeOutlookItem:
    def __init__(self):
        self.To = None
        self.Subject = None
        self.HTMLBody = None
        self.sent = False
        self.reply_recipients = []
        self.ReplyRecipients = SimpleNamespace(Add=self.reply_recipients.append)

    def Send(self):
        self.sent = True


def test_outlook_transport_sends_via_com_and_uninitializes(matrix, mail, monkeypatch):
    import app.services.notification_service as notification_service

    items = []
    dispatched = []
    com_calls = []

    class FakeApplication:
        def CreateItem(self, kind):
            assert kind == 0
            item = FakeOutlookItem()
            items.append(item)
            return item

    def fake_dispatch(progid):
        dispatched.append(progid)
        return FakeApplication()

    fake_pythoncom = ModuleType("pythoncom")
    fake_pythoncom.CoInitialize = lambda: com_calls.append("init")
    fake_pythoncom.CoUninitialize = lambda: com_calls.append("uninit")
    fake_win32com = ModuleType("win32com")
    fake_client = ModuleType("win32com.client")
    fake_client.Dispatch = fake_dispatch
    fake_win32com.client = fake_client
    monkeypatch.setitem(sys.modules, "pythoncom", fake_pythoncom)
    monkeypatch.setitem(sys.modules, "win32com", fake_win32com)
    monkeypatch.setitem(sys.modules, "win32com.client", fake_client)
    monkeypatch.setattr(notification_service, "QUALITY_MATRIX_MAIL_TRANSPORT", "outlook")

    client, _ = matrix
    response = client.post("/pypcs/matrix-submission", json=_payload("final", {"STHI": OWNER_B}))
    assert response.status_code == 200

    assert dispatched == ["Outlook.Application"]
    assert mail.created == []
    assert len(items) == 1
    item = items[0]
    assert item.To == OWNER_B
    assert item.Subject == f"[Quality Matrix] New product to review: Notify Product ({PRODGROUP3})"
    assert "Submitter Name has final-submitted" in item.HTMLBody
    assert item.reply_recipients == ["submitter@example.com"]
    assert item.sent is True
    assert com_calls == ["init", "uninit"]

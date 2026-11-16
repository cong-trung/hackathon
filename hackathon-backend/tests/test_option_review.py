import csv
import json
import shutil
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient


BACKEND_ROOT = Path(__file__).resolve().parents[1]
SOURCE_DATA_DIR = BACKEND_ROOT / "data"

QUESTIONS_FILE = "QualityMatrix/Settings/PYPCS_Questions.csv"
OPERATIONS_FILE = "QualityMatrix/Settings/Operation_Process_Step.csv"
CELLS_FILE = "QualityMatrix/PYPCS_SubmissionCells.csv"
SUBMISSIONS_FILE = "QualityMatrix/PYPCS_Submissions.csv"
REVIEWS_FILE = "QualityMatrix/PYPCS_OptionReviews.csv"
CHANGE_LOG_FILE = "Auth/ChangeLog.csv"

CELL_HEADERS = ["submission_id", "question_id", "module_key", "role", "answer", "updated_at", "updated_by"]
SUBMISSION_HEADERS = [
    "submission_id",
    "created_at",
    "updated_at",
    "submitted_by",
    "role",
    "selected_modules",
    "product_name",
    "prodgroup3",
    "operation",
    "answer_count",
    "status",
]


def _write_csv(path, rows, fieldnames):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as target:
        writer = csv.DictWriter(target, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def _read_csv(path):
    with path.open(encoding="utf-8-sig", newline="") as source:
        return list(csv.DictReader(source))


def _seed(data_dir, cells, submissions):
    cell_path = data_dir / CELLS_FILE
    cell_rows = _read_csv(cell_path)
    for submission_id, question_id, module_key, answer in cells:
        cell_rows.append(
            {
                "submission_id": submission_id,
                "question_id": question_id,
                "module_key": module_key,
                "role": "TI",
                "answer": answer,
                "updated_at": "2026-01-01T00:00:00Z",
                "updated_by": "seed",
            }
        )
    _write_csv(cell_path, cell_rows, CELL_HEADERS)

    submission_path = data_dir / SUBMISSIONS_FILE
    submission_rows = _read_csv(submission_path)
    for submission_id, prodgroup3, status in submissions:
        submission_rows.append(
            {
                "submission_id": submission_id,
                "created_at": "2026-01-01T00:00:00Z",
                "updated_at": "",
                "submitted_by": "seed",
                "role": "TI",
                "selected_modules": "STHI",
                "product_name": "Seed Product",
                "prodgroup3": prodgroup3,
                "operation": "",
                "answer_count": "0",
                "status": status,
            }
        )
    _write_csv(submission_path, submission_rows, SUBMISSION_HEADERS)


@pytest.fixture
def review(tmp_path, monkeypatch):
    monkeypatch.delenv("PROXY_SHARED_SECRET", raising=False)
    monkeypatch.delenv("EDIT_PIN", raising=False)
    data_dir = tmp_path / "data"
    for folder in ("QualityMatrix", "View2", "View3"):
        shutil.copytree(SOURCE_DATA_DIR / folder, data_dir / folder)
    monkeypatch.setenv("QUALITY_MATRIX_DATA_DIR", str(data_dir))

    import app.config as config
    import app.io.concurrency as concurrency
    import app.io.generic_csv as generic_csv
    import app.services.product_action_matrix_service as matrix_service
    import app.services.pypcs_service as pypcs_service
    from app.auth import get_current_user
    from app.main import app

    monkeypatch.setattr(config, "DATA_DIR", data_dir)
    monkeypatch.setattr(concurrency, "DATA_DIR", data_dir)
    monkeypatch.setattr(generic_csv, "DATA_DIR", data_dir)
    monkeypatch.setattr(matrix_service, "DATA_DIR", data_dir)
    pypcs_service._canonical_module_keys.cache_clear()

    user = {"username": "reviewer", "role": "ti"}
    app.dependency_overrides[get_current_user] = lambda: dict(user)
    client = TestClient(app)
    yield SimpleNamespace(client=client, data_dir=data_dir, user=user)
    client.close()
    app.dependency_overrides.pop(get_current_user, None)
    pypcs_service._canonical_module_keys.cache_clear()


def _items(client, status="pending"):
    response = client.get("/pypcs/option-review", params={"status": status})
    assert response.status_code == 200, response.text
    return response.json()["items"]


def _find(items, question_id, value, module_key=""):
    return next(
        (
            item
            for item in items
            if item["question_id"] == question_id
            and item["value"] == value
            and item["module_key"] == module_key
        ),
        None,
    )


def _seed_default(review):
    _seed(
        review.data_dir,
        cells=[
            ("sub-draft", "package", "", "ZZ Pkg"),
            ("sub-draft", "prodgroup3", "", "ZZ GROUP|DG512"),
            ("sub-final", "package", "", "ZZ Pkg"),
            ("sub-final", "prodgroup3", "", "ZZ GROUP"),
        ],
        submissions=[
            ("sub-draft", "ZZ GROUP|DG512", "draft"),
            ("sub-final", "ZZ GROUP", "final"),
        ],
    )


def test_pending_lists_custom_values_with_submission_counts(review):
    _seed_default(review)

    items = _items(review.client)

    pkg = _find(items, "package", "ZZ Pkg")
    assert pkg is not None
    assert pkg["status"] == "pending"
    assert pkg["submission_count"] == 2
    assert pkg["final_submission_count"] == 1
    group = _find(items, "prodgroup3", "ZZ GROUP")
    assert group is not None and group["status"] == "pending"
    # Known options must never be listed as custom values.
    assert _find(items, "prodgroup3", "DG512") is None


def test_review_endpoints_require_ti_or_admin(review):
    _seed_default(review)
    review.user["role"] = "me"

    response = review.client.get("/pypcs/option-review")
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "role_forbidden"

    response = review.client.post(
        "/pypcs/option-review/decision",
        json={"question_id": "package", "value": "ZZ Pkg", "action": "approve"},
    )
    assert response.status_code == 403


def test_approve_adds_option_before_other_and_keeps_file_bytes(review):
    _seed_default(review)
    questions_path = review.data_dir / QUESTIONS_FILE
    before = questions_path.read_bytes()

    response = review.client.post(
        "/pypcs/option-review/decision",
        json={"question_id": "package", "value": "ZZ Pkg", "action": "approve", "note": "ok"},
    )

    assert response.status_code == 200, response.text
    assert response.json()["option_added"] is True
    after = questions_path.read_bytes()
    assert after.startswith(b"\xef\xbb\xbf") == before.startswith(b"\xef\xbb\xbf")
    assert after.count(b"\r\n") == before.count(b"\r\n")
    assert after.count(b"\n") == before.count(b"\n")
    assert b"BGA|LGA|ZZ Pkg|Other,," in after
    assert b"BGA|LGA|Other,," not in after
    assert before.replace(b"BGA|LGA|Other,,", b"BGA|LGA|ZZ Pkg|Other,,") == after

    assert "ZZ Pkg" in json.dumps(review.client.get("/pypcs/questions", params={"role": "TI"}).json())
    approved = _find(_items(review.client, "approved"), "package", "ZZ Pkg")
    assert approved is not None and approved["status"] == "approved"
    assert approved["decided_by"] == "reviewer"


def test_approve_is_idempotent(review):
    _seed_default(review)
    body = {"question_id": "package", "value": "ZZ Pkg", "action": "approve"}
    assert review.client.post("/pypcs/option-review/decision", json=body).status_code == 200
    questions_bytes = (review.data_dir / QUESTIONS_FILE).read_bytes()

    response = review.client.post("/pypcs/option-review/decision", json=body)

    assert response.status_code == 200
    assert response.json()["changed"] is False
    assert (review.data_dir / QUESTIONS_FILE).read_bytes() == questions_bytes


def test_reject_hides_value_from_pending(review):
    _seed_default(review)

    response = review.client.post(
        "/pypcs/option-review/decision",
        json={"question_id": "prodgroup3", "value": "ZZ GROUP", "action": "reject", "note": "typo"},
    )

    assert response.status_code == 200, response.text
    assert _find(_items(review.client), "prodgroup3", "ZZ GROUP") is None
    rejected = _find(_items(review.client, "rejected"), "prodgroup3", "ZZ GROUP")
    assert rejected is not None and rejected["decision_note"] == "typo"
    # Rejection keeps the answers in the submissions.
    cells = _read_csv(review.data_dir / CELLS_FILE)
    assert any(cell["answer"] == "ZZ GROUP" for cell in cells)


def test_map_requires_admin_and_note_when_final_submissions_change(review):
    _seed_default(review)
    body = {"question_id": "package", "value": "ZZ Pkg", "action": "map", "mapped_to": "BGA"}

    response = review.client.post("/pypcs/option-review/decision", json=body)
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "admin_required"
    assert any(cell["answer"] == "ZZ Pkg" for cell in _read_csv(review.data_dir / CELLS_FILE))

    review.user["role"] = "admin"
    response = review.client.post("/pypcs/option-review/decision", json=body)
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "note_required"

    response = review.client.post("/pypcs/option-review/decision", json={**body, "note": "approved by lead"})
    assert response.status_code == 200, response.text
    assert response.json()["updated_submissions"] == 2

    cells = _read_csv(review.data_dir / CELLS_FILE)
    package_answers = {
        cell["submission_id"]: cell["answer"] for cell in cells if cell["question_id"] == "package"
    }
    assert package_answers["sub-draft"] == "BGA"
    assert package_answers["sub-final"] == "BGA"

    change_rows = _read_csv(review.data_dir / CHANGE_LOG_FILE)
    assert any(row["entity_type"] == "option" and row["action"] == "map" for row in change_rows)
    assert any(row["entity_type"] == "product_info" and row["entity_id"] == "sub-final" for row in change_rows)


def test_prodgroup3_map_is_not_supported(review):
    _seed_default(review)
    review.user["role"] = "admin"
    body = {
        "question_id": "prodgroup3",
        "value": "ZZ GROUP",
        "action": "map",
        "mapped_to": "DG512",
        "note": "approved by lead",
    }

    response = review.client.post("/pypcs/option-review/decision", json=body)

    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "map_not_supported"


def test_map_on_draft_only_is_allowed_for_ti(review):
    _seed(
        review.data_dir,
        cells=[("sub-solo", "package", "", "ZZ Solo")],
        submissions=[("sub-solo", "", "draft")],
    )

    response = review.client.post(
        "/pypcs/option-review/decision",
        json={"question_id": "package", "value": "ZZ Solo", "action": "map", "mapped_to": "BGA"},
    )

    assert response.status_code == 200, response.text
    solo = [row for row in _read_csv(review.data_dir / CELLS_FILE) if row["submission_id"] == "sub-solo"]
    assert solo[0]["answer"] == "BGA"
    assert _find(_items(review.client), "package", "ZZ Solo") is None


def test_operation_approve_needs_numeric_code_and_description_then_appends_row(review):
    _seed(
        review.data_dir,
        cells=[("sub-op", "operation", "STHI", "ZZOP")],
        submissions=[("sub-op", "", "draft")],
    )
    url = "/pypcs/option-review/decision"

    response = review.client.post(
        url, json={"question_id": "operation", "module_key": "STHI", "value": "ZZOP", "action": "approve", "operation_description": "x"}
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "invalid_operation"

    response = review.client.post(
        url, json={"question_id": "operation", "module_key": "STHI", "value": "9988", "action": "approve"}
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "description_required"

    response = review.client.post(
        url,
        json={
            "question_id": "operation",
            "module_key": "STHI",
            "value": "9988",
            "action": "approve",
            "operation_description": "ZZ TEST OP",
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["option_added"] is True
    operations = (review.data_dir / OPERATIONS_FILE).read_text(encoding="utf-8-sig")
    assert "STHI,9988,ZZ TEST OP,ZZ TEST OP" in operations
    assert _find(_items(review.client, "approved"), "operation", "ZZOP", "STHI") is None
    assert _find(_items(review.client, "approved"), "operation", "9988", "STHI") is not None


def test_decision_validation(review):
    _seed_default(review)
    url = "/pypcs/option-review/decision"

    response = review.client.post(url, json={"question_id": "package", "value": "Other", "action": "approve"})
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "invalid_value"

    response = review.client.post(url, json={"question_id": "package", "value": "A|B", "action": "approve"})
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "invalid_value"

    response = review.client.post(url, json={"question_id": "product_name", "value": "x", "action": "approve"})
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "not_option_question"

    response = review.client.post(url, json={"question_id": "missing_question", "value": "x", "action": "approve"})
    assert response.status_code == 404

    response = review.client.post(url, json={"question_id": "package", "value": "ZZ Pkg", "action": "map", "mapped_to": "Other"})
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "invalid_map_target"

    response = review.client.post(url, json={"question_id": "package", "value": "ZZ Pkg", "action": "delete"})
    assert response.status_code == 422

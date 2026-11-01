import csv
import shutil
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


BACKEND_ROOT = Path(__file__).resolve().parents[1]
SOURCE_DATA_DIR = BACKEND_ROOT / "data"


def _write_csv(path, rows, fieldnames):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as target:
        writer = csv.DictWriter(target, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def _read_csv(path):
    with path.open(encoding="utf-8-sig", newline="") as source:
        return list(csv.DictReader(source))


@pytest.fixture
def matrix_client(tmp_path, monkeypatch):
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
    from app.auth import require_writer
    from app.main import app

    monkeypatch.setattr(config, "DATA_DIR", data_dir)
    monkeypatch.setattr(concurrency, "DATA_DIR", data_dir)
    monkeypatch.setattr(generic_csv, "DATA_DIR", data_dir)
    monkeypatch.setattr(matrix_service, "DATA_DIR", data_dir)
    pypcs_service._canonical_module_keys.cache_clear()

    questions_path = data_dir / pypcs_service.PYPCS_QUESTIONS_FILE
    question_rows = _read_csv(questions_path)
    question_headers = list(question_rows[0])
    for question in question_rows:
        if question.get("question_id") == "prodgroup3":
            question["field_type"] = "multiselect"
    _write_csv(questions_path, question_rows, question_headers)

    app.dependency_overrides[require_writer] = lambda: {
        "username": "multiselect-test",
        "role": "admin",
    }
    client = TestClient(app)
    yield client, data_dir
    client.close()
    app.dependency_overrides.pop(require_writer, None)
    pypcs_service._canonical_module_keys.cache_clear()


def _save_product(client, prodgroup3):
    return client.post(
        "/pypcs/matrix-submission",
        json={
            "selected_modules": ["STHI"],
            "role": "TI",
            "product_name": "Multi Select Test Product",
            "prodgroup3": prodgroup3,
            "status": "draft",
            "cells": [
                {
                    "question_id": "product_name",
                    "module_key": "STHI",
                    "answer": "Multi Select Test Product",
                },
                {
                    "question_id": "prodgroup3",
                    "module_key": "STHI",
                    "answer": prodgroup3,
                },
            ],
        },
    )


def test_matrix_save_canonicalizes_order_and_filters_any_selected_value(matrix_client):
    client, data_dir = matrix_client
    submitted = "GNRLCP/GNRLR1S|SPRMCP/SPRWSP/SPRMJT|gnrlcp/gnrlr1s"
    response = _save_product(client, submitted)
    assert response.status_code == 200

    questions = _read_csv(data_dir / "QualityMatrix/Settings/PYPCS_Questions.csv")
    prodgroup3 = next(row for row in questions if row["question_id"] == "prodgroup3")
    options = [value.strip() for value in prodgroup3["options"].split("|") if value.strip()]
    selected = {"GNRLCP/GNRLR1S".casefold(), "SPRMCP/SPRWSP/SPRMJT".casefold()}
    expected = "|".join(option for option in options if option.casefold() in selected)

    submissions = _read_csv(data_dir / "QualityMatrix/PYPCS_Submissions.csv")
    saved_submission = next(
        row for row in submissions if row["submission_id"] == response.json()["submission_id"]
    )
    cells = _read_csv(data_dir / "QualityMatrix/PYPCS_SubmissionCells.csv")
    saved_cell = next(
        row
        for row in cells
        if row["submission_id"] == response.json()["submission_id"]
        and row["question_id"] == "prodgroup3"
    )
    assert saved_submission["prodgroup3"] == expected
    assert saved_cell["answer"] == expected

    filtered = client.get(
        "/pypcs/submissions", params={"prodgroup3": "gnrlcp/gnrlr1s"}
    )
    assert filtered.status_code == 200
    assert any(
        item["submission_id"] == response.json()["submission_id"]
        for item in filtered.json()["items"]
    )


def test_matrix_save_rejects_invalid_multiselect_value_with_code(matrix_client):
    client, _data_dir = matrix_client
    response = _save_product(client, "X" * 101)
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "invalid_multiselect_value"
    assert response.json()["detail"]["field"] == "prodgroup3"


def test_other_custom_text_and_existing_combined_single_value_are_preserved(matrix_client):
    client, data_dir = matrix_client
    custom = "GNRLCP/GNRLR1S|Custom B|Custom A|custom b"
    custom_response = _save_product(client, custom)
    assert custom_response.status_code == 200
    custom_submission = next(
        row
        for row in _read_csv(data_dir / "QualityMatrix/PYPCS_Submissions.csv")
        if row["submission_id"] == custom_response.json()["submission_id"]
    )
    assert custom_submission["prodgroup3"] == "GNRLCP/GNRLR1S|Custom B|Custom A"

    combined = "GNRLCP/GNRLR1S"
    combined_response = _save_product(client, combined)
    assert combined_response.status_code == 200
    combined_submission = next(
        row
        for row in _read_csv(data_dir / "QualityMatrix/PYPCS_Submissions.csv")
        if row["submission_id"] == combined_response.json()["submission_id"]
    )
    assert combined_submission["prodgroup3"] == combined


def test_view3_builds_canonical_multi_value_product_key_and_filters_by_one(matrix_client):
    client, data_dir = matrix_client
    submitted = "GNRLCP/GNRLR1S|SPRMCP/SPRWSP/SPRMJT"
    saved = _save_product(client, submitted)
    assert saved.status_code == 200

    from app.services.pypcs_service import ACTION_ITEM_HEADERS

    _write_csv(
        data_dir / "View2/PYPCS_ActionItems.csv",
        [{"nbr": "991", "module": "STHI", "actionable_item": "Test action", "reference": "REF"}],
        ACTION_ITEM_HEADERS,
    )
    response = client.get(
        "/pypcs/product-action-matrix",
        params={"prodgroup3": "gnrlcp/gnrlr1s"},
    )
    assert response.status_code == 200
    row = next(
        row
        for row in response.json()["rows"]
        if row["submission_id"] == saved.json()["submission_id"]
    )
    assert row["prodgroup3"] == "SPRMCP/SPRWSP/SPRMJT|GNRLCP/GNRLR1S"
    assert row["product_key"] == (
        "sprmcp/sprwsp/sprmjt|gnrlcp/gnrlr1s||multi select test product"
    )


def test_multiselect_metadata_and_existing_submission_read(matrix_client):
    client, data_dir = matrix_client
    questions = client.get("/pypcs/questions")
    assert questions.status_code == 200
    question = next(
        item for item in questions.json()["items"] if item["question_id"] == "prodgroup3"
    )
    assert question["field_type"] == "multiselect"
    assert isinstance(question["options"], list)
    assert "Other" in question["options"]

    existing = _read_csv(data_dir / "QualityMatrix/PYPCS_Submissions.csv")[0]
    detail = client.get(f"/pypcs/submissions/{existing['submission_id']}")
    assert detail.status_code == 200
    assert detail.json()["submission"]["prodgroup3"] == existing["prodgroup3"]


def _save_ppv_platform(client, answer):
    return client.post(
        "/pypcs/matrix-submission",
        json={
            "selected_modules": ["STHI"],
            "role": "ME",
            "product_name": "PPV Multi Select Test Product",
            "status": "draft",
            "cells": [
                {
                    "question_id": "ppv_sw_platform",
                    "module_key": "STHI",
                    "answer": answer,
                },
            ],
        },
    )


def _ppv_cell(client, submission_id):
    detail = client.get(f"/pypcs/submissions/{submission_id}")
    assert detail.status_code == 200
    return next(
        cell for cell in detail.json()["cells"] if cell["question_id"] == "ppv_sw_platform"
    )


def test_ppv_sw_platform_multiselect_saves_canonical_order_and_round_trips(matrix_client):
    client, data_dir = matrix_client
    response = _save_ppv_platform(client, "Aguila|SST")
    assert response.status_code == 200
    submission_id = response.json()["submission_id"]

    cell = _ppv_cell(client, submission_id)
    assert cell["field_type"] == "multiselect"
    assert cell["answer"] == "SST|Aguila"
    stored = next(
        row
        for row in _read_csv(data_dir / "QualityMatrix/PYPCS_SubmissionCells.csv")
        if row["submission_id"] == submission_id and row["question_id"] == "ppv_sw_platform"
    )
    assert stored["answer"] == "SST|Aguila"


def test_ppv_sw_platform_legacy_values_load_and_resave(matrix_client):
    client, _data_dir = matrix_client
    legacy_submission_id = "20a8c918-8b41-4968-b331-c44d61395f7b"
    assert _ppv_cell(client, legacy_submission_id)["answer"] == "SST"

    free_text = (
        "SST for PPVs/m\nUnder discussion for AST "
        "(under Aguila or Fusion - CP W2'25 - DUNG PPV)"
    )
    for answer in ("STHI legacy", "Aguila", "non-SST", free_text):
        response = _save_ppv_platform(client, answer)
        assert response.status_code == 200, answer
        assert _ppv_cell(client, response.json()["submission_id"])["answer"] == answer
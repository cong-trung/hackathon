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
def module_client(tmp_path, monkeypatch):
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
    from app.auth import get_current_user, require_writer
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
        "username": "module-test",
        "role": "admin",
    }
    client = TestClient(app)
    yield client, data_dir
    client.close()
    app.dependency_overrides.pop(require_writer, None)
    app.dependency_overrides.pop(get_current_user, None)
    pypcs_service._canonical_module_keys.cache_clear()


def _save_sthi_product(client):
    response = client.post(
        "/pypcs/matrix-submission",
        json={
            "selected_modules": ["STHI"],
            "role": "TI",
            "product_name": "Module Test Product",
            "prodgroup3": "GNRLCP/GNRLR1S",
            "status": "draft",
            "cells": [
                {
                    "question_id": "product_name",
                    "module_key": "STHI",
                    "answer": "Module Test Product",
                },
                {
                    "question_id": "prodgroup3",
                    "module_key": "STHI",
                    "answer": "GNRLCP/GNRLR1S",
                },
            ],
        },
    )
    assert response.status_code == 200
    return response


def _seed_action_items(data_dir):
    from app.services.pypcs_service import ACTION_ITEM_HEADERS

    _write_csv(
        data_dir / "View2/PYPCS_ActionItems.csv",
        [
            {"nbr": "991", "module": "STHI", "actionable_item": "STHI action", "reference": "REF1"},
            {"nbr": "992", "module": "HDMx", "actionable_item": "HDMx action", "reference": "REF2"},
        ],
        ACTION_ITEM_HEADERS,
    )


def _action_payload(**overrides):
    payload = {
        "actionable_item": "New action",
        "reference": "REF",
        "owner": "Owner",
        "module": ["STHI"],
    }
    payload.update(overrides)
    return payload


def test_action_item_module_is_required(module_client):
    client, _data_dir = module_client
    response = client.post("/pypcs/action-items", json=_action_payload(module=[]))
    assert response.status_code == 422
    assert response.json()["detail"]["field"] == "module"


def test_action_item_module_rejects_unknown_value(module_client):
    client, _data_dir = module_client
    response = client.post("/pypcs/action-items", json=_action_payload(module=["NOPE"]))
    assert response.status_code == 422
    assert response.json()["detail"]["field"] == "module"


def test_action_item_options_expose_module_groups(module_client):
    client, _data_dir = module_client
    response = client.get("/pypcs/action-items/options")
    assert response.status_code == 200
    modules = response.json()["fields"]["module"]
    assert "HDMx" in modules
    assert "STHI" in modules
    assert not any(module.casefold().startswith("hdmx_") for module in modules)


def test_action_item_module_is_canonicalized_and_deduped(module_client):
    client, _data_dir = module_client
    response = client.post(
        "/pypcs/action-items",
        json=_action_payload(module=["hdmx", "HDMX", "STHI"]),
    )
    assert response.status_code == 201
    created = next(
        item
        for item in client.get("/pypcs/action-items").json()["items"]
        if item["actionable_item"] == "New action"
    )
    assert created["module"] == ["HDMx", "STHI"]


def test_matrix_only_includes_actions_tagged_for_group(module_client):
    client, data_dir = module_client
    _seed_action_items(data_dir)
    _save_sthi_product(client)

    matrix = client.get("/pypcs/product-action-matrix").json()
    sthi_actions = {
        nbr for row in matrix["rows"] if row["module_group"] == "STHI" for nbr in row["cells"]
    }
    assert sthi_actions == {"991"}

    filtered = client.get(
        "/pypcs/product-action-matrix", params={"module_group": "STHI"}
    ).json()
    assert [action["nbr"] for action in filtered["actions"]] == [991]
    assert filtered["actions"][0]["modules"] == ["STHI"]

    client.post(
        "/pypcs/matrix-submission",
        json={
            "selected_modules": ["LCBI"],
            "role": "TI",
            "product_name": "Untagged Product",
            "prodgroup3": "GNRLCP/GNRLR1S",
            "status": "draft",
            "cells": [
                {"question_id": "product_name", "module_key": "LCBI", "answer": "Untagged Product"},
                {"question_id": "prodgroup3", "module_key": "LCBI", "answer": "GNRLCP/GNRLR1S"},
            ],
        },
    )
    counts = {group["key"]: group["product_count"] for group in client.get("/pypcs/product-action-matrix").json()["module_groups"]}
    assert counts["LCBI"] == 0
    assert counts["STHI"] == len({row["product_key"] for row in matrix["rows"] if row["module_group"] == "STHI"})


def test_decision_for_untagged_action_returns_422(module_client):
    client, data_dir = module_client
    _seed_action_items(data_dir)
    _save_sthi_product(client)

    matrix = client.get("/pypcs/product-action-matrix").json()
    sthi_row = next(row for row in matrix["rows"] if row["module_group"] == "STHI")
    assert "992" not in sthi_row["cells"]
    response = client.put(
        "/pypcs/product-action-matrix/rows",
        json={
            "product_key": sthi_row["product_key"],
            "module_group": "STHI",
            "mode": "draft",
            "cells": [{"action_nbr": 992, "status": "", "comment": ""}],
        },
    )
    assert response.status_code == 422
    assert response.json()["detail"]["field"] == "cells[0].action_nbr"


def _as_user(role):
    from app.auth import get_current_user
    from app.main import app

    app.dependency_overrides[get_current_user] = lambda: {
        "username": f"{role}-test",
        "role": role,
    }


def _action_item_nbrs(client):
    return [item["nbr"] for item in client.get("/pypcs/action-items").json()["items"]]


def test_admin_can_delete_action_item(module_client):
    client, data_dir = module_client
    _seed_action_items(data_dir)
    _as_user("admin")
    response = client.delete("/pypcs/action-items/991")
    assert response.status_code == 200
    assert response.json() == {"deleted": True, "nbr": 991}
    assert _action_item_nbrs(client) == [992]


def test_non_admin_writer_cannot_delete_action_item(module_client):
    client, data_dir = module_client
    _seed_action_items(data_dir)
    _as_user("editor")
    response = client.delete("/pypcs/action-items/991")
    assert response.status_code == 403
    assert response.json()["detail"] == {"code": "admin_required"}
    assert _action_item_nbrs(client) == [991, 992]


def test_unauthenticated_cannot_delete_action_item(module_client):
    client, data_dir = module_client
    _seed_action_items(data_dir)
    response = client.delete("/pypcs/action-items/991")
    assert response.status_code == 401
    assert _action_item_nbrs(client) == [991, 992]


def test_delete_missing_action_item_returns_404(module_client):
    client, data_dir = module_client
    _seed_action_items(data_dir)
    _as_user("admin")
    response = client.delete("/pypcs/action-items/12345")
    assert response.status_code == 404
    assert response.json()["detail"] == "PYPCS action item not found."
    assert _action_item_nbrs(client) == [991, 992]


def test_delete_with_stale_expected_version_returns_409(module_client):
    client, data_dir = module_client
    _seed_action_items(data_dir)
    _as_user("admin")
    response = client.delete(
        "/pypcs/action-items/991", params={"expected_version": "stale"}
    )
    assert response.status_code == 409
    detail = response.json()["detail"]
    assert detail["code"] == "conflict"
    assert detail["current"]["nbr"] == 991
    assert _action_item_nbrs(client) == [991, 992]

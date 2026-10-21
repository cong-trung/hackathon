import csv
from urllib.parse import quote

import pytest
from starlette.requests import Request


TEST_SHARED_SECRET = "test-proxy-shared-secret"


@pytest.fixture
def proxy_shared_secret():
    return TEST_SHARED_SECRET


def _request(headers):
    return Request(
        {
            "type": "http",
            "method": "GET",
            "path": "/",
            "headers": [(key.encode(), value.encode()) for key, value in headers.items()],
        }
    )


def _identity_headers():
    return {
        "X-Proxy-Secret": TEST_SHARED_SECRET,
        "X-User-WWID": "12345678",
        "X-User-Name": quote("Ada Lovelace", safe=""),
        "X-User-Email": "ada@example.com",
        "X-User-Source": "manual",
    }


def _set_submission_status(data_dir, submission_id, status):
    path = data_dir / "QualityMatrix" / "PYPCS_Submissions.csv"
    with path.open(encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        fieldnames = reader.fieldnames
        rows = list(reader)
    for row in rows:
        if row["submission_id"] == submission_id:
            row["status"] = status
    with path.open("w", encoding="utf-8", newline="") as destination:
        writer = csv.DictWriter(destination, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def test_get_actor_accepts_valid_proxy_identity(api_client):
    from app.auth import get_actor

    actor = get_actor(
        _request(
            {
                "x-proxy-secret": TEST_SHARED_SECRET,
                "x-user-wwid": "12345678",
                "x-user-name": quote("Ada Lovelace", safe=""),
                "x-user-email": "ada@example.com",
                "x-user-source": "olb",
            }
        )
    )

    assert actor is not None
    assert actor.name == "Ada Lovelace"
    assert actor.label == "Ada Lovelace (12345678)"
    assert actor.source == "olb"


def test_proxy_secret_enforces_auth_but_exempts_health(api_client):
    client, _ = api_client

    assert client.get("/health").status_code == 200
    assert client.get("/docs/oauth2-redirect").status_code != 401
    response = client.get("/pypcs/modules")

    assert response.status_code == 401
    assert response.json() == {"detail": {"code": "unauthenticated"}}


def test_get_actor_rejects_missing_or_wrong_secret(api_client):
    from app.auth import get_actor

    assert get_actor(_request({})) is None
    assert get_actor(
        _request(
            {
                "x-proxy-secret": "wrong-secret",
                "x-user-wwid": "12345678",
                "x-user-name": "Ada",
                "x-user-email": "ada@example.com",
                "x-user-source": "manual",
            }
        )
    ) is None


def test_submission_and_history_attribution_uses_actor(api_client):
    client, data_dir = api_client
    headers = {**_identity_headers(), "X-Edit-Pin": "test-pin-0000"}
    payload = {
        "selected_modules": ["LCBI"],
        "role": "TI",
        "submitted_by": "Forged User",
        "product_name": "Auth Attribution Test",
        "status": "draft",
        "cells": [
            {
                "question_id": "product_name",
                "module_key": "LCBI",
                "answer": "Auth Attribution Test",
            }
        ],
    }

    response = client.post(
        "/pypcs/matrix-submission", json=payload, headers=headers
    )
    assert response.status_code == 200
    submission_id = response.json()["submission_id"]

    submissions_path = data_dir / "QualityMatrix" / "PYPCS_Submissions.csv"
    with submissions_path.open(encoding="utf-8-sig", newline="") as source:
        submission = next(
            row
            for row in csv.DictReader(source)
            if row["submission_id"] == submission_id
        )
    assert submission["submitted_by"] == "Ada Lovelace (12345678)"

    cells_path = data_dir / "QualityMatrix" / "PYPCS_SubmissionCells.csv"
    with cells_path.open(encoding="utf-8-sig", newline="") as source:
        cell = next(
            row
            for row in csv.DictReader(source)
            if row["submission_id"] == submission_id
        )
    assert cell["updated_by"] == "Ada Lovelace (12345678)"

    _set_submission_status(data_dir, submission_id, "final")
    response = client.post(
        "/pypcs/matrix-submission",
        json={**payload, "submission_id": submission_id, "edit_reason": "test"},
        headers=headers,
    )
    assert response.status_code == 200
    history = client.get(
        f"/pypcs/submissions/{submission_id}/history", headers=headers
    ).json()
    assert history[0]["changed_by"] == "Ada Lovelace (12345678)"

    _set_submission_status(data_dir, submission_id, "final")
    response = client.delete(
        f"/pypcs/submissions/{submission_id}?submitted_by=Forged+User",
        headers=headers,
    )
    assert response.status_code == 200
    history = client.get(
        f"/pypcs/submissions/{submission_id}/history", headers=headers
    ).json()
    delete_entry = next(entry for entry in history if entry["action"] == "delete")
    assert delete_entry["changed_by"] == "Ada Lovelace (12345678)"


def test_view2_action_item_attribution_uses_actor(api_client):
    client, _ = api_client
    headers = _identity_headers()
    payload = {
        "event_id": "AUTH-EVENT-1",
        "actionable_item": "Auth attribution action",
        "reference": "AUTH-REF-1",
        "package": ["All"],
        "bare_die_lid": ["All"],
        "foveros": ["All"],
        "segment": ["All"],
        "xvi_tool_type": ["DVI"],
        "lts_ball": ["All"],
        "hdmx_ap_pan": ["All"],
        "owner": "TRB",
        "update_by": "Forged User",
    }
    created = client.post("/pypcs/action-items", json=payload, headers=headers)
    assert created.status_code == 201
    item = created.json()

    updated = client.put(
        f"/pypcs/action-items/{item['nbr']}",
        json={**payload, "expected_version": item["version"]},
        headers=headers,
    )

    assert updated.status_code == 200
    assert updated.json()["update_by"] == "Ada Lovelace (12345678)"


def test_view3_decision_attribution_uses_actor(api_client):
    client, _ = api_client
    headers = _identity_headers()
    matrix = client.get("/pypcs/product-action-matrix", headers=headers).json()
    row = matrix["rows"][0]
    action_key = str(matrix["actions"][0]["nbr"])
    current_cell = row["cells"][action_key]
    status = "N" if current_cell["status"] == "Y" else "Y"

    response = client.put(
        "/pypcs/product-action-matrix/rows",
        json={
            "product_key": row["product_key"],
            "module_group": row["module_group"],
            "updated_by": "Forged User",
            "mode": "draft",
            "cells": [
                {
                    "action_nbr": int(action_key),
                    "status": status,
                    "expected_version": current_cell["version"],
                }
            ],
        },
        headers=headers,
    )

    assert response.status_code == 200
    assert response.json()["cells"][action_key]["updated_by"] == (
        "Ada Lovelace (12345678)"
    )
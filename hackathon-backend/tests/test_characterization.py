import hashlib
import io
import json
import os
import re
import zipfile
from pathlib import Path

from conftest import TEST_EDIT_PIN


SNAPSHOT_DIR = Path(
    os.getenv("CHARACTERIZATION_SNAPSHOT_DIR", Path(__file__).parent / "snapshots")
)
VOLATILE_FIELDS = {
    "changed_at",
    "created_at",
    "history_id",
    "submission_id",
    "updated_at",
    "version",
}


def _normalize(value):
    if isinstance(value, str):
        return re.sub(r"^.*[\\/]data[\\/]", "<DATA_DIR>/", value, flags=re.IGNORECASE)
    if isinstance(value, dict):
        return {
            key: "<volatile>" if key in VOLATILE_FIELDS else _normalize(item)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [_normalize(item) for item in value]
    return value


def _snapshot(name, actual):
    SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
    path = SNAPSHOT_DIR / name
    encoded = json.dumps(_normalize(actual), ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    if os.environ.get("UPDATE_SNAPSHOTS") == "1":
        path.write_text(encoded, encoding="utf-8")
    assert path.exists(), f"Missing snapshot {path}; generate it from the current implementation."
    assert path.read_text(encoding="utf-8") == encoded


def _capture(response):
    if "application/json" in response.headers.get("content-type", ""):
        body = response.json()
    else:
        body = response.text
    return {"status": response.status_code, "body": body}


def _write_capture(response):
    captured = _capture(response)
    captured["body"] = _normalize(captured["body"])
    return captured


def _file_hash(data_dir, relative_path):
    data = (data_dir / relative_path).read_bytes()
    if zipfile.is_zipfile(io.BytesIO(data)):
        normalized_members = []
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            for name in sorted(archive.namelist()):
                member = archive.read(name)
                if name == "docProps/core.xml":
                    member = re.sub(
                        rb"(<dcterms:(?:created|modified)[^>]*>).*?(</dcterms:(?:created|modified)>)",
                        rb"\1<TIMESTAMP>\2",
                        member,
                    )
                normalized_members.extend((name.encode("utf-8"), b"\0", member, b"\0"))
        data = b"".join(normalized_members)
    data = re.sub(
        rb"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}",
        b"<UUID>",
        data,
        flags=re.IGNORECASE,
    )
    data = re.sub(
        rb"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\\.[0-9]+)?Z",
        b"<TIMESTAMP>",
        data,
    )
    return hashlib.sha256(data).hexdigest()


def test_get_endpoints_match_current_responses(characterization_api_client):
    client, _data_dir = characterization_api_client
    responses = {}

    def get(key, path):
        responses[key] = _capture(client.get(path))

    get("health", "/health")
    get("modules", "/modules")
    get("product_basis_schema_sthi", "/schema/product-basis/STHI")
    get("product_basis_schema_lcbi", "/schema/product-basis/LCBI")
    basis_sthi = client.get("/product-basis/STHI?limit=2")
    responses["product_basis_list_sthi"] = _capture(basis_sthi)
    basis_lcbi = client.get("/product-basis/LCBI?limit=2")
    responses["product_basis_list_lcbi"] = _capture(basis_lcbi)
    basis_item = basis_sthi.json()["items"][0]
    get("product_basis_item", f"/product-basis/STHI/{basis_item['prodgroup3']}")
    get("solution_schema", "/schema/solution")
    solutions = client.get("/solutions?limit=2")
    responses["solutions"] = _capture(solutions)
    solution_id = solutions.json()["items"][0]["id"]
    get("pdsolutions_sthi", "/pdsolutions/STHI")
    get("pdsolutions_lcbi", "/pdsolutions/LCBI")
    get("action_items", "/pypcs/action-items")
    get("action_item_options", "/pypcs/action-items/options")
    get("pypcs_modules", "/pypcs/modules")
    get("pypcs_questions", "/pypcs/questions")
    get("pypcs_questions_ti", "/pypcs/questions?role=TI")
    submissions = client.get("/pypcs/submissions?limit=2")
    responses["submissions"] = _capture(submissions)
    submission_id = submissions.json()["items"][0]["submission_id"]
    get("submission_detail", f"/pypcs/submissions/{submission_id}")
    get("submission_history", f"/pypcs/submissions/{submission_id}/history")
    get("product_action_matrix", "/pypcs/product-action-matrix")
    get("product_action_matrix_export", "/pypcs/product-action-matrix/export")
    get(
        "solutions_filtered",
        f"/solutions?module={solutions.json()['items'][0]['module']}&q={solution_id}",
    )

    _snapshot("get_endpoints.json", responses)


def test_read_post_endpoints_match_current_responses(characterization_api_client, monkeypatch):
    client, _data_dir = characterization_api_client
    monkeypatch.setattr("app.routers.pypcs.QUALITY_MATRIX_EDIT_PIN", "")
    responses = {
        "visible_questions": _capture(
            client.post(
                "/pypcs/visible-questions",
                json={"selected_modules": ["LCBI"], "role": "TI"},
            )
        ),
        "verify_edit_pin_when_disabled": _capture(
            client.post(
                "/pypcs/submissions/not-a-real-id/verify-edit-pin",
                json={"pin": "not-set"},
            )
        ),
    }
    monkeypatch.setattr("app.routers.pypcs.QUALITY_MATRIX_EDIT_PIN", TEST_EDIT_PIN)
    responses["verify_edit_pin_wrong_pin"] = _capture(
        client.post(
            "/pypcs/submissions/not-a-real-id/verify-edit-pin",
            json={"pin": "wrong-test-pin"},
        )
    )
    responses["verify_edit_pin_ok"] = _capture(
        client.post(
            "/pypcs/submissions/not-a-real-id/verify-edit-pin",
            json={"pin": TEST_EDIT_PIN},
        )
    )
    _snapshot("read_post_endpoints.json", responses)


def test_write_flows_match_current_responses_and_csv_bytes(characterization_api_client):
    client, data_dir = characterization_api_client
    results = {}

    basis_payload = {
        "product": "Characterization Product",
        "prodgroup3": "CHARACTERIZATION-001",
        "module": "STHI",
    }
    response = client.post("/product-basis/STHI", json=basis_payload)
    results["product_basis_create"] = _write_capture(response)
    results["product_basis_create_bytes"] = _file_hash(
        data_dir, "TI/ProductBasisInfo_STHI.csv"
    )
    response = client.put(
        "/product-basis/STHI/CHARACTERIZATION-001",
        json={**basis_payload, "product": "Updated Characterization Product"},
    )
    results["product_basis_update"] = _write_capture(response)
    results["product_basis_update_bytes"] = _file_hash(
        data_dir, "TI/ProductBasisInfo_STHI.csv"
    )
    response = client.patch(
        "/product-basis/STHI/CHARACTERIZATION-001",
        json={"pkg": "LGA"},
    )
    results["product_basis_patch"] = _write_capture(response)
    results["product_basis_patch_bytes"] = _file_hash(
        data_dir, "TI/ProductBasisInfo_STHI.csv"
    )
    response = client.delete("/product-basis/STHI/CHARACTERIZATION-001")
    results["product_basis_delete"] = _write_capture(response)
    results["product_basis_delete_bytes"] = _file_hash(
        data_dir, "TI/ProductBasisInfo_STHI.csv"
    )

    solution_payload = {
        "module": "STHI",
        "solution": "Characterization Solution",
        "key_summary": "Initial summary",
        "excursion_related": "N",
    }
    response = client.post("/solutions", json=solution_payload)
    results["solution_create"] = _write_capture(response)
    solution_id = response.json()["item"]["id"]
    results["solution_create_bytes"] = _file_hash(data_dir, "GL-MQR/Solution.csv")
    response = client.patch(
        f"/solutions/{solution_id}", json={"solution": "Updated Solution"}
    )
    results["solution_patch"] = _write_capture(response)
    results["solution_patch_bytes"] = _file_hash(data_dir, "GL-MQR/Solution.csv")
    response = client.delete(f"/solutions/{solution_id}")
    results["solution_delete"] = _write_capture(response)
    results["solution_delete_bytes"] = _file_hash(data_dir, "GL-MQR/Solution.csv")

    response = client.post(
        "/pdsolutions/STHI",
        json=[
            {
                "pdid": "CHARACTERIZATION-001",
                "solutionid": "1",
                "status": "Validated",
                "note": "Characterization update",
            }
        ],
    )
    results["pdsolutions_update"] = _write_capture(response)
    results["pdsolutions_update_bytes"] = _file_hash(
        data_dir, "PdO/ProductSolutionMatrix_STHI.csv"
    )

    response = client.patch(
        "/pypcs/questions/product_name",
        json={"description": "Characterization description"},
    )
    results["question_update"] = _write_capture(response)
    results["question_update_bytes"] = _file_hash(
        data_dir, "QualityMatrix/Settings/PYPCS_Questions.csv"
    )

    submission_payload = {
        "selected_modules": ["LCBI"],
        "role": "TI",
        "submitted_by": "characterization",
        "product_name": "Characterization Submission",
        "status": "draft",
        "cells": [
            {
                "question_id": "product_name",
                "module_key": "LCBI",
                "answer": "Characterization Submission",
            }
        ],
    }
    response = client.post("/pypcs/matrix-submission", json=submission_payload)
    results["submission_create"] = _write_capture(response)
    submission_id = response.json()["submission_id"]
    initial_version = response.json()["versions"]["TI"]
    results["submission_create_bytes"] = {
        "submissions": _file_hash(data_dir, "QualityMatrix/PYPCS_Submissions.csv"),
        "cells": _file_hash(data_dir, "QualityMatrix/PYPCS_SubmissionCells.csv"),
    }
    update_payload = {
        **submission_payload,
        "submission_id": submission_id,
        "expected_version": initial_version,
        "cells": [
            {
                "question_id": "product_name",
                "module_key": "LCBI",
                "answer": "Updated Characterization Submission",
            }
        ],
        "product_name": "Updated Characterization Submission",
    }
    response = client.post("/pypcs/matrix-submission", json=update_payload)
    results["submission_update"] = _write_capture(response)
    results["submission_update_bytes"] = {
        "submissions": _file_hash(data_dir, "QualityMatrix/PYPCS_Submissions.csv"),
        "cells": _file_hash(data_dir, "QualityMatrix/PYPCS_SubmissionCells.csv"),
    }
    stale_payload = {**update_payload, "expected_version": initial_version}
    response = client.post("/pypcs/matrix-submission", json=stale_payload)
    results["submission_stale_conflict"] = _write_capture(response)
    results["submission_stale_conflict_bytes"] = {
        "submissions": _file_hash(data_dir, "QualityMatrix/PYPCS_Submissions.csv"),
        "cells": _file_hash(data_dir, "QualityMatrix/PYPCS_SubmissionCells.csv"),
    }
    response = client.delete(f"/pypcs/submissions/{submission_id}")
    results["submission_delete"] = _write_capture(response)
    results["submission_delete_bytes"] = {
        "submissions": _file_hash(data_dir, "QualityMatrix/PYPCS_Submissions.csv"),
        "cells": _file_hash(data_dir, "QualityMatrix/PYPCS_SubmissionCells.csv"),
    }

    action_payload = {
        "event_id": "CHAR-EVENT-1",
        "actionable_item": "Characterization action",
        "reference": "REF-1",
        "package": ["All"],
        "bare_die_lid": ["All"],
        "foveros": ["All"],
        "segment": ["All"],
        "xvi_tool_type": ["DVI"],
        "lts_ball": ["All"],
        "hdmx_ap_pan": ["All"],
        "owner": "TRB",
        "update_by": "characterization",
    }
    response = client.post("/pypcs/action-items", json=action_payload)
    results["action_item_create"] = _write_capture(response)
    action_nbr = response.json()["nbr"]
    action_version = response.json()["version"]
    results["action_item_create_bytes"] = _file_hash(
        data_dir, "View2/PYPCS_ActionItems.csv"
    )
    update_action = {
        **action_payload,
        "actionable_item": "Updated characterization action",
        "expected_version": action_version,
    }
    response = client.put(f"/pypcs/action-items/{action_nbr}", json=update_action)
    results["action_item_update"] = _write_capture(response)
    results["action_item_update_bytes"] = _file_hash(
        data_dir, "View2/PYPCS_ActionItems.csv"
    )
    before_invalid_event = _file_hash(data_dir, "View2/PYPCS_ActionItems.csv")
    invalid_action = {**update_action, "event_id": "INVALID|EVENT"}
    response = client.put(f"/pypcs/action-items/{action_nbr}", json=invalid_action)
    results["action_item_invalid_event_id"] = _write_capture(response)
    results["action_item_invalid_event_id_bytes"] = {
        "before": before_invalid_event,
        "after": _file_hash(data_dir, "View2/PYPCS_ActionItems.csv"),
    }

    matrix = client.get("/pypcs/product-action-matrix").json()
    matrix_row = matrix["rows"][0]
    action_key = str(matrix["actions"][0]["nbr"])
    original_cell = matrix_row["cells"][action_key]
    decision_payload = {
        "product_key": matrix_row["product_key"],
        "module_group": matrix_row["module_group"],
        "updated_by": "characterization",
        "mode": "draft",
        "cells": [
            {
                "action_nbr": int(action_key),
                "status": "Y",
                "expected_version": original_cell["version"],
            }
        ],
    }
    response = client.put("/pypcs/product-action-matrix/rows", json=decision_payload)
    results["decision_draft"] = _write_capture(response)
    results["decision_draft_bytes"] = _file_hash(
        data_dir, "View3/PYPCS_ProductActionDecisions.csv"
    )
    draft_cell = response.json()["cells"][action_key]
    no_comment_payload = {
        **decision_payload,
        "mode": "final",
        "cells": [
            {
                "action_nbr": int(action_key),
                "status": "Y",
                "expected_version": draft_cell["version"],
            }
        ],
    }
    before_comment_error = _file_hash(data_dir, "View3/PYPCS_ProductActionDecisions.csv")
    response = client.put("/pypcs/product-action-matrix/rows", json=no_comment_payload)
    results["decision_final_comment_required"] = _write_capture(response)
    results["decision_final_comment_required_bytes"] = {
        "before": before_comment_error,
        "after": _file_hash(data_dir, "View3/PYPCS_ProductActionDecisions.csv"),
    }
    final_payload = {
        **no_comment_payload,
        "cells": [
            {
                "action_nbr": int(action_key),
                "status": "Y",
                "comment": "Characterization final comment",
                "expected_version": draft_cell["version"],
            }
        ],
    }
    response = client.put("/pypcs/product-action-matrix/rows", json=final_payload)
    results["decision_final"] = _write_capture(response)
    results["decision_final_bytes"] = _file_hash(
        data_dir, "View3/PYPCS_ProductActionDecisions.csv"
    )

    _snapshot("write_flows.json", results)
"""Endpoints for the merged PYPCS product/action matrix."""

import re
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Response

from app.auth import require_writer
from app.io.csv_excel import value_to_str
from app.io.concurrency import locked_files, record_version
from app.services.product_action_matrix_service import (
    PRODUCT_ACTION_DECISIONS_FILE,
    _decision_values,
    build_product_action_matrix,
    export_product_action_matrix,
    get_product_action_matrix,
    matrix_timestamp,
    rebuild_product_action_matrix,
)

router = APIRouter()


def _field_error(status_code: int, field: str, message: str) -> HTTPException:
    return HTTPException(
        status_code=status_code,
        detail={"field": field, "message": message},
    )


@router.get("/pypcs/product-action-matrix")
def get_pypcs_product_action_matrix(
    module_group: str | None = Query(default=None),
):
    return get_product_action_matrix(module_group)


@router.put("/pypcs/product-action-matrix/rows")
def update_pypcs_product_action_matrix_row(
    payload: Any = Body(...), user: dict = Depends(require_writer)
):
    if not isinstance(payload, dict):
        raise _field_error(422, "body", "Request body must be an object.")
    product_key = value_to_str(payload.get("product_key", ""))
    module_group = value_to_str(payload.get("module_group", ""))
    mode = payload.get("mode", "final")
    if not isinstance(mode, str) or mode not in {"draft", "final"}:
        raise _field_error(422, "mode", "mode must be 'draft' or 'final'.")
    if not product_key:
        raise _field_error(422, "product_key", "product_key is required.")
    if not module_group:
        raise _field_error(422, "module_group", "module_group is required.")
    raw_cells = payload.get("cells", [])
    if not isinstance(raw_cells, list):
        raise _field_error(422, "cells", "cells must be a list.")

    cells = []
    for index, raw_cell in enumerate(raw_cells):
        field = f"cells[{index}]"
        if not isinstance(raw_cell, dict):
            raise _field_error(422, field, "cell must be an object.")
        raw_action_nbr = raw_cell.get("action_nbr")
        if isinstance(raw_action_nbr, bool) or not isinstance(raw_action_nbr, (int, str)):
            raise _field_error(422, f"{field}.action_nbr", "action_nbr must be an integer.")
        if isinstance(raw_action_nbr, str) and not re.fullmatch(r"\d+", raw_action_nbr.strip()):
            raise _field_error(422, f"{field}.action_nbr", "action_nbr must be an integer.")
        status = raw_cell.get("status", "")
        comment = raw_cell.get("comment", "")
        expected_version = raw_cell.get("expected_version")
        if "expected_version" in raw_cell and not isinstance(expected_version, str):
            raise _field_error(
                422, f"{field}.expected_version", "expected_version must be a string."
            )
        if not isinstance(status, str):
            raise _field_error(422, f"{field}.status", "status must be a string.")
        if not isinstance(comment, str):
            raise _field_error(422, f"{field}.comment", "comment must be a string.")
        cells.append(
            {
                "action_nbr": int(raw_action_nbr),
                "status": status.strip(),
                "comment": comment.strip(),
                "expected_version": expected_version,
            }
        )

    return _update_matrix_row(product_key, module_group, user["username"], mode, cells)


def _update_matrix_row(product_key, module_group, updated_by, mode, cells):
    with locked_files(PRODUCT_ACTION_DECISIONS_FILE):
        built = build_product_action_matrix()
        target_rows = [
            row
            for row in built["rows"]
            if row["product_key"] == product_key
            and row["module_group"] == module_group
        ]
        if not target_rows:
            raise _field_error(404, "product_key", "Product/module group not found.")

        valid_actions = {action["nbr"] for action in built["actions"]}
        decision_updates = {}
        conflicts = []
        timestamp = matrix_timestamp()
        for index, cell in enumerate(cells):
            field = f"cells[{index}]"
            if cell["action_nbr"] not in valid_actions:
                raise _field_error(422, f"{field}.action_nbr", "Unknown action_nbr.")
            status = cell["status"]
            comment = cell["comment"]
            if status not in {"", "Y", "N", "NA"}:
                raise _field_error(
                    422, f"{field}.status", "status must be Y, N, NA, or blank."
                )
            if len(comment) > 2000:
                raise _field_error(
                    422, f"{field}.comment", "comment must be at most 2000 characters."
                )
            if mode == "final" and status and not comment:
                raise _field_error(
                    422, f"{field}.comment", "comment is required when status is not blank."
                )

            current = next(
                row
                for row in target_rows
                if row["action_nbr"] == str(cell["action_nbr"])
            )
            decision = _decision_values(current)
            current_version = record_version(decision)
            if (
                cell["expected_version"] is not None
                and cell["expected_version"] != current_version
            ):
                conflicts.append(
                    {
                        "action_nbr": cell["action_nbr"],
                        "current": {
                            **decision,
                            "version": current_version,
                        },
                    }
                )
        if conflicts:
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "conflict",
                    "message": "Some actions were changed by someone else. Reload to see the latest values.",
                    "conflicts": conflicts,
                },
            )

        for cell in cells:
            current = next(
                row
                for row in target_rows
                if row["action_nbr"] == str(cell["action_nbr"])
            )
            status = cell["status"]
            comment = cell["comment"]
            if not status and (mode == "final" or not comment):
                if any(
                    value_to_str(current.get(key, ""))
                    for key in (
                        "status", "decision_state", "comment", "updated_by", "updated_at"
                    )
                ):
                    decision_updates[(product_key, module_group, str(cell["action_nbr"]))] = {
                        "status": "", "decision_state": "", "comment": "",
                        "updated_by": "", "updated_at": "",
                    }
                continue
            decision_state = mode
            if (
                status != current["status"]
                or comment != current["comment"]
                or decision_state != current.get("decision_state", "")
            ):
                decision_updates[(product_key, module_group, str(cell["action_nbr"]))] = {
                    "status": status,
                    "decision_state": decision_state,
                    "comment": comment,
                    "updated_by": updated_by,
                    "updated_at": timestamp,
                }

        rebuild_product_action_matrix(decision_updates, built)
        updated = get_product_action_matrix(module_group, built)
        return next(row for row in updated["rows"] if row["product_key"] == product_key)


@router.get("/pypcs/product-action-matrix/export")
def export_pypcs_product_action_matrix(
    module_group: str | None = Query(default=None),
):
    csv_text, filename = export_product_action_matrix(module_group)
    response_body = ("\ufeff" + csv_text).encode("utf-8")
    return Response(
        content=response_body,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

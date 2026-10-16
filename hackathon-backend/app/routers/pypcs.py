"""PYPCS dynamic questionnaire/matrix endpoints: modules, questions, submissions."""

import uuid
import json
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query

from app.io.csv_excel import value_to_str
from app.io.concurrency import locked_files, record_version
from app.io.generic_csv import (
    delete_rows_from_csv,
    read_generic_csv,
    read_optional_csv,
    safe_int,
    split_pipe_value,
    upsert_rows_to_csv,
    write_rows_to_csv,
)
from app.models.pypcs import (
    PYPCSMatrixSubmissionRequest,
    PYPCSActionItemRequest,
    PYPCSQuestionDescriptionUpdate,
    PYPCSVisibleQuestionsRequest,
)
from app.services.pypcs_service import (
    PYPCS_QUESTION_MODULE_MAP_FILE,
    PYPCS_QUESTIONS_FILE,
    PYPCS_MODULES_FILE,
    PYPCS_SUBMISSION_CELLS_FILE,
    PYPCS_SUBMISSIONS_FILE,
    ACTION_ITEM_APPLICABILITY_FIELDS,
    ACTION_ITEM_HEADERS,
    PYPCS_ACTION_ITEMS_FILE,
    build_action_item_options,
    build_pypcs_visible_questions,
    normalize_pypcs_map,
    normalize_pypcs_module,
    normalize_pypcs_question,
)
from app.services.product_action_matrix_service import invalidate_product_action_matrix_cache

router = APIRouter()

# TP name must be a real identifier, not a short placeholder.
MIN_TP_NAME_LENGTH = 7
PYPCS_SUBMISSION_CELL_HEADERS = [
    "submission_id",
    "question_id",
    "module_key",
    "role",
    "answer",
    "updated_at",
    "updated_by",
]


def action_item_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace(
        "+00:00", "Z"
    )


def validate_action_item(payload: PYPCSActionItemRequest) -> None:
    for field in ("actionable_item", "reference", "owner", "update_by"):
        if not getattr(payload, field):
            raise HTTPException(
                status_code=422,
                detail={"field": field, "message": f"{field} is required."},
            )

    if len(payload.event_id) > 50 or "|" in payload.event_id:
        raise HTTPException(
            status_code=422,
            detail={
                "field": "event_id",
                "message": "event_id must be at most 50 characters and cannot contain '|'.",
            },
        )

    allowed_by_field = build_action_item_options()["fields"]

    for field in ACTION_ITEM_APPLICABILITY_FIELDS:
        options = allowed_by_field[field]
        values = [
            value.strip()
            for value in getattr(payload, field)
            if value.strip()
        ]
        setattr(payload, field, values)

        if "Other" in options and "Other" in values:
            raise HTTPException(
                status_code=422,
                detail={
                    "field": field,
                    "message": f"Please specify the Other value for {field}.",
                },
            )

        invalid = [
            value
            for value in values
            if value not in options
            and not (
                "Other" in options
                and len(value) <= 100
                and "|" not in value
                and value.casefold() not in {"all", "na", "multiple", "other"}
            )
        ]
        if invalid:
            raise HTTPException(
                status_code=422,
                detail={
                    "field": field,
                    "message": (
                        f"Values must be selected from: "
                        f"{', '.join(options)}."
                    ),
                },
            )

    if "Multiple" in payload.xvi_tool_type and not payload.xvi_tool_comment:
        raise HTTPException(
            status_code=422,
            detail={
                "field": "xvi_tool_comment",
                "message": "xvi_tool_comment is required when xvi_tool_type includes Multiple.",
            },
        )


def action_item_row(
    nbr: int, payload: PYPCSActionItemRequest, updated_at: str
) -> dict[str, str]:
    row = {key: value for key, value in payload.model_dump(exclude={"expected_version"}).items()}
    for field in ACTION_ITEM_APPLICABILITY_FIELDS:
        values = row[field]
        row[field] = "All" if "All" in values else "|".join(values)
    row["nbr"] = str(nbr)
    row["updated_at"] = updated_at
    return row


def normalize_action_item(row: dict[str, str]) -> dict:
    item = {
        key: value_to_str(row.get(key, ""))
        for key in ACTION_ITEM_HEADERS
        if key not in ACTION_ITEM_APPLICABILITY_FIELDS
        and key not in {"nbr", "updated_at"}
    }
    item["nbr"] = safe_int(row.get("nbr", ""))
    item["updated_at"] = value_to_str(row.get("updated_at", ""))
    for field in ACTION_ITEM_APPLICABILITY_FIELDS:
        item[field] = split_pipe_value(row.get(field, ""))
    item["version"] = record_version(
        {header: value_to_str(row.get(header, "")) for header in ACTION_ITEM_HEADERS}
    )
    return item


@router.get("/pypcs/action-items")
def get_pypcs_action_items():
    rows = read_generic_csv(PYPCS_ACTION_ITEMS_FILE)
    rows.sort(key=lambda row: safe_int(row.get("nbr", "")))
    items = [normalize_action_item(row) for row in rows]
    return {"count": len(items), "items": items}


@router.get("/pypcs/action-items/options")
def get_pypcs_action_item_options():
    return build_action_item_options()


@router.post("/pypcs/action-items", status_code=201)
def create_pypcs_action_item(payload: PYPCSActionItemRequest):
    validate_action_item(payload)
    with locked_files(PYPCS_ACTION_ITEMS_FILE):
        rows = read_generic_csv(PYPCS_ACTION_ITEMS_FILE)
        next_nbr = max(
            (safe_int(row.get("nbr", "")) for row in rows),
            default=0,
        ) + 1
        created = action_item_row(next_nbr, payload, action_item_timestamp())
        rows.append(created)
        write_rows_to_csv(PYPCS_ACTION_ITEMS_FILE, rows, ACTION_ITEM_HEADERS)
    invalidate_product_action_matrix_cache()
    return normalize_action_item(created)


@router.put("/pypcs/action-items/{nbr}")
def update_pypcs_action_item(nbr: int, payload: PYPCSActionItemRequest):
    validate_action_item(payload)
    with locked_files(PYPCS_ACTION_ITEMS_FILE):
        rows = read_generic_csv(PYPCS_ACTION_ITEMS_FILE)
        target_index = next(
            (
                index
                for index, row in enumerate(rows)
                if safe_int(row.get("nbr", ""), -1) == nbr
            ),
            -1,
        )
        if target_index < 0:
            raise HTTPException(status_code=404, detail="PYPCS action item not found.")
        current = normalize_action_item(rows[target_index])
        if (
            payload.expected_version is not None
            and payload.expected_version != current["version"]
        ):
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "conflict",
                    "message": "This action item was changed by someone else. Reload to see the latest version.",
                    "current": current,
                },
            )
        updated = action_item_row(nbr, payload, action_item_timestamp())
        rows[target_index] = updated
        write_rows_to_csv(PYPCS_ACTION_ITEMS_FILE, rows, ACTION_ITEM_HEADERS)
    invalidate_product_action_matrix_cache()
    return normalize_action_item(updated)


def normalize_status(value: str) -> str:
    # Older rows predate the status column; treat missing status as already-final.
    status = value_to_str(value).lower()
    return status if status in {"draft", "final"} else "final"


def matrix_submission_versions(
    submission: dict[str, str],
    cells: list[dict[str, str]],
    question_rows: list[dict[str, str]],
) -> dict[str, str]:
    roles = sorted(
        {
            normalize_pypcs_question(row)["role"].strip().upper()
            for row in question_rows
            if normalize_pypcs_question(row)["role"].strip()
        }
    )
    versions = {}
    for scope in ["ALL", *roles]:
        canonical_cells = sorted(
            [
                [
                    value_to_str(cell.get("question_id", "")),
                    value_to_str(cell.get("module_key", "")).upper(),
                    value_to_str(cell.get("answer", "")),
                ]
                for cell in cells
                if value_to_str(cell.get("module_key", "")).strip()
                and (
                    scope == "ALL"
                    or value_to_str(cell.get("role", "")).strip().upper() == scope
                )
            ]
        )
        versions[scope] = record_version(
            {
                "selected_modules": value_to_str(
                    submission.get("selected_modules", "")
                ),
                "status": normalize_status(submission.get("status", "")),
                "cells": json.dumps(
                    canonical_cells, ensure_ascii=False, separators=(",", ":")
                ),
            }
        )
    return versions


def _persist_matrix_submission(
    req: PYPCSMatrixSubmissionRequest,
    submitted_cells: list[dict[str, str]],
    selected_modules_ordered: list[str],
    question_rows: list[dict[str, str]],
) -> dict:
    with locked_files(PYPCS_SUBMISSIONS_FILE, PYPCS_SUBMISSION_CELLS_FILE):
        submissions = read_optional_csv(PYPCS_SUBMISSIONS_FILE)
        existing_submission = next(
            (
                row
                for row in submissions
                if req.submission_id
                and value_to_str(row.get("submission_id", ""))
                == value_to_str(req.submission_id)
            ),
            None,
        )
        existing_cells = read_optional_csv(PYPCS_SUBMISSION_CELLS_FILE)
        submission_id = value_to_str(req.submission_id) or str(uuid.uuid4())
        scoped_existing_cells = [
            row
            for row in existing_cells
            if value_to_str(row.get("submission_id", "")) == submission_id
        ]
        scope = req.role.strip().upper() if req.role and req.role.strip() else "ALL"

        if req.expected_version is not None:
            if not existing_submission:
                raise HTTPException(
                    status_code=409,
                    detail={
                        "code": "conflict",
                        "message": "This submission was deleted by someone else.",
                    },
                )
            current_versions = matrix_submission_versions(
                existing_submission, scoped_existing_cells, question_rows
            )
            if req.expected_version != current_versions.get(scope):
                raise HTTPException(
                    status_code=409,
                    detail={
                        "code": "conflict",
                        "message": "This submission was changed by someone else. Reload it to see the latest answers.",
                        "current_versions": current_versions,
                    },
                )

        now = datetime.utcnow().isoformat(timespec="seconds") + "Z"
        created_at = (
            value_to_str(existing_submission.get("created_at", ""))
            if existing_submission
            else now
        )
        updated_at = now if existing_submission else ""
        product_name = value_to_str(req.product_name) or next(
            (
                cell["answer"]
                for cell in submitted_cells
                if cell["question_id"] == "product_name"
            ),
            "",
        )
        prodgroup3 = value_to_str(req.prodgroup3) or next(
            (
                cell["answer"]
                for cell in submitted_cells
                if cell["question_id"] == "prodgroup3"
            ),
            "",
        )
        operation = normalize_operation_value(value_to_str(req.operation)) or next(
            (
                cell["answer"]
                for cell in submitted_cells
                if cell["question_id"] == "operation"
            ),
            "",
        )
        if existing_submission:
            product_name = product_name or value_to_str(
                existing_submission.get("product_name", "")
            )
            prodgroup3 = prodgroup3 or value_to_str(
                existing_submission.get("prodgroup3", "")
            )
            operation = operation or value_to_str(
                existing_submission.get("operation", "")
            )
        if not product_name:
            raise HTTPException(
                status_code=400,
                detail={
                    "message": "Product Name is required, even for drafts.",
                    "missing_required": [
                        {
                            "question_id": "product_name",
                            "module_key": selected_modules_ordered[0]
                            if selected_modules_ordered
                            else "",
                            "display_label": "Product Name",
                            "role": "TI",
                        }
                    ],
                },
            )

        submission_row = {
            "submission_id": submission_id,
            "created_at": created_at,
            "updated_at": updated_at,
            "submitted_by": value_to_str(req.submitted_by),
            "role": value_to_str(req.role),
            "selected_modules": "|".join(selected_modules_ordered),
            "product_name": product_name,
            "prodgroup3": prodgroup3,
            "operation": operation,
            "answer_count": "",
            "status": req.status,
        }
        cell_rows = [
            {
                "submission_id": submission_id,
                "question_id": cell["question_id"],
                "module_key": cell["module_key"],
                "role": cell["role"],
                "answer": cell["answer"],
                "updated_at": updated_at,
                "updated_by": value_to_str(req.submitted_by),
            }
            for cell in submitted_cells
        ]
        merged_cells = [
            row
            for row in existing_cells
            if value_to_str(row.get("submission_id", "")) != submission_id
            or not value_to_str(row.get("module_key", "")).strip()
            or (
                scope != "ALL"
                and value_to_str(row.get("role", "")).strip().upper() != scope
            )
        ] + cell_rows
        submission_row["answer_count"] = str(
            sum(
                value_to_str(row.get("submission_id", "")) == submission_id
                for row in merged_cells
            )
        )
        submission_headers = [
            "submission_id", "created_at", "updated_at", "submitted_by", "role",
            "selected_modules", "product_name", "prodgroup3", "operation",
            "answer_count", "status",
        ]
        upsert_rows_to_csv(
            PYPCS_SUBMISSIONS_FILE,
            "submission_id",
            submission_id,
            [submission_row],
            submission_headers,
        )
        write_rows_to_csv(
            PYPCS_SUBMISSION_CELLS_FILE,
            merged_cells,
            PYPCS_SUBMISSION_CELL_HEADERS,
        )
        invalidate_product_action_matrix_cache()

        saved_submission = next(
            row
            for row in read_optional_csv(PYPCS_SUBMISSIONS_FILE)
            if value_to_str(row.get("submission_id", "")) == submission_id
        )
        saved_cells = [
            row
            for row in read_optional_csv(PYPCS_SUBMISSION_CELLS_FILE)
            if value_to_str(row.get("submission_id", "")) == submission_id
        ]
        return {
            "message": "created" if not existing_submission else "updated",
            "submission_id": submission_id,
            "created_at": created_at,
            "updated_at": updated_at,
            "status": req.status,
            "selected_modules": selected_modules_ordered,
            "role": req.role,
            "cell_count": len(cell_rows),
            "submission_file": PYPCS_SUBMISSIONS_FILE,
            "cell_file": PYPCS_SUBMISSION_CELLS_FILE,
            "versions": matrix_submission_versions(
                saved_submission, saved_cells, question_rows
            ),
        }


def normalize_operation_answer(answer: str, options: list[str]) -> str:
    values = list(dict.fromkeys(part.strip() for part in answer.split("|") if part.strip()))
    if "Other" in options and any(value.casefold() == "other" for value in values):
        raise HTTPException(
            status_code=422,
            detail={"field": "answer", "message": "Please specify the Other operation."},
        )

    invalid = [
        value
        for value in values
        if value not in options
        and not (
            "Other" in options
            and len(value) <= 100
            and value.casefold() not in {"all", "na", "multiple", "other"}
        )
    ]
    if invalid:
        raise HTTPException(
            status_code=422,
            detail={
                "field": "answer",
                "message": f"Operation values must be selected from: {', '.join(options)}.",
            },
        )
    return "|".join(values)


def normalize_operation_value(value: str) -> str:
    return "|".join(
        dict.fromkeys(part.strip() for part in value.split("|") if part.strip())
    )


@router.get("/pypcs/modules")
def get_pypcs_modules():
    rows = read_generic_csv(PYPCS_MODULES_FILE)
    modules = [normalize_pypcs_module(row) for row in rows]

    modules = sorted(
        modules,
        key=lambda item: item.get("sort_order", 0),
    )

    return {
        "count": len(modules),
        "items": modules,
    }


@router.get("/pypcs/questions")
def get_pypcs_questions(role: str | None = None):
    rows = read_generic_csv(PYPCS_QUESTIONS_FILE)
    questions = [normalize_pypcs_question(row) for row in rows]

    if role:
        role_upper = role.upper()
        questions = [
            question for question in questions
            if question.get("role", "").upper() == role_upper
        ]

    questions = sorted(
        questions,
        key=lambda item: item.get("sort_order", 0),
    )

    return {
        "count": len(questions),
        "items": questions,
    }


@router.patch("/pypcs/questions/{question_id}")
def update_pypcs_question_description(
    question_id: str, payload: PYPCSQuestionDescriptionUpdate
):
    target = value_to_str(question_id)
    with locked_files(PYPCS_QUESTIONS_FILE):
        rows = read_generic_csv(PYPCS_QUESTIONS_FILE)
        idx = next(
            (
                i
                for i, row in enumerate(rows)
                if value_to_str(row.get("question_id", "")) == target
            ),
            -1,
        )
        if idx < 0:
            raise HTTPException(status_code=404, detail="PYPCS question not found.")
        headers = list(rows[0].keys())
        rows[idx]["description"] = value_to_str(payload.description)
        write_rows_to_csv(PYPCS_QUESTIONS_FILE, rows, headers)

    return {
        "message": "updated",
        "question_id": target,
        "description": rows[idx]["description"],
    }


@router.post("/pypcs/visible-questions")
def get_pypcs_visible_questions(req: PYPCSVisibleQuestionsRequest):
    return build_pypcs_visible_questions(
        selected_modules_input=req.selected_modules,
        role=req.role,
    )


@router.get("/pypcs/submissions")
def list_pypcs_submissions(
    role: str | None = None,
    module: str | None = None,
    prodgroup3: str | None = None,
    submitted_by: str | None = None,
    limit: int = Query(200, ge=1, le=5000),
    offset: int = Query(0, ge=0),
):
    rows = read_optional_csv(PYPCS_SUBMISSIONS_FILE)

    if role:
        role_upper = value_to_str(role).upper()
        rows = [
            row for row in rows
            if value_to_str(row.get("role", "")).upper() == role_upper
        ]

    if prodgroup3:
        target = value_to_str(prodgroup3).lower()
        rows = [
            row for row in rows
            if value_to_str(row.get("prodgroup3", "")).lower() == target
        ]

    if submitted_by:
        target = value_to_str(submitted_by).lower()
        rows = [
            row for row in rows
            if value_to_str(row.get("submitted_by", "")).lower() == target
        ]

    if module:
        module_upper = value_to_str(module).upper()

        rows = [
            row for row in rows
            if module_upper in [
                item.upper()
                for item in split_pipe_value(row.get("selected_modules", ""))
            ]
        ]

    rows = sorted(
        rows,
        key=lambda row: value_to_str(row.get("created_at", "")),
        reverse=True,
    )

    items = []

    for row in rows[offset : offset + limit]:
        items.append(
            {
                "submission_id": value_to_str(row.get("submission_id", "")),
                "created_at": value_to_str(row.get("created_at", "")),
                "submitted_by": value_to_str(row.get("submitted_by", "")),
                "role": value_to_str(row.get("role", "")),
                "selected_modules": split_pipe_value(
                    row.get("selected_modules", "")
                ),
                "product_name": value_to_str(row.get("product_name", "")),
                "prodgroup3": value_to_str(row.get("prodgroup3", "")),
                "operation": value_to_str(row.get("operation", "")),
                "answer_count": value_to_str(row.get("answer_count", "")),
                "status": normalize_status(row.get("status", "")),
                "updated_at": value_to_str(row.get("updated_at", "")),
            }
        )

    return {
        "count": len(items),
        "total": len(rows),
        "limit": limit,
        "offset": offset,
        "items": items,
    }


@router.get("/pypcs/submissions/{submission_id}")
def get_pypcs_submission_detail(submission_id: str):
    target_id = value_to_str(submission_id)

    submissions = read_optional_csv(PYPCS_SUBMISSIONS_FILE)

    submission = None

    for row in submissions:
        if value_to_str(row.get("submission_id", "")) == target_id:
            submission = row
            break

    if not submission:
        raise HTTPException(
            status_code=404,
            detail="PYPCS submission not found.",
        )

    question_rows = read_optional_csv(PYPCS_QUESTIONS_FILE)
    questions_by_id = {}
    for row in question_rows:
        question = normalize_pypcs_question(row)
        if question["question_id"]:
            questions_by_id[question["question_id"]] = question

    mapping_by_pair = {}
    for row in read_optional_csv(PYPCS_QUESTION_MODULE_MAP_FILE):
        mapping = normalize_pypcs_map(row)
        if mapping["visible_default"]:
            mapping_by_pair[(mapping["question_id"], mapping["module_key"].upper())] = mapping

    all_cells = read_optional_csv(PYPCS_SUBMISSION_CELLS_FILE)
    submission_cells = [
        row
        for row in all_cells
        if value_to_str(row.get("submission_id", "")) == target_id
    ]
    answer_cells = [
        row for row in submission_cells
        if not value_to_str(row.get("module_key", "")).strip()
    ]
    module_cells = [
        row for row in submission_cells
        if value_to_str(row.get("module_key", "")).strip()
    ]
    selected_modules = split_pipe_value(submission.get("selected_modules", ""))
    visible_questions_by_role = {}
    answers = []
    for row in answer_cells:
        role = value_to_str(row.get("role", ""))
        if role not in visible_questions_by_role:
            visible_result = build_pypcs_visible_questions(
                selected_modules_input=selected_modules,
                role=role or None,
            )
            visible_questions_by_role[role] = {
                item["question_id"]: item for item in visible_result["items"]
            }
        question_id = value_to_str(row.get("question_id", ""))
        question = questions_by_id.get(question_id, {})
        setup = visible_questions_by_role[role].get(question_id, {})
        answers.append(
            {
                "submission_id": value_to_str(row.get("submission_id", "")),
                "question_id": question_id,
                "answer": value_to_str(row.get("answer", "")),
                "display_label": value_to_str(
                    question.get("display_label", "")
                    or question.get("header", "")
                    or question_id
                ),
                "role": role,
                "required": "Y" if setup.get("required", False) else "N",
                "applies_to": setup.get("applies_to", []),
                "field_type": value_to_str(
                    setup.get("field_type", question.get("field_type", ""))
                ),
                "created_at": value_to_str(row.get("updated_at", "")),
            }
        )

    cells = []

    for row in module_cells:
        question_id = value_to_str(row.get("question_id", ""))
        question = questions_by_id.get(question_id, {})
        module_key = value_to_str(row.get("module_key", ""))
        mapping = mapping_by_pair.get((question_id, module_key.upper()), {})

        cells.append(
            {
                "submission_id": target_id,
                "created_at": value_to_str(submission.get("created_at", "")),
                "submitted_by": value_to_str(submission.get("submitted_by", "")),
                "role": value_to_str(row.get("role", "")),
                "product_name": value_to_str(submission.get("product_name", "")),
                "prodgroup3": value_to_str(submission.get("prodgroup3", "")),
                "operation": value_to_str(submission.get("operation", "")),
                "question_id": question_id,
                "display_label": value_to_str(
                    question.get("display_label", "")
                    or question.get("header", "")
                    or question_id
                ),
                "description": value_to_str(question.get("description", "")),
                "module_key": module_key,
                "answer": value_to_str(row.get("answer", "")),
                "required": "Y" if mapping.get("required", False) else "N",
                "editable": "Y",
                "field_type": value_to_str(question.get("field_type", "")),
                "applies_to": split_pipe_value(module_key),
                "source_rule": value_to_str(mapping.get("source_rule", "")),
                "updated_at": value_to_str(row.get("updated_at", "")),
                "updated_by": value_to_str(row.get("updated_by", "")),
            }
        )

    return {
        "submission": {
            "submission_id": value_to_str(submission.get("submission_id", "")),
            "created_at": value_to_str(submission.get("created_at", "")),
            "submitted_by": value_to_str(submission.get("submitted_by", "")),
            "role": value_to_str(submission.get("role", "")),
            "selected_modules": selected_modules,
            "product_name": value_to_str(submission.get("product_name", "")),
            "prodgroup3": value_to_str(submission.get("prodgroup3", "")),
            "operation": value_to_str(submission.get("operation", "")),
            "answer_count": value_to_str(submission.get("answer_count", "")),
            "status": normalize_status(submission.get("status", "")),
            "updated_at": value_to_str(submission.get("updated_at", "")),
            "versions": matrix_submission_versions(
                submission, submission_cells, question_rows
            ),
        },
        "answer_count": len(answers),
        "answers": answers,
        "cell_count": len(cells),
        "cells": cells,
    }


@router.delete("/pypcs/submissions/{submission_id}")
def delete_pypcs_submission(submission_id: str):
    target_id = value_to_str(submission_id)
    with locked_files(
        PYPCS_SUBMISSIONS_FILE,
        PYPCS_SUBMISSION_CELLS_FILE,
    ):
        deleted = delete_rows_from_csv(
            PYPCS_SUBMISSIONS_FILE, "submission_id", target_id
        )
        if not deleted:
            raise HTTPException(
                status_code=404,
                detail="PYPCS submission not found.",
            )
        delete_rows_from_csv(PYPCS_SUBMISSION_CELLS_FILE, "submission_id", target_id)
        invalidate_product_action_matrix_cache()

    return {"message": "deleted", "submission_id": target_id}


@router.post("/pypcs/matrix-submission")
def create_pypcs_matrix_submission(req: PYPCSMatrixSubmissionRequest):
    if not req.selected_modules:
        raise HTTPException(
            status_code=400,
            detail="selected_modules is required.",
        )

    # Preserve the caller's original module order (not sorted) for column ordering.
    selected_modules_ordered = []
    for module in req.selected_modules:
        module_upper = value_to_str(module).upper()
        if module_upper and module_upper not in selected_modules_ordered:
            selected_modules_ordered.append(module_upper)

    selected_modules = set(selected_modules_ordered)

    if not req.cells:
        raise HTTPException(
            status_code=400,
            detail="cells is required.",
        )

    question_rows = read_generic_csv(PYPCS_QUESTIONS_FILE)
    map_rows = read_generic_csv(PYPCS_QUESTION_MODULE_MAP_FILE)

    questions_by_id = {}

    for row in question_rows:
        question = normalize_pypcs_question(row)

        if question["question_id"]:
            questions_by_id[question["question_id"]] = question

    mapping_by_pair = {}
    applicable_pairs = set()
    required_pairs = set()

    for row in map_rows:
        mapping = normalize_pypcs_map(row)

        if not mapping["visible_default"]:
            continue

        question_id = mapping["question_id"]
        module_key = mapping["module_key"].upper()
        pair = (question_id, module_key)

        mapping_by_pair[pair] = mapping
        applicable_pairs.add(pair)

        if mapping["required"]:
            required_pairs.add(pair)

    submitted_cells = []
    submitted_pair_to_answer = {}

    for cell in req.cells:
        question_id = value_to_str(cell.question_id)
        module_key = value_to_str(cell.module_key).upper()
        answer = value_to_str(cell.answer)

        if not question_id or not module_key:
            continue

        if module_key not in selected_modules:
            raise HTTPException(
                status_code=400,
                detail=f"Cell module {module_key} is not in selected_modules.",
            )

        if question_id not in questions_by_id:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown question_id: {question_id}",
            )

        if (question_id, module_key) not in applicable_pairs:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Question {question_id} is not applicable "
                    f"to module {module_key}."
                ),
            )

        question = questions_by_id[question_id]

        if (
            req.role
            and question.get("role", "").upper()
            != value_to_str(req.role).upper()
        ):
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Question {question_id} is not editable "
                    f"for role {req.role}."
                ),
            )

        if question_id == "operation":
            options_by_module = question.get("options_by_module", {})
            module_options = next(
                (
                    options
                    for key, options in options_by_module.items()
                    if key.upper() == module_key
                ),
                [],
            )
            answer = normalize_operation_answer(answer, module_options)

        mapping = mapping_by_pair.get((question_id, module_key), {})

        submitted_cells.append(
            {
                "question_id": question_id,
                "module_key": module_key,
                "answer": answer,
                "role": question.get("role", ""),
                "required": "Y"
                if (question_id, module_key) in required_pairs
                else "N",
                "field_type": question.get("field_type", ""),
                "applies_to": module_key,
                "source_rule": mapping.get("source_rule", ""),
            }
        )

        submitted_pair_to_answer[(question_id, module_key)] = answer

    # TP name must always be a real value once typed, draft or not.
    short_tp_names = [
        cell for cell in submitted_cells
        if cell["question_id"] == "tp_name"
        and cell["answer"]
        and len(cell["answer"]) < MIN_TP_NAME_LENGTH
    ]

    if short_tp_names:
        raise HTTPException(
            status_code=400,
            detail={
                "message": (
                    f"TP name must be at least {MIN_TP_NAME_LENGTH} "
                    "characters long."
                ),
                "invalid_cells": [
                    {
                        "question_id": "tp_name",
                        "module_key": cell["module_key"],
                    }
                    for cell in short_tp_names
                ],
            },
        )

    missing_required = []

    if req.status == "final":
        for question_id, module_key in required_pairs:
            if module_key not in selected_modules:
                continue

            question = questions_by_id.get(question_id)

            if not question:
                continue

            if (
                req.role
                and question.get("role", "").upper()
                != value_to_str(req.role).upper()
            ):
                continue

            answer = submitted_pair_to_answer.get((question_id, module_key), "")

            if not value_to_str(answer):
                missing_required.append(
                    {
                        "question_id": question_id,
                        "module_key": module_key,
                        "display_label": question.get(
                            "display_label",
                            question_id,
                        ),
                        "role": question.get("role", ""),
                    }
                )

        nsb_question = questions_by_id.get("nsb")
        nsb_comment_question = questions_by_id.get("nsb_comment")
        if nsb_question and nsb_comment_question:
            for module_key in selected_modules_ordered:
                if ("nsb_comment", module_key) not in applicable_pairs:
                    continue

                if req.role:
                    role_filter = value_to_str(req.role).upper()
                    if (
                        nsb_question.get("role", "").upper() != role_filter
                        or nsb_comment_question.get("role", "").upper()
                        != role_filter
                    ):
                        continue

                nsb_answer = value_to_str(
                    submitted_pair_to_answer.get(("nsb", module_key), "")
                ).strip().upper()
                comment_answer = value_to_str(
                    submitted_pair_to_answer.get(("nsb_comment", module_key), "")
                ).strip()

                if nsb_answer == "Y" and not comment_answer:
                    missing_required.append(
                        {
                            "question_id": "nsb_comment",
                            "module_key": module_key,
                            "display_label": nsb_comment_question.get(
                                "display_label",
                                "nsb_comment",
                            ),
                            "role": nsb_comment_question.get("role", ""),
                        }
                    )

    if missing_required:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "Missing required PYPCS matrix cells.",
                "missing_required": missing_required,
            },
        )

    return _persist_matrix_submission(
        req, submitted_cells, selected_modules_ordered, question_rows
    )

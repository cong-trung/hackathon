"""PYPCS dynamic questionnaire/matrix endpoints: modules, questions, submissions."""

import uuid
from datetime import datetime

from fastapi import APIRouter, HTTPException, Query

from app.io.csv_excel import value_to_str
from app.io.generic_csv import (
    append_rows_to_csv,
    delete_rows_from_csv,
    read_generic_csv,
    read_optional_csv,
    split_pipe_value,
    upsert_rows_to_csv,
)
from app.models.pypcs import (
    PYPCSMatrixSubmissionRequest,
    PYPCSSubmissionRequest,
    PYPCSVisibleQuestionsRequest,
)
from app.services.pypcs_service import (
    PYPCS_QUESTION_MODULE_MAP_FILE,
    PYPCS_QUESTIONS_FILE,
    PYPCS_MODULES_FILE,
    PYPCS_SUBMISSION_ANSWERS_FILE,
    PYPCS_SUBMISSION_CELLS_FILE,
    PYPCS_SUBMISSIONS_FILE,
    build_pypcs_visible_questions,
    normalize_pypcs_map,
    normalize_pypcs_module,
    normalize_pypcs_question,
)

router = APIRouter()

# TP name must be a real identifier, not a short placeholder.
MIN_TP_NAME_LENGTH = 7


def normalize_status(value: str) -> str:
    # Older rows predate the status column; treat missing status as already-final.
    status = value_to_str(value).lower()
    return status if status in {"draft", "final"} else "final"


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


@router.post("/pypcs/visible-questions")
def get_pypcs_visible_questions(req: PYPCSVisibleQuestionsRequest):
    return build_pypcs_visible_questions(
        selected_modules_input=req.selected_modules,
        role=req.role,
    )


@router.post("/pypcs/submission")
def create_pypcs_submission(req: PYPCSSubmissionRequest):
    if not req.selected_modules:
        raise HTTPException(
            status_code=400,
            detail="selected_modules is required.",
        )

    visible_result = build_pypcs_visible_questions(
        selected_modules_input=req.selected_modules,
        role=req.role,
    )

    visible_questions = visible_result["items"]

    if not visible_questions:
        raise HTTPException(
            status_code=400,
            detail="No visible questions found for selected modules and role.",
        )

    answers = {
        key: value_to_str(value)
        for key, value in req.answers.items()
    }

    missing_required = []

    for question in visible_questions:
        question_id = question.get("question_id", "")
        is_required = bool(question.get("required", False))

        if is_required and not value_to_str(answers.get(question_id, "")):
            missing_required.append(
                {
                    "question_id": question_id,
                    "display_label": question.get("display_label", question_id),
                    "applies_to": question.get("applies_to", []),
                    "role": question.get("role", ""),
                }
            )

    if missing_required:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "Missing required PYPCS answers.",
                "missing_required": missing_required,
            },
        )

    submission_id = str(uuid.uuid4())
    created_at = datetime.utcnow().isoformat(timespec="seconds") + "Z"

    product_name = value_to_str(
        req.product_name or answers.get("product_name", "")
    )
    prodgroup3 = value_to_str(
        req.prodgroup3 or answers.get("prodgroup3", "")
    )
    operation = value_to_str(
        req.operation or answers.get("operation", "")
    )

    submission_row = {
        "submission_id": submission_id,
        "created_at": created_at,
        "submitted_by": value_to_str(req.submitted_by),
        "role": value_to_str(req.role),
        "selected_modules": "|".join(req.selected_modules),
        "product_name": product_name,
        "prodgroup3": prodgroup3,
        "operation": operation,
        "answer_count": str(len(answers)),
    }

    submission_headers = [
        "submission_id",
        "created_at",
        "submitted_by",
        "role",
        "selected_modules",
        "product_name",
        "prodgroup3",
        "operation",
        "answer_count",
    ]

    answer_rows = []

    visible_by_id = {
        question.get("question_id", ""): question
        for question in visible_questions
    }

    for question_id, answer_value in answers.items():
        question = visible_by_id.get(question_id, {})

        answer_rows.append(
            {
                "submission_id": submission_id,
                "question_id": question_id,
                "answer": answer_value,
                "display_label": value_to_str(
                    question.get("display_label", "")
                ),
                "role": value_to_str(question.get("role", "")),
                "required": "Y" if question.get("required", False) else "N",
                "applies_to": "|".join(question.get("applies_to", [])),
                "field_type": value_to_str(question.get("field_type", "")),
                "created_at": created_at,
            }
        )

    answer_headers = [
        "submission_id",
        "question_id",
        "answer",
        "display_label",
        "role",
        "required",
        "applies_to",
        "field_type",
        "created_at",
    ]

    append_rows_to_csv(
        PYPCS_SUBMISSIONS_FILE,
        [submission_row],
        submission_headers,
    )

    append_rows_to_csv(
        PYPCS_SUBMISSION_ANSWERS_FILE,
        answer_rows,
        answer_headers,
    )

    return {
        "message": "created",
        "submission_id": submission_id,
        "created_at": created_at,
        "selected_modules": req.selected_modules,
        "role": req.role,
        "visible_question_count": len(visible_questions),
        "answer_count": len(answer_rows),
        "submission_file": PYPCS_SUBMISSIONS_FILE,
        "answer_file": PYPCS_SUBMISSION_ANSWERS_FILE,
    }


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

    all_answers = read_optional_csv(PYPCS_SUBMISSION_ANSWERS_FILE)

    answers = [
        {
            "submission_id": value_to_str(row.get("submission_id", "")),
            "question_id": value_to_str(row.get("question_id", "")),
            "answer": value_to_str(row.get("answer", "")),
            "display_label": value_to_str(row.get("display_label", "")),
            "role": value_to_str(row.get("role", "")),
            "required": value_to_str(row.get("required", "")),
            "applies_to": split_pipe_value(row.get("applies_to", "")),
            "field_type": value_to_str(row.get("field_type", "")),
            "created_at": value_to_str(row.get("created_at", "")),
        }
        for row in all_answers
        if value_to_str(row.get("submission_id", "")) == target_id
    ]

    question_rows = read_optional_csv(PYPCS_QUESTIONS_FILE)

    questions_by_id = {}

    for row in question_rows:
        question = normalize_pypcs_question(row)

        if question["question_id"]:
            questions_by_id[question["question_id"]] = question

    all_cells = read_optional_csv(PYPCS_SUBMISSION_CELLS_FILE)

    cells = []

    for row in all_cells:
        if value_to_str(row.get("submission_id", "")) != target_id:
            continue

        question_id = value_to_str(row.get("question_id", ""))
        question = questions_by_id.get(question_id, {})

        cells.append(
            {
                "submission_id": value_to_str(row.get("submission_id", "")),
                "created_at": value_to_str(row.get("created_at", "")),
                "submitted_by": value_to_str(row.get("submitted_by", "")),
                "role": value_to_str(row.get("role", "")),
                "product_name": value_to_str(row.get("product_name", "")),
                "prodgroup3": value_to_str(row.get("prodgroup3", "")),
                "operation": value_to_str(row.get("operation", "")),
                "question_id": question_id,
                "display_label": value_to_str(
                    question.get("display_label", "")
                    or question.get("header", "")
                    or question_id
                ),
                "description": value_to_str(question.get("description", "")),
                "module_key": value_to_str(row.get("module_key", "")),
                "answer": value_to_str(row.get("answer", "")),
                "required": value_to_str(row.get("required", "")),
                "editable": value_to_str(row.get("editable", "")),
                "field_type": value_to_str(row.get("field_type", "")),
                "applies_to": split_pipe_value(row.get("applies_to", "")),
                "source_rule": value_to_str(row.get("source_rule", "")),
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
            "selected_modules": split_pipe_value(
                submission.get("selected_modules", "")
            ),
            "product_name": value_to_str(submission.get("product_name", "")),
            "prodgroup3": value_to_str(submission.get("prodgroup3", "")),
            "operation": value_to_str(submission.get("operation", "")),
            "answer_count": value_to_str(submission.get("answer_count", "")),
            "status": normalize_status(submission.get("status", "")),
            "updated_at": value_to_str(submission.get("updated_at", "")),
        },
        "answer_count": len(answers),
        "answers": answers,
        "cell_count": len(cells),
        "cells": cells,
    }


@router.delete("/pypcs/submissions/{submission_id}")
def delete_pypcs_submission(submission_id: str):
    target_id = value_to_str(submission_id)

    deleted = delete_rows_from_csv(
        PYPCS_SUBMISSIONS_FILE, "submission_id", target_id
    )

    if not deleted:
        raise HTTPException(
            status_code=404,
            detail="PYPCS submission not found.",
        )

    delete_rows_from_csv(PYPCS_SUBMISSION_ANSWERS_FILE, "submission_id", target_id)
    delete_rows_from_csv(PYPCS_SUBMISSION_CELLS_FILE, "submission_id", target_id)

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

    if missing_required:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "Missing required PYPCS matrix cells.",
                "missing_required": missing_required,
            },
        )

    existing_submission = None

    if req.submission_id:
        for row in read_optional_csv(PYPCS_SUBMISSIONS_FILE):
            if value_to_str(row.get("submission_id", "")) == value_to_str(
                req.submission_id
            ):
                existing_submission = row
                break

    submission_id = value_to_str(req.submission_id) or str(uuid.uuid4())
    now = datetime.utcnow().isoformat(timespec="seconds") + "Z"
    created_at = (
        value_to_str(existing_submission.get("created_at", ""))
        if existing_submission
        else now
    )
    updated_at = now if existing_submission else ""

    product_name = value_to_str(req.product_name)
    prodgroup3 = value_to_str(req.prodgroup3)
    operation = value_to_str(req.operation)

    if not product_name:
        product_name = next(
            (
                cell["answer"]
                for cell in submitted_cells
                if cell["question_id"] == "product_name"
            ),
            "",
        )

    if not prodgroup3:
        prodgroup3 = next(
            (
                cell["answer"]
                for cell in submitted_cells
                if cell["question_id"] == "prodgroup3"
            ),
            "",
        )

    if not operation:
        operation = next(
            (
                cell["answer"]
                for cell in submitted_cells
                if cell["question_id"] == "operation"
            ),
            "",
        )

    # A role-scoped edit (e.g. ME-only) may not resend TI-owned common fields;
    # fall back to what was already saved instead of wiping them out.
    if existing_submission:
        if not product_name:
            product_name = value_to_str(existing_submission.get("product_name", ""))
        if not prodgroup3:
            prodgroup3 = value_to_str(existing_submission.get("prodgroup3", ""))
        if not operation:
            operation = value_to_str(existing_submission.get("operation", ""))

    # Product name is the one field required even for drafts.
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
        # Must match the (uppercased) module_key casing used in cell rows below.
        "selected_modules": "|".join(selected_modules_ordered),
        "product_name": product_name,
        "prodgroup3": prodgroup3,
        "operation": operation,
        "answer_count": str(len(submitted_cells)),
        "status": req.status,
    }

    submission_headers = [
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

    cell_rows = []

    for cell in submitted_cells:
        cell_rows.append(
            {
                "submission_id": submission_id,
                "created_at": created_at,
                "submitted_by": value_to_str(req.submitted_by),
                "role": cell["role"],
                "product_name": product_name,
                "prodgroup3": prodgroup3,
                "operation": operation,
                "question_id": cell["question_id"],
                "module_key": cell["module_key"],
                "answer": cell["answer"],
                "required": cell["required"],
                "editable": "Y",
                "field_type": cell["field_type"],
                "applies_to": cell["applies_to"],
                "source_rule": cell["source_rule"],
                "updated_at": updated_at,
                "updated_by": "",
            }
        )

    cell_headers = [
        "submission_id",
        "created_at",
        "submitted_by",
        "role",
        "product_name",
        "prodgroup3",
        "operation",
        "question_id",
        "module_key",
        "answer",
        "required",
        "editable",
        "field_type",
        "applies_to",
        "source_rule",
        "updated_at",
        "updated_by",
    ]

    upsert_rows_to_csv(
        PYPCS_SUBMISSIONS_FILE,
        "submission_id",
        submission_id,
        [submission_row],
        submission_headers,
    )

    upsert_rows_to_csv(
        PYPCS_SUBMISSION_CELLS_FILE,
        "submission_id",
        submission_id,
        cell_rows,
        cell_headers,
    )

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
    }

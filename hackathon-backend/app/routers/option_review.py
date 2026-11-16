"""PYPCS option review queue: TI or admin approve, reject, or map custom 'Other' values."""

from typing import Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from app.auth import require_ti_or_admin
from app.services.option_review_service import (
    apply_option_decision,
    list_option_reviews,
    list_option_reviews_page,
    option_review_meta,
)

router = APIRouter()


class OptionReviewDecisionRequest(BaseModel):
    question_id: str
    value: str
    action: str
    module_key: str = ""
    mapped_to: str = ""
    operation_description: str = ""
    note: str = ""


@router.get("/pypcs/option-review/meta")
def get_pypcs_option_review_meta(user: dict[str, str] = Depends(require_ti_or_admin)):
    return option_review_meta()


@router.get("/pypcs/option-review")
def get_pypcs_option_review(
    status: str = Query("pending"),
    view: Literal["page"] | None = Query(default=None),
    q: str | None = Query(default=None, max_length=200),
    question_id: str | None = Query(default=None, max_length=100),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    user: dict[str, str] = Depends(require_ti_or_admin),
):
    if view == "page":
        return list_option_reviews_page(
            status, q=q, question_id=question_id, limit=limit, offset=offset
        )
    return list_option_reviews(status)


@router.post("/pypcs/option-review/decision")
def post_pypcs_option_review_decision(
    req: OptionReviewDecisionRequest,
    user: dict[str, str] = Depends(require_ti_or_admin),
):
    return apply_option_decision(
        question_id=req.question_id,
        module_key=req.module_key,
        value=req.value,
        action=req.action,
        mapped_to=req.mapped_to,
        operation_description=req.operation_description,
        note=req.note,
        user=user,
    )

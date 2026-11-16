"""PYPCS option review queue: TI or admin approve, reject, or map custom 'Other' values."""

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from app.auth import require_ti_or_admin
from app.services.option_review_service import apply_option_decision, list_option_reviews

router = APIRouter()


class OptionReviewDecisionRequest(BaseModel):
    question_id: str
    value: str
    action: str
    module_key: str = ""
    mapped_to: str = ""
    operation_description: str = ""
    note: str = ""


@router.get("/pypcs/option-review")
def get_pypcs_option_review(
    status: str = Query("pending"),
    user: dict[str, str] = Depends(require_ti_or_admin),
):
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

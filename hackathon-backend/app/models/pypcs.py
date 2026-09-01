"""Request models for the PYPCS dynamic questionnaire/matrix subsystem."""

from typing import Any, Literal

from pydantic import BaseModel, Field


class PYPCSVisibleQuestionsRequest(BaseModel):
    selected_modules: list[str] = Field(default_factory=list)
    role: str | None = None


class PYPCSSubmissionRequest(BaseModel):
    selected_modules: list[str] = Field(default_factory=list)
    role: str | None = None
    submitted_by: str | None = None
    product_name: str | None = None
    prodgroup3: str | None = None
    operation: str | None = None
    answers: dict[str, Any] = Field(default_factory=dict)


class PYPCSMatrixCellPayload(BaseModel):
    question_id: str = Field(..., min_length=1)
    module_key: str = Field(..., min_length=1)
    answer: str = ""


class PYPCSMatrixSubmissionRequest(BaseModel):
    selected_modules: list[str] = Field(default_factory=list)
    role: str | None = None
    submitted_by: str | None = None
    product_name: str | None = None
    prodgroup3: str | None = None
    operation: str | None = None
    cells: list[PYPCSMatrixCellPayload] = Field(default_factory=list)
    # If set, updates the existing submission in place instead of creating a new one.
    submission_id: str | None = None
    status: Literal["draft", "final"] = "final"

"""Request models for the PYPCS dynamic questionnaire/matrix subsystem."""

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


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


class PYPCSQuestionDescriptionUpdate(BaseModel):
    description: str = ""


class PYPCSActionItemRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ar_follow_up: str = Field(default="", max_length=5000)
    actionable_item: str = Field(default="", max_length=5000)
    reference: str = Field(default="", max_length=5000)
    description: str = Field(default="", max_length=5000)
    package: list[str] = Field(default_factory=list, max_length=100)
    bare_die_lid: list[str] = Field(default_factory=list, max_length=100)
    foveros: list[str] = Field(default_factory=list, max_length=100)
    segment: list[str] = Field(default_factory=list, max_length=100)
    xvi_tool_type: list[str] = Field(default_factory=list, max_length=100)
    xvi_tool_comment: str = Field(default="", max_length=5000)
    lts_ball: list[str] = Field(default_factory=list, max_length=100)
    hdmx_ap_pan: list[str] = Field(default_factory=list, max_length=100)
    owner: str = Field(default="", max_length=5000)
    update_by: str = Field(default="", max_length=5000)
    scenario: str = Field(default="", max_length=5000)

    @field_validator(
        "ar_follow_up",
        "actionable_item",
        "reference",
        "description",
        "xvi_tool_comment",
        "owner",
        "update_by",
        "scenario",
        mode="before",
    )
    @classmethod
    def trim_text(cls, value):
        return value.strip() if isinstance(value, str) else value

    @field_validator(
        "package",
        "bare_die_lid",
        "foveros",
        "segment",
        "xvi_tool_type",
        "lts_ball",
        "hdmx_ap_pan",
        mode="before",
    )
    @classmethod
    def trim_applicability_values(cls, values):
        if isinstance(values, list):
            return [value.strip() if isinstance(value, str) else value for value in values]
        return values

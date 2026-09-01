"""Request payload models for product-basis and solution endpoints."""

from pydantic import BaseModel, ConfigDict, Field


class FlexiblePayload(BaseModel):
    model_config = ConfigDict(extra="allow")


class ProductBasisPayload(BaseModel):
    model_config = ConfigDict(extra="allow")
    product: str = Field(..., min_length=1)
    prodgroup3: str = Field(..., min_length=1)
    module: str = Field(..., min_length=1)


class SolutionPayload(BaseModel):
    model_config = ConfigDict(extra="allow")
    module: str = Field(..., min_length=1)
    solution: str = Field(..., min_length=1)
    key_summary: str | None = ""
    excursion_related: str | None = ""


class PdSolutionItem(BaseModel):
    pdid: str = Field(..., min_length=1)
    solutionid: str = Field(..., min_length=1)
    status: str = ""
    note: str = ""

"""Request/response models for the AI chat endpoint."""

from pydantic import BaseModel, Field


class AIChatRequest(BaseModel):
    message: str = Field(..., min_length=1)
    history: list[dict[str, str]] = Field(default_factory=list)


class AIChatResponse(BaseModel):
    answer: str
    model: str

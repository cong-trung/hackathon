"""AI chat endpoints backed by the NYRA gateway."""

import os

from fastapi import APIRouter, HTTPException

from app.models.chat import AIChatRequest, AIChatResponse
from app.services.chat_context import get_data_snapshot
from app.services.chat_service import (
    CHAT_SYSTEM_PROMPT,
    NYRA_CHAT_MODEL,
    get_nyra_client,
)

router = APIRouter()


@router.get("/chat/health")
def chat_health():
    return {
        "status": "ok",
        "nyra_api_key_configured": bool(os.getenv("NYRA_API_KEY")),
        "model": NYRA_CHAT_MODEL,
    }


@router.post("/chat", response_model=AIChatResponse)
def chat_with_ai(req: AIChatRequest):
    client = get_nyra_client()

    system_content = CHAT_SYSTEM_PROMPT
    snapshot = get_data_snapshot()
    if snapshot:
        system_content = (
            f"{CHAT_SYSTEM_PROMPT}"
            "\n\nLIVE DATA SNAPSHOT (read from the app's current data files):\n"
            f"{snapshot}"
        )

    messages = [{"role": "system", "content": system_content}]

    for item in req.history[-10:]:
        role = item.get("role", "")
        content = item.get("content", "")
        if role in {"user", "assistant"} and content:
            messages.append({"role": role, "content": content})

    messages.append({"role": "user", "content": req.message})

    try:
        response = client.chat.completions.create(
            model=NYRA_CHAT_MODEL,
            messages=messages,
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=500,
            detail=f"NYRA chat request failed: {exc}",
        )

    return {
        "answer": response.choices[0].message.content,
        "model": NYRA_CHAT_MODEL,
    }

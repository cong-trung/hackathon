"""AI chat endpoints backed by the NYRA gateway."""

import os

from fastapi import APIRouter, HTTPException

from app.models.chat import AIChatRequest, AIChatResponse
from app.services.chat_service import NYRA_CHAT_MODEL, get_nyra_client

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

    messages = [
        {
            "role": "system",
            "content": (
                "You are a helpful Quality Matrix assistant. "
                "Answer clearly and practically. "
                "If the user asks in Vietnamese, answer in Vietnamese. "
                "If the user asks in English, answer in English."
            ),
        }
    ]

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

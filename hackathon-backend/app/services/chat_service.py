"""NYRA gateway client for the AI chat endpoint."""

import os

from fastapi import HTTPException

NYRA_CHAT_MODEL = os.getenv("NYRA_CHAT_MODEL", "gpt-5.4-mini")


def get_nyra_client():
    api_key = os.getenv("NYRA_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="NYRA_API_KEY is not configured on backend.",
        )
    try:
        from nyra_services import NyraGateway
    except ImportError as exc:
        raise HTTPException(
            status_code=500,
            detail=(
                "Cannot import nyra_services. Please install nyra-services. "
                f"Original error: {exc}"
            ),
        )
    return NyraGateway(api_key=api_key)

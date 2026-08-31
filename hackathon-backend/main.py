"""Entrypoint kept at repo root so `uvicorn main:app` (Dockerfile/docs) keeps working.

All actual application code now lives under the `app/` package.
"""

from app.main import app

__all__ = ["app"]

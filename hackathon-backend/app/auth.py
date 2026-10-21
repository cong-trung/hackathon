"""Identity supplied by the trusted Express proxy."""

import hmac
from dataclasses import dataclass
from urllib.parse import unquote

from fastapi import Request

from app.config import PROXY_SHARED_SECRET


@dataclass(frozen=True)
class Actor:
    wwid: str
    name: str
    email: str
    source: str

    @property
    def label(self) -> str:
        return f"{self.name} ({self.wwid})"


def get_actor(request: Request) -> Actor | None:
    if not PROXY_SHARED_SECRET:
        return None

    supplied_secret = request.headers.get("x-proxy-secret", "")
    if not hmac.compare_digest(supplied_secret, PROXY_SHARED_SECRET):
        return None

    wwid = request.headers.get("x-user-wwid", "").strip()
    name = unquote(request.headers.get("x-user-name", "")).strip()
    email = request.headers.get("x-user-email", "").strip()
    source = request.headers.get("x-user-source", "").strip()
    if not all((wwid, name, email)) or source not in {"olb", "manual"}:
        return None

    return Actor(wwid=wwid, name=name, email=email, source=source)
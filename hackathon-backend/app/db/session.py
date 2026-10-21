import os
from contextvars import ContextVar
from functools import lru_cache

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

_ACTIVE_SETTINGS_SESSION: ContextVar[Session | None] = ContextVar(
    "active_settings_session", default=None
)
_ACTIVE_SETTINGS_CHANGES: ContextVar[set[str] | None] = ContextVar(
    "active_settings_changes", default=None
)


def active_settings_session() -> Session | None:
    return _ACTIVE_SETTINGS_SESSION.get()


def set_active_settings_session(session: Session):
    return _ACTIVE_SETTINGS_SESSION.set(session)


def reset_active_settings_session(token) -> None:
    _ACTIVE_SETTINGS_SESSION.reset(token)


def mark_settings_changed(resource: str) -> None:
    changes = _ACTIVE_SETTINGS_CHANGES.get()
    if changes is not None:
        changes.add(resource)


def set_active_settings_changes(changes: set[str]):
    return _ACTIVE_SETTINGS_CHANGES.set(changes)


def reset_active_settings_changes(token) -> None:
    _ACTIVE_SETTINGS_CHANGES.reset(token)


def database_url() -> str | None:
    return os.getenv("DATABASE_URL") or None


@lru_cache(maxsize=4)
def _engine_for(url: str) -> Engine:
    engine = create_engine(url, pool_pre_ping=True)
    if url.startswith("sqlite"):
        @event.listens_for(engine, "connect")
        def enable_sqlite_foreign_keys(connection, _record):
            cursor = connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()
    return engine


def get_engine(url: str | None = None) -> Engine | None:
    resolved_url = url if url is not None else database_url()
    return _engine_for(resolved_url) if resolved_url else None


def get_session_factory(url: str | None = None) -> sessionmaker[Session] | None:
    engine = get_engine(url)
    return sessionmaker(bind=engine, expire_on_commit=False) if engine else None
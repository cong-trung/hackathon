"""Repository functions for PYPCS settings and operation-catalog rows."""

from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import Actor
from app.config import DATA_DIR, database_feature_enabled
from app.db import models
from app.db.session import (
    active_settings_session,
    get_session_factory,
    mark_settings_changed,
)
from app.io.generic_csv import read_generic_csv, write_rows_to_csv
from app.repositories import Resource

MODULE_FIELDS = (
    "module_id", "module_key", "module_label", "enabled_default",
    "allowed_roles", "sort_order", "notes",
)
QUESTION_FIELDS = (
    "question_id", "source_prefix", "header", "display_label", "description",
    "role", "field_type", "required_default", "sort_order", "options",
    "dependency_rule", "notes",
)
QUESTION_MODULE_FIELDS = (
    "question_id", "module_id", "module_key", "required", "visible_default",
    "source_rule", "notes",
)
OPERATION_FIELDS = (
    "MODULE_KEY", "OPERATION", "OPER_SHORT_DESC", "OPER_LONG_DESC",
)


@contextmanager
def _session() -> Iterator[Session]:
    active = active_settings_session()
    if active is not None:
        yield active
        return
    factory = get_session_factory()
    if factory is None:
        raise RuntimeError("Settings database mode requires DATABASE_URL to be set.")
    with factory() as session:
        yield session


def _strings(row, fields: tuple[str, ...]) -> dict[str, str]:
    return {field: str(getattr(row, field) or "") for field in fields}


def _upsert_actor(session: Session, actor: Actor | None) -> None:
    if actor is None:
        return
    now = datetime.now(timezone.utc)
    actors = session.info.setdefault("settings_actors", {})
    app_user = actors.get(actor.wwid)
    if app_user is None:
        app_user = session.get(models.AppUser, actor.wwid)
        if app_user is None:
            app_user = models.AppUser(
                wwid=actor.wwid,
                name=actor.name,
                email=actor.email,
                first_seen_at=now,
                last_seen_at=now,
            )
            session.add(app_user)
        actors[actor.wwid] = app_user
    if app_user in session:
        app_user.name = actor.name
        app_user.email = actor.email
        app_user.last_seen_at = now


def _audit(
    session: Session, *, entity_type: str, entity_id: str, action: str,
    field: str, old_value: str, new_value: str, actor: Actor | None,
    actor_label: str, source: str,
) -> None:
    if old_value == new_value:
        return
    now = datetime.now(timezone.utc)
    session.add(models.AuditLog(
        occurred_at=now,
        actor_wwid=actor.wwid if actor else "",
        actor_name=actor.name if actor else "",
        actor_email=actor.email if actor else "",
        actor_label="" if actor else (actor_label or "system"),
        entity_type=entity_type, entity_id=entity_id, action=action,
        field=field, old_value=old_value, new_value=new_value, source=source,
    ))


def _audit_fields(
    session: Session, entity_type: str, entity_id: str, action: str,
    old: dict[str, str], new: dict[str, str], fields: tuple[str, ...],
    actor: Actor | None, actor_label: str, source: str,
) -> None:
    for field in fields:
        old_value, new_value = old.get(field, ""), new.get(field, "")
        if old_value != new_value:
            _audit(
                session, entity_type=entity_type, entity_id=entity_id,
                action=action, field=field, old_value=old_value,
                new_value=new_value, actor=actor, actor_label=actor_label,
                source=source,
            )


def _question_values(row: dict[str, str]) -> dict[str, str]:
    return {field: str(row.get(field, "") or "") for field in QUESTION_FIELDS}


def _sync_options(
    session: Session, question: models.Question, option_values: list[str], *,
    actor: Actor | None, actor_label: str, source: str,
) -> None:
    existing = {
        item.sort_order: item
        for item in session.scalars(
            select(models.QuestionOption)
            .where(models.QuestionOption.question_id == question.question_id)
            .order_by(models.QuestionOption.sort_order)
        )
    }
    normalized = [value.strip() for value in option_values if value.strip()]
    for position in range(max(len(existing), len(normalized))):
        current = existing.get(position)
        new_value = normalized[position] if position < len(normalized) else None
        old_value = current.option_value if current else None
        if old_value == new_value:
            continue
        option_id = f"{question.question_id}:{position}"
        if current and new_value is not None:
            current.option_value = new_value
            action, old_audit, new_audit = "update", old_value or "", new_value
        elif current:
            session.delete(current)
            action, old_audit, new_audit = "delete", old_value or "", ""
        else:
            session.add(models.QuestionOption(
                question_id=question.question_id, sort_order=position,
                option_value=new_value,
            ))
            action, old_audit, new_audit = "create", "", new_value or ""
        _audit(
            session, entity_type="question_option", entity_id=option_id,
            action=action, field="option_value", old_value=old_audit,
            new_value=new_audit, actor=actor, actor_label=actor_label,
            source=source,
        )


def list_modules() -> list[dict[str, str]]:
    from app.config import database_feature_enabled
    if not database_feature_enabled("settings"):
        return read_generic_csv(Resource.MODULES.value)
    with _session() as session:
        return [
            _strings(row, MODULE_FIELDS)
            for row in session.scalars(select(models.Module).order_by(models.Module.source_order))
        ]


def list_questions() -> list[dict[str, str]]:
    if not database_feature_enabled("settings"):
        return read_generic_csv(Resource.QUESTIONS.value)
    with _session() as session:
        return [
            _strings(row, QUESTION_FIELDS)
            for row in session.scalars(select(models.Question).order_by(models.Question.source_order))
        ]


def save_questions(
    rows: list[dict[str, str]], headers: list[str], actor: Actor | None = None,
    *, actor_label: str = "system", source: str = "api",
) -> None:
    if not database_feature_enabled("settings"):
        write_rows_to_csv(Resource.QUESTIONS.value, rows, headers)
        return
    if active_settings_session() is None:
        from app.repositories import transaction
        with transaction(Resource.QUESTIONS):
            save_questions(rows, headers, actor, actor_label=actor_label, source=source)
        return
    with _session() as session:
        _upsert_actor(session, actor)
        existing = {row.question_id: row for row in session.scalars(select(models.Question))}
        retained = set()
        for order, item in enumerate(rows):
            values = _question_values(item)
            question_id = values["question_id"]
            retained.add(question_id)
            current = existing.get(question_id)
            audited_fields = tuple(field for field in QUESTION_FIELDS if field != "question_id")
            if current is None:
                current = models.Question(**values, source_order=order)
                session.add(current)
                _audit_fields(session, "question", question_id, "create", {}, values,
                              audited_fields, actor, actor_label, source)
            else:
                old = _strings(current, QUESTION_FIELDS)
                _audit_fields(session, "question", question_id, "update", old, values,
                              audited_fields, actor, actor_label, source)
                for field, value in values.items():
                    setattr(current, field, value)
                current.source_order = order
            _sync_options(session, current, values["options"].split("|"),
                          actor=actor, actor_label=actor_label, source=source)
        for question_id, current in existing.items():
            if question_id in retained:
                continue
            old = _strings(current, QUESTION_FIELDS)
            _audit_fields(session, "question", question_id, "delete", old, {},
                          tuple(field for field in QUESTION_FIELDS if field != "question_id"),
                          actor, actor_label, source)
            for option in current.option_rows:
                _audit(session, entity_type="question_option",
                       entity_id=f"{question_id}:{option.sort_order}", action="delete",
                       field="option_value", old_value=option.option_value,
                       new_value="", actor=actor, actor_label=actor_label, source=source)
            session.delete(current)
    mark_settings_changed(Resource.QUESTIONS.value)


def list_question_module_map() -> list[dict[str, str]]:
    if not database_feature_enabled("settings"):
        return read_generic_csv(Resource.QUESTION_MODULE_MAP.value)
    with _session() as session:
        return [
            _strings(row, QUESTION_MODULE_FIELDS)
            for row in session.scalars(select(models.QuestionModule).order_by(models.QuestionModule.source_order))
        ]


def list_operation_catalog() -> list[dict[str, str]]:
    if not database_feature_enabled("settings"):
        return read_generic_csv(Resource.OPERATION_CATALOG.value)
    with _session() as session:
        return [
            {
                "MODULE_KEY": str(row.module_key or ""),
                "OPERATION": str(row.operation or ""),
                "OPER_SHORT_DESC": str(row.short_desc or ""),
                "OPER_LONG_DESC": str(row.long_desc or ""),
            }
            for row in session.scalars(select(models.Operation).order_by(models.Operation.source_order))
        ]


def add_operation_rows(
    rows: list[dict[str, str]], *, actor: Actor | None = None,
    actor_label: str = "quality_matrix_xlsx_import", source: str = "import",
) -> None:
    if not database_feature_enabled("settings"):
        return
    if active_settings_session() is None:
        from app.repositories import transaction
        with transaction(Resource.OPERATION_CATALOG):
            add_operation_rows(rows, actor=actor, actor_label=actor_label, source=source)
        return
    with _session() as session:
        _upsert_actor(session, actor)
        existing = {(row.module_key, row.operation): row for row in session.scalars(select(models.Operation))}
        next_order = max((row.source_order for row in existing.values()), default=-1) + 1
        for item in rows:
            module_key = str(item.get("MODULE_KEY", "") or "")
            operation = str(item.get("OPERATION", "") or "")
            values = {
                "MODULE_KEY": module_key, "OPERATION": operation,
                "OPER_SHORT_DESC": str(item.get("OPER_SHORT_DESC", "") or ""),
                "OPER_LONG_DESC": str(item.get("OPER_LONG_DESC", "") or ""),
            }
            current = existing.get((module_key, operation))
            if current is None:
                session.add(models.Operation(
                    module_key=module_key, operation=operation,
                    short_desc=values["OPER_SHORT_DESC"],
                    long_desc=values["OPER_LONG_DESC"], source_order=next_order,
                ))
                next_order += 1
                old, action = {}, "create"
            else:
                old = {
                    "MODULE_KEY": current.module_key, "OPERATION": current.operation,
                    "OPER_SHORT_DESC": current.short_desc, "OPER_LONG_DESC": current.long_desc,
                }
                current.short_desc = values["OPER_SHORT_DESC"]
                current.long_desc = values["OPER_LONG_DESC"]
                action = "update"
            _audit_fields(session, "operation", f"{module_key}:{operation}", action,
                          old, values, OPERATION_FIELDS, actor, actor_label, source)
    mark_settings_changed(Resource.OPERATION_CATALOG.value)


def export_settings_to_csv(
    resources: list[str] | None = None, *, data_dir: Path | None = None,
) -> None:
    selected = set(resources or (
        Resource.MODULES.value, Resource.QUESTIONS.value,
        Resource.QUESTION_MODULE_MAP.value, Resource.OPERATION_CATALOG.value,
    ))
    destination = data_dir or DATA_DIR
    with _session() as session:
        exports = {
            Resource.MODULES.value: (
                MODULE_FIELDS, [_strings(row, MODULE_FIELDS) for row in
                    session.scalars(select(models.Module).order_by(models.Module.source_order))],
            ),
            Resource.QUESTIONS.value: (
                QUESTION_FIELDS, [_strings(row, QUESTION_FIELDS) for row in
                    session.scalars(select(models.Question).order_by(models.Question.source_order))],
            ),
            Resource.QUESTION_MODULE_MAP.value: (
                QUESTION_MODULE_FIELDS, [_strings(row, QUESTION_MODULE_FIELDS) for row in
                    session.scalars(select(models.QuestionModule).order_by(models.QuestionModule.source_order))],
            ),
            Resource.OPERATION_CATALOG.value: (
                OPERATION_FIELDS, [{
                    "MODULE_KEY": str(row.module_key or ""),
                    "OPERATION": str(row.operation or ""),
                    "OPER_SHORT_DESC": str(row.short_desc or ""),
                    "OPER_LONG_DESC": str(row.long_desc or ""),
                } for row in session.scalars(select(models.Operation).order_by(models.Operation.source_order))],
            ),
        }
        for resource in selected:
            headers, rows = exports[resource]
            write_rows_to_csv(resource, rows, list(headers), data_dir=destination)
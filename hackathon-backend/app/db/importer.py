from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import UUID

import polars as pl
from sqlalchemy import delete, inspect, select
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from app.db import models
from app.db.base import Base
from app.db.session import get_engine
from app.io.csv_excel import read_csv_file, read_excel_like, value_to_str
from app.repositories.action_items import HEADERS as ACTION_HEADERS
from app.repositories.decisions import HEADERS as DECISION_HEADERS
from app.schema_config import MODULE_CONFIG, MODULE_SOLUTION_CONFIG, SOLUTION_CONFIG


GENERIC_FILES = {
    "modules": "QualityMatrix/Settings/PYPCS_Modules.csv",
    "questions": "QualityMatrix/Settings/PYPCS_Questions.csv",
    "question_module": "QualityMatrix/Settings/PYPCS_QuestionModuleMap.csv",
    "operations": "QualityMatrix/Settings/Operation_Process_Step.csv",
    "submissions": "QualityMatrix/PYPCS_Submissions.csv",
    "answers": "QualityMatrix/PYPCS_SubmissionCells.csv",
    "history": "QualityMatrix/History/PYPCS_SubmissionHistory.csv",
    "action_items": "View2/PYPCS_ActionItems.csv",
    "decisions": "View3/PYPCS_ProductActionDecisions.csv",
}

APPLICABILITY_FIELDS = (
    "package",
    "bare_die_lid",
    "foveros",
    "segment",
    "xvi_tool_type",
    "lts_ball",
    "hdmx_ap_pan",
)

TABLE_MODELS = [
    models.Module,
    models.Question,
    models.QuestionOption,
    models.QuestionModule,
    models.Operation,
    models.Product,
    models.Submission,
    models.SubmissionModule,
    models.SubmissionAnswer,
    models.SubmissionAnswerCollision,
    models.ActionItem,
    models.ActionItemApplicability,
    models.ProductActionDecision,
    models.ProductBasisSTHI,
    models.ProductBasisLCBI,
    models.ProductSolutionSTHI,
    models.ProductSolutionLCBI,
    models.SolutionCatalog,
    models.AppUser,
    models.AuditLog,
]


class ImportValidationError(ValueError):
    pass


def _generic_rows(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    frame = pl.read_csv(
        path, encoding="utf8-lossy", infer_schema_length=0, ignore_errors=True
    )
    return [
        {key: value_to_str(value) for key, value in row.items()}
        for row in frame.to_dicts()
    ]


def _config_rows(path: Path, config: dict[str, Any]) -> list[dict[str, str]]:
    if not path.exists():
        return []
    reader = read_excel_like if pl.read_csv is not None and path.exists() and _is_xlsx(path) else read_csv_file
    _headers, rows = reader(path, config)
    return rows


def _is_xlsx(path: Path) -> bool:
    import zipfile

    return zipfile.is_zipfile(path)


def read_sources(data_dir: Path) -> dict[str, list[dict[str, str]]]:
    rows = {
        name: _generic_rows(data_dir / relative)
        for name, relative in GENERIC_FILES.items()
    }
    for module, config in MODULE_CONFIG.items():
        rows[f"basis_{module.lower()}"] = _config_rows(data_dir / config["file"], config)
    for module, config in MODULE_SOLUTION_CONFIG.items():
        rows[f"pdo_{module.lower()}"] = _config_rows(data_dir / config["file"], config)
    rows["solutions"] = _config_rows(data_dir / SOLUTION_CONFIG["file"], SOLUTION_CONFIG)
    return rows


def _normalized_product_key(row: dict[str, str]) -> tuple[str, str]:
    return (
        value_to_str(row.get("prodgroup3", "")).lower(),
        value_to_str(row.get("product_name", "")).lower(),
    )


def _duplicate_keys(rows: list[dict[str, str]], fields: tuple[str, ...]) -> int:
    counts = Counter(tuple(row.get(field, "") for field in fields) for row in rows)
    return sum(count - 1 for count in counts.values() if count > 1)


def _build_plan(sources: dict[str, list[dict[str, str]]]) -> tuple[dict[type, list[dict]], dict[str, Any]]:
    plan: dict[type, list[dict]] = {model: [] for model in TABLE_MODELS}
    report: dict[str, Any] = {
        "source_counts": {key: len(value) for key, value in sources.items()},
        "invalid_submission_ids": [],
    }

    for order, row in enumerate(sources["modules"]):
        plan[models.Module].append({**row, "source_order": order})
    for order, row in enumerate(sources["questions"]):
        plan[models.Question].append({**row, "source_order": order})
        for option_order, option in enumerate(row.get("options", "").split("|")):
            if option.strip():
                plan[models.QuestionOption].append(
                    {
                        "question_id": row.get("question_id", ""),
                        "sort_order": option_order,
                        "option_value": option.strip(),
                    }
                )
    for order, row in enumerate(sources["question_module"]):
        plan[models.QuestionModule].append({**row, "source_order": order})
    for order, row in enumerate(sources["operations"]):
        plan[models.Operation].append(
            {
                "module_key": row.get("MODULE_KEY", ""),
                "operation": row.get("OPERATION", ""),
                "short_desc": row.get("OPER_SHORT_DESC", ""),
                "long_desc": row.get("OPER_LONG_DESC", ""),
                "source_order": order,
            }
        )

    product_rows: dict[tuple[str, str], dict[str, str]] = {}
    product_ids: dict[tuple[str, str], int] = {}
    for row in sources["submissions"]:
        key = _normalized_product_key(row)
        if key not in product_rows:
            product_id = len(product_rows) + 1
            product_ids[key] = product_id
            product_rows[key] = {
                "id": product_id,
                "prodgroup3": value_to_str(row.get("prodgroup3", "")),
                "product_name": value_to_str(row.get("product_name", "")),
                "normalized_prodgroup3": key[0],
                "normalized_product_name": key[1],
            }
    plan[models.Product].extend(product_rows.values())

    for order, row in enumerate(sources["submissions"]):
        submission_id = row.get("submission_id", "")
        try:
            UUID(submission_id)
        except (ValueError, AttributeError):
            report.setdefault("invalid_submission_ids", []).append(submission_id)
        key = _normalized_product_key(row)
        plan[models.Submission].append(
            {
                "submission_id": submission_id,
                "product_id": product_ids[key],
                "created_at": row.get("created_at", ""),
                "updated_at": row.get("updated_at", ""),
                "submitted_by": row.get("submitted_by", ""),
                "role": row.get("role", ""),
                "status": row.get("status", ""),
                "operation": row.get("operation", ""),
                "answer_count": row.get("answer_count", ""),
                "product_name": row.get("product_name", ""),
                "prodgroup3": row.get("prodgroup3", ""),
                "selected_modules_raw": row.get("selected_modules", ""),
                "source_order": order,
            }
        )
        for module_order, module_key in enumerate(row.get("selected_modules", "").split("|")):
            if module_key.strip():
                plan[models.SubmissionModule].append(
                    {
                        "submission_id": submission_id,
                        "sort_order": module_order,
                        "module_key": module_key.strip(),
                    }
                )
    answer_keys = set()
    for order, row in enumerate(sources["answers"]):
        key = tuple(row.get(field, "") for field in ("submission_id", "question_id", "module_key"))
        if key in answer_keys:
            plan[models.SubmissionAnswerCollision].append({**row, "source_order": order})
        else:
            answer_keys.add(key)
            plan[models.SubmissionAnswer].append({**row, "source_order": order})

    for order, row in enumerate(sources["action_items"]):
        action = {key: row.get(key, "") for key in ACTION_HEADERS}
        action["source_order"] = order
        plan[models.ActionItem].append(action)
        for field in APPLICABILITY_FIELDS:
            for token_order, token in enumerate(row.get(field, "").split("|")):
                if token.strip():
                    plan[models.ActionItemApplicability].append(
                        {
                            "nbr": row.get("nbr", ""),
                            "field": field,
                            "sort_order": token_order,
                            "value": token.strip(),
                        }
                    )

    for order, row in enumerate(sources["decisions"]):
        plan[models.ProductActionDecision].append(
            {**{key: row.get(key, "") for key in DECISION_HEADERS}, "source_order": order}
        )

    for module, model in (("sthi", models.ProductBasisSTHI), ("lcbi", models.ProductBasisLCBI)):
        fields = MODULE_CONFIG[module.upper()]["fields"]
        for order, row in enumerate(sources[f"basis_{module}"]):
            plan[model].append(
                {
                    **{field: row.get(field, "") for field in fields},
                    "source_order": order,
                    "extra_data": {key: value for key, value in row.items() if key not in fields},
                }
            )
    for module, model in (("sthi", models.ProductSolutionSTHI), ("lcbi", models.ProductSolutionLCBI)):
        for order, row in enumerate(sources[f"pdo_{module}"]):
            plan[model].append(
                {
                    **{field: row.get(field, "") for field in MODULE_SOLUTION_CONFIG[module.upper()]["fields"]},
                    "module": module.upper(),
                    "source_order": order,
                }
            )
    for order, row in enumerate(sources["solutions"]):
        plan[models.SolutionCatalog].append(
            {
                "source_order": order,
                "id": row.get("id", ""),
                "module": row.get("module", ""),
                "solution": row.get("solution", ""),
                "key_summary": row.get("key_summary", ""),
                "excursion_related": row.get("excursion_related", ""),
            }
        )
    for order, row in enumerate(sources["history"]):
        action = row.get("action", "update").lower()
        if action not in {"create", "update", "delete"}:
            action = "update"
        plan[models.AuditLog].append(
            {
                "occurred_at": _parse_utc(row.get("changed_at", "")),
                "actor_wwid": "",
                "actor_name": "",
                "actor_email": "",
                "actor_label": row.get("changed_by", ""),
                "entity_type": "submission",
                "entity_id": row.get("submission_id", ""),
                "action": action,
                "field": row.get("reason", ""),
                "old_value": row.get("previous_submission_json", ""),
                "new_value": row.get("previous_cells_json", ""),
                "request_id": "",
                "source": "legacy_history",
                "legacy_payload": row,
            }
        )

    report["product_merge_groups"] = [
        {"submission_count": count}
        for count in sorted(Counter(_normalized_product_key(row) for row in sources["submissions"]).values(), reverse=True)
        if count > 1
    ]
    report["duplicate_keys"] = {
        "module.module_id": _duplicate_keys(sources["modules"], ("module_id",)),
        "question.question_id": _duplicate_keys(sources["questions"], ("question_id",)),
        "operation(module_key,operation)": _duplicate_keys(
            [{"key": f"{row.get('MODULE_KEY', '')}\0{row.get('OPERATION', '')}"} for row in sources["operations"]],
            ("key",),
        ),
        "submission.submission_id": _duplicate_keys(sources["submissions"], ("submission_id",)),
        "submission_answer(submission_id,question_id,module_key)": _duplicate_keys(
            sources["answers"], ("submission_id", "question_id", "module_key")
        ),
        "action_item.nbr": _duplicate_keys(sources["action_items"], ("nbr",)),
    }
    answer_groups: dict[tuple[str, str, str], list[dict[str, str]]] = {}
    for row in sources["answers"]:
        answer_key = tuple(row.get(field, "") for field in ("submission_id", "question_id", "module_key"))
        answer_groups.setdefault(answer_key, []).append(row)
    collision_groups = [group for group in answer_groups.values() if len(group) > 1]
    report["answer_collision_groups"] = len(collision_groups)
    report["conflicting_answer_collision_groups"] = sum(
        len({tuple(sorted(row.items())) for row in group}) > 1 for group in collision_groups
    )
    report["losslessly_retained_answer_collision_rows"] = len(plan[models.SubmissionAnswerCollision])
    report["orphan_cells"] = [
        row.get("submission_id", "")
        for row in sources["answers"]
        if row.get("submission_id", "") not in {item.get("submission_id", "") for item in sources["submissions"]}
    ]
    known_module_ids = {row.get("module_id", "") for row in sources["modules"]}
    known_module_keys = {row.get("module_key", "").casefold() for row in sources["modules"]}
    known_question_ids = {row.get("question_id", "") for row in sources["questions"]}
    unknown = set()
    for row in sources["question_module"]:
        if row.get("question_id", "") not in known_question_ids:
            unknown.add(f"question_module.question_id={row.get('question_id', '')}")
        if row.get("module_id", "") not in known_module_ids and row.get("module_key", "").casefold() not in known_module_keys:
            unknown.add(f"question_module.module={row.get('module_id', '')}/{row.get('module_key', '')}")
    for row in sources["answers"]:
        if row.get("question_id", "") not in known_question_ids:
            unknown.add(f"submission_answer.question_id={row.get('question_id', '')}")
        module_key = row.get("module_key", "")
        if module_key and module_key.casefold() not in known_module_keys:
            unknown.add(f"submission_answer.module_key={module_key}")
    for row in sources["submissions"]:
        for module_key in row.get("selected_modules", "").split("|"):
            if module_key.strip() and module_key.casefold() not in known_module_keys:
                unknown.add(f"submission_module.module_key={module_key.strip()}")
    report["unknown_references_retained_as_text"] = sorted(unknown)
    report["table_counts"] = {model.__tablename__: len(rows) for model, rows in plan.items()}
    report["source_counts"].update(
        {
            "product_basis_STHI": len(sources["basis_sthi"]),
            "product_basis_LCBI": len(sources["basis_lcbi"]),
            "product_solution_STHI": len(sources["pdo_sthi"]),
            "product_solution_LCBI": len(sources["pdo_lcbi"]),
            "solution_catalog": len(sources["solutions"]),
        }
    )
    report["blocking_findings"] = []
    if report["orphan_cells"]:
        report["blocking_findings"].append(f"orphan submission cells: {len(report['orphan_cells'])}")
    if report["invalid_submission_ids"]:
        report["blocking_findings"].append(f"invalid submission UUIDs: {len(report['invalid_submission_ids'])}")
    for key, count in report["duplicate_keys"].items():
        if count and key != "submission_answer(submission_id,question_id,module_key)":
            report["blocking_findings"].append(f"duplicate key rows for {key}: {count}")
    return plan, report


def _parse_utc(value: str) -> datetime:
    if value:
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed.astimezone(timezone.utc)
        except ValueError:
            pass
    return datetime.now(timezone.utc)


def _model_counts(session: Session, engine: Engine) -> dict[str, int]:
    existing_tables = set(inspect(engine).get_table_names())
    return {
        model.__tablename__: session.scalar(select(pl.lit(0))) if False else session.query(model).count()
        for model in TABLE_MODELS
        if model.__tablename__ in existing_tables
    } | {
        model.__tablename__: 0
        for model in TABLE_MODELS
        if model.__tablename__ not in existing_tables
    }


def preview_import(data_dir: Path, engine: Engine) -> tuple[dict[str, Any], dict[type, list[dict]]]:
    sources = read_sources(data_dir)
    plan, report = _build_plan(sources)
    with Session(engine) as session:
        report["existing_db_counts"] = _model_counts(session, engine)
    return report, plan


def _resource_exports(session: Session) -> dict[str, list[dict[str, str]]]:
    def ordered(model, fields, order_field="source_order"):
        instances = session.scalars(select(model).order_by(getattr(model, order_field))).all()
        return [{field: value_to_str(getattr(item, field)) for field in fields} for item in instances]

    submissions = []
    for item in session.scalars(select(models.Submission).order_by(models.Submission.source_order)):
        submissions.append(
            {
                "submission_id": item.submission_id,
                "created_at": item.created_at,
                "updated_at": item.updated_at,
                "submitted_by": item.submitted_by,
                "role": item.role,
                "selected_modules": item.selected_modules_raw,
                "product_name": item.product_name,
                "prodgroup3": item.prodgroup3,
                "operation": item.operation,
                "answer_count": item.answer_count,
                "status": item.status,
            }
        )
    return {
        "modules": ordered(models.Module, ("module_id", "module_key", "module_label", "enabled_default", "allowed_roles", "sort_order", "notes")),
        "questions": ordered(models.Question, ("question_id", "source_prefix", "header", "display_label", "description", "role", "field_type", "required_default", "sort_order", "options", "dependency_rule", "notes")),
        "question_module": ordered(models.QuestionModule, ("question_id", "module_id", "module_key", "required", "visible_default", "source_rule", "notes")),
        "operations": [
            {"MODULE_KEY": item.module_key, "OPERATION": item.operation, "OPER_SHORT_DESC": item.short_desc, "OPER_LONG_DESC": item.long_desc}
            for item in session.scalars(select(models.Operation).order_by(models.Operation.source_order))
        ],
        "submissions": submissions,
        "answers": [
            {
                "submission_id": item.submission_id,
                "question_id": item.question_id,
                "module_key": item.module_key,
                "role": item.role,
                "answer": item.answer,
                "updated_at": item.updated_at,
                "updated_by": item.updated_by,
            }
            for item in sorted(
                [
                    *session.scalars(select(models.SubmissionAnswer)).all(),
                    *session.scalars(select(models.SubmissionAnswerCollision)).all(),
                ],
                key=lambda answer: answer.source_order,
            )
        ],
        "action_items": ordered(models.ActionItem, ACTION_HEADERS),
        "decisions": ordered(models.ProductActionDecision, DECISION_HEADERS),
        "basis_sthi": [
            {**{field: value_to_str(getattr(item, field)) for field in MODULE_CONFIG["STHI"]["fields"]}, **item.extra_data}
            for item in session.scalars(select(models.ProductBasisSTHI).order_by(models.ProductBasisSTHI.source_order))
        ],
        "basis_lcbi": [
            {**{field: value_to_str(getattr(item, field)) for field in MODULE_CONFIG["LCBI"]["fields"]}, **item.extra_data}
            for item in session.scalars(select(models.ProductBasisLCBI).order_by(models.ProductBasisLCBI.source_order))
        ],
        "pdo_sthi": ordered(models.ProductSolutionSTHI, MODULE_SOLUTION_CONFIG["STHI"]["fields"]),
        "pdo_lcbi": ordered(models.ProductSolutionLCBI, MODULE_SOLUTION_CONFIG["LCBI"]["fields"]),
        "solutions": [
            {"id": item.id, "module": item.module, "solution": item.solution, "key_summary": item.key_summary, "excursion_related": item.excursion_related}
            for item in session.scalars(select(models.SolutionCatalog).order_by(models.SolutionCatalog.source_order))
        ],
        "history": [
            item.legacy_payload
            for item in session.scalars(select(models.AuditLog).where(models.AuditLog.source == "legacy_history").order_by(models.AuditLog.id))
        ],
    }


def _round_trip(session: Session, sources: dict[str, list[dict[str, str]]]) -> dict[str, int]:
    exported = _resource_exports(session)
    mismatches = {}
    for resource, rows in sources.items():
        actual = exported[resource]
        if actual != rows:
            mismatches[resource] = sum(left != right for left, right in zip(actual, rows)) + abs(len(actual) - len(rows))
    return mismatches


def apply_import(data_dir: Path, engine: Engine, replace: bool = False) -> dict[str, Any]:
    sources = read_sources(data_dir)
    plan, report = _build_plan(sources)
    if report["blocking_findings"]:
        raise ImportValidationError("; ".join(report["blocking_findings"]))

    with Session(engine) as session, session.begin():
        tables = set(inspect(engine).get_table_names())
        missing = [model.__tablename__ for model in TABLE_MODELS if model.__tablename__ not in tables]
        if missing:
            raise ImportValidationError("Database schema is not upgraded; missing tables: " + ", ".join(missing))
        current = _model_counts(session, engine)
        occupied = {name: count for name, count in current.items() if count}
        if occupied and not replace:
            raise ImportValidationError("Target tables are not empty; use --replace to replace all imported data")
        if replace:
            for model in reversed(TABLE_MODELS):
                session.execute(delete(model))

        for model, rows in plan.items():
            if rows:
                session.execute(model.__table__.insert(), rows)
        session.add(
            models.AuditLog(
                occurred_at=datetime.now(timezone.utc),
                actor_wwid="",
                actor_name="",
                actor_email="",
                actor_label="import",
                entity_type="migration",
                entity_id="csv_to_postgresql",
                action="create",
                field="",
                old_value="",
                new_value="CSV import completed",
                request_id="",
                source="migration",
            )
        )
        session.flush()
        actual_counts = _model_counts(session, engine)
        expected_counts = report["table_counts"].copy()
        expected_counts["audit_log"] += 1
        count_mismatches = {
            table: (expected_counts[table], actual_counts[table])
            for table in expected_counts
            if expected_counts[table] != actual_counts[table]
        }
        if count_mismatches:
            raise ImportValidationError(f"Post-import table count mismatch: {count_mismatches}")
        round_trip_mismatches = _round_trip(session, sources)
        if round_trip_mismatches:
            raise ImportValidationError(f"Round-trip mismatches: {round_trip_mismatches}")
        report["actual_db_counts"] = actual_counts
        report["round_trip"] = "passed"
        report["audit_marker"] = "written"
    return report


def run_import(data_dir: Path, database_url: str, apply: bool = False, replace: bool = False) -> dict[str, Any]:
    engine = get_engine(database_url)
    if engine is None:
        raise ValueError("A database URL is required")
    if apply:
        return apply_import(data_dir, engine, replace=replace)
    report, _plan = preview_import(data_dir, engine)
    return report

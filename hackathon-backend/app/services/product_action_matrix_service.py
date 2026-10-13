"""Build and persist the merged PYPCS product/action matrix."""

import csv
import copy
import io
import re
import threading
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException

from app.config import DATA_DIR
from app.io.csv_excel import value_to_str
from app.io.concurrency import locked_files, record_version
from app.io.generic_csv import read_generic_csv, write_rows_to_csv, safe_int
from app.services.pypcs_service import (
    PYPCS_ACTION_ITEMS_FILE,
    PYPCS_MODULES_FILE,
    PYPCS_SUBMISSION_CELLS_FILE,
    PYPCS_SUBMISSIONS_FILE,
    normalize_pypcs_module,
)

PRODUCT_ACTION_DECISIONS_FILE = "View3/PYPCS_ProductActionDecisions.csv"
PRODUCT_ATTRIBUTES = [
    "package",
    "bare_die_lid",
    "foveros",
    "segment",
    "fab_technology",
    "xvi_tool_type",
    "lts_ball",
    "hdmx_ap_pan",
]
ATTRIBUTE_QUESTION_IDS = PRODUCT_ATTRIBUTES + ["product_name", "prodgroup3"]
DECISION_FIELDS = ["status", "decision_state", "comment", "updated_by", "updated_at"]
PRODUCT_ACTION_DECISION_HEADERS = [
    "product_key",
    "module_group",
    "action_nbr",
    "status",
    "decision_state",
    "comment",
    "updated_by",
    "updated_at",
    "product_name",
    "prodgroup3",
    "event_id",
    "actionable_item",
]
PRODUCT_ACTION_MATRIX_HEADERS = [
    "product_key",
    "product_name",
    "prodgroup3",
    "module_group",
    "module_keys",
    "submission_id",
    "submission_status",
    "submission_updated_at",
    "operations",
    "package",
    "bare_die_lid",
    "foveros",
    "segment",
    "fab_technology",
    "xvi_tool_type",
    "lts_ball",
    "hdmx_ap_pan",
    "action_nbr",
    "event_id",
    "actionable_item",
    "reference",
    "action_package",
    "suggested_status",
    "suggested_comment",
    "status",
    "decision_state",
    "comment",
    "updated_by",
    "updated_at",
]
_MATRIX_INPUT_FILES = (
    PYPCS_MODULES_FILE,
    PYPCS_SUBMISSIONS_FILE,
    PYPCS_SUBMISSION_CELLS_FILE,
    PRODUCT_ACTION_DECISIONS_FILE,
    PYPCS_ACTION_ITEMS_FILE,
)
_CACHE_LOCK = threading.RLock()
_CACHE_FINGERPRINT: tuple[tuple[str, int | None, int | None], ...] | None = None
_CACHED_MATRIX: dict[str, Any] | None = None


def _input_fingerprint() -> tuple[tuple[str, int | None, int | None], ...]:
    fingerprint = []
    for file_name in _MATRIX_INPUT_FILES:
        path = DATA_DIR / file_name
        try:
            stat = path.stat()
        except FileNotFoundError:
            fingerprint.append((str(path.resolve()), None, None))
        else:
            fingerprint.append((str(path.resolve()), stat.st_mtime_ns, stat.st_size))
    return tuple(fingerprint)


def invalidate_product_action_matrix_cache() -> None:
    global _CACHE_FINGERPRINT, _CACHED_MATRIX
    with _CACHE_LOCK:
        _CACHE_FINGERPRINT = None
        _CACHED_MATRIX = None


def _split_values(value: Any) -> list[str]:
    text = value_to_str(value)
    return [part.strip() for part in re.split(r"[|,]", text) if part.strip()]


def _pipe_values(value: Any) -> list[str]:
    text = value_to_str(value)
    return [part.strip() for part in text.split("|") if part.strip()]


def _dedupe(values: list[str]) -> list[str]:
    return list(dict.fromkeys(values))


def _product_key(prodgroup3: str, product_name: str) -> str:
    return f"{prodgroup3.strip().lower()}||{product_name.strip().lower()}"


def _decision_values(row: dict[str, str]) -> dict[str, str]:
    decision = {field: value_to_str(row.get(field, "")) for field in DECISION_FIELDS}
    if not decision["decision_state"] and any(
        decision[field] for field in DECISION_FIELDS if field != "decision_state"
    ):
        decision["decision_state"] = "final"
    return decision


def _module_catalog() -> tuple[dict[str, dict[str, Any]], dict[str, int]]:
    modules = [normalize_pypcs_module(row) for row in read_generic_csv(PYPCS_MODULES_FILE)]
    modules.sort(key=lambda item: item["sort_order"])
    by_key = {item["module_key"].casefold(): item for item in modules if item["module_key"]}
    group_order: dict[str, int] = {}
    for module in modules:
        key = module["module_key"]
        if not key:
            continue
        group = "HDMx" if key.casefold().startswith("hdmx_") else key
        group_order.setdefault(group, module["sort_order"])
    return by_key, group_order


def _group_for_module(module_key: str, modules_by_key: dict[str, dict[str, Any]]) -> str:
    if module_key.casefold().startswith("hdmx_"):
        return "HDMx"
    module = modules_by_key.get(module_key.casefold())
    return module["module_key"] if module else module_key


def _decision_index(rows: list[dict[str, str]]) -> dict[tuple[str, str, str], dict[str, str]]:
    result = {}
    for row in rows:
        key = (
            value_to_str(row.get("product_key", "")),
            value_to_str(row.get("module_group", "")),
            value_to_str(row.get("action_nbr", "")),
        )
        if all(key):
            result[key] = _decision_values(row)
    return result


def _action_rows() -> list[dict[str, str]]:
    actions = read_generic_csv(PYPCS_ACTION_ITEMS_FILE)
    actions.sort(key=lambda row: safe_int(row.get("nbr", "")))
    return actions


def _module_group_build(actions: list[dict[str, str]]) -> tuple[
    list[dict[str, Any]],
    list[dict[str, str]],
    set[tuple[str, str, str]],
]:
    modules_by_key, group_order = _module_catalog()
    submissions = read_generic_csv(PYPCS_SUBMISSIONS_FILE)
    cells = read_generic_csv(PYPCS_SUBMISSION_CELLS_FILE)
    cells_by_submission: dict[str, dict[tuple[str, str], list[str]]] = defaultdict(
        lambda: defaultdict(list)
    )
    answers_by_submission: dict[str, dict[str, str]] = defaultdict(dict)
    for cell in cells:
        submission_id = value_to_str(cell.get("submission_id", ""))
        question_id = value_to_str(cell.get("question_id", ""))
        module_key = value_to_str(cell.get("module_key", "")).casefold()
        answer = value_to_str(cell.get("answer", ""))
        if answer:
            if module_key:
                cells_by_submission[submission_id][(question_id, module_key)].append(answer)
            else:
                answers_by_submission[submission_id][question_id] = answer

    latest_by_product: dict[str, dict[str, str]] = {}
    for submission in submissions:
        product_name = value_to_str(submission.get("product_name", ""))
        prodgroup3 = value_to_str(submission.get("prodgroup3", ""))
        if not product_name and not prodgroup3:
            continue
        key = _product_key(prodgroup3, product_name)
        existing = latest_by_product.get(key)
        timestamp = value_to_str(submission.get("updated_at", "")) or value_to_str(
            submission.get("created_at", "")
        )
        previous_timestamp = (
            value_to_str(existing.get("updated_at", ""))
            or value_to_str(existing.get("created_at", ""))
            if existing
            else ""
        )
        if existing is None or timestamp >= previous_timestamp:
            latest_by_product[key] = submission

    products_by_group: dict[str, list[tuple[str, dict[str, str], list[str]]]] = defaultdict(list)
    for product_key, submission in latest_by_product.items():
        selected_keys = _dedupe(_split_values(submission.get("selected_modules", "")))
        module_keys_by_group: dict[str, list[str]] = defaultdict(list)
        for module_key in selected_keys:
            module_group = _group_for_module(module_key, modules_by_key)
            module_keys_by_group[module_group].append(module_key)
            if module_group not in group_order:
                module_order = modules_by_key.get(module_key.casefold(), {}).get("sort_order", 9999)
                group_order[module_group] = module_order
        for module_group, module_keys in module_keys_by_group.items():
            module_keys.sort(
                key=lambda key: modules_by_key.get(key.casefold(), {}).get(
                    "sort_order", 9999
                )
            )
            products_by_group[module_group].append((product_key, submission, module_keys))

    ordered_groups = sorted(group_order, key=lambda group: (group_order[group], group.casefold()))
    flat_rows: list[dict[str, str]] = []
    group_counts: dict[str, int] = {}
    for module_group in ordered_groups:
        group_products = products_by_group.get(module_group, [])
        group_counts[module_group] = len({item[0] for item in group_products})
        group_products.sort(
            key=lambda item: (
                value_to_str(item[1].get("product_name", "")).casefold(),
                item[0],
            )
        )
        for product_key, submission, module_keys in group_products:
            submission_id = value_to_str(submission.get("submission_id", ""))
            product_cells = cells_by_submission.get(submission_id, {})
            legacy_answers = answers_by_submission.get(submission_id, {})

            def cell_values(question_id: str) -> list[str]:
                values = []
                for module_key in module_keys:
                    values.extend(
                        product_cells.get((question_id, module_key.casefold()), [])
                    )
                return values

            def attribute_value(question_id: str) -> str:
                for answer in cell_values(question_id):
                    if answer.strip():
                        return answer.strip()
                legacy = value_to_str(legacy_answers.get(question_id, ""))
                if legacy:
                    return legacy
                return value_to_str(submission.get(question_id, ""))

            operations = []
            for operation_answer in cell_values("operation"):
                operations.extend(_pipe_values(operation_answer))
            if not operations:
                operations = _pipe_values(legacy_answers.get("operation", ""))
            if not operations:
                operations = _pipe_values(submission.get("operation", ""))
            operations = _dedupe(operations)

            attributes = {field: attribute_value(field) for field in PRODUCT_ATTRIBUTES}
            product_name = attribute_value("product_name")
            prodgroup3 = attribute_value("prodgroup3")
            for action in actions:
                action_packages = _pipe_values(action.get("package", ""))
                action_package_text = "|".join(action_packages)
                suggestion_status = ""
                suggestion_comment = ""
                product_packages = _pipe_values(attributes["package"])
                if (
                    product_packages
                    and action_packages
                    and not any(item.casefold() == "all" for item in action_packages)
                    and not all(item.casefold() == "na" for item in action_packages)
                ):
                    matched_package = next(
                        (
                            product_package
                            for product_package in product_packages
                            if any(
                                product_package.casefold() == action_package.casefold()
                                for action_package in action_packages
                            )
                        ),
                        "",
                    )
                    suggestion_status = "Y" if matched_package else "NA"
                    package_for_comment = matched_package or "|".join(product_packages)
                    relation = "in" if matched_package else "not in"
                    suggestion_comment = (
                        f"Auto: package {package_for_comment} {relation} "
                        f"{action_package_text}"
                    )

                flat_row = {
                    "product_key": product_key,
                    "product_name": product_name,
                    "prodgroup3": prodgroup3,
                    "module_group": module_group,
                    "module_keys": "|".join(module_keys),
                    "submission_id": submission_id,
                    "submission_status": value_to_str(submission.get("status", "")) or "final",
                    "submission_updated_at": value_to_str(submission.get("updated_at", ""))
                    or value_to_str(submission.get("created_at", "")),
                    "operations": "|".join(operations),
                    **attributes,
                    "action_nbr": value_to_str(action.get("nbr", "")),
                    "event_id": value_to_str(action.get("event_id", "")),
                    "actionable_item": value_to_str(action.get("actionable_item", "")),
                    "reference": value_to_str(action.get("reference", "")),
                    "action_package": action_package_text,
                    "suggested_status": suggestion_status,
                    "suggested_comment": suggestion_comment,
                    **{field: "" for field in DECISION_FIELDS},
                }
                flat_rows.append(flat_row)

    previous_rows = read_generic_csv(PRODUCT_ACTION_DECISIONS_FILE)
    previous_decisions = _decision_index(previous_rows)
    current_keys = set()
    for row in flat_rows:
        key = (row["product_key"], row["module_group"], row["action_nbr"])
        current_keys.add(key)
        row.update(previous_decisions.get(key, {}))
    active_keys = set(current_keys)

    for row in previous_rows:
        key = (
            value_to_str(row.get("product_key", "")),
            value_to_str(row.get("module_group", "")),
            value_to_str(row.get("action_nbr", "")),
        )
        has_decision = any(value_to_str(row.get(field, "")) for field in DECISION_FIELDS)
        if all(key) and key not in current_keys and has_decision:
            preserved = {header: "" for header in PRODUCT_ACTION_MATRIX_HEADERS}
            preserved.update(
                {
                    header: value_to_str(row.get(header, ""))
                    for header in (
                        "product_key", "module_group", "action_nbr", "product_name",
                        "prodgroup3", "event_id", "actionable_item",
                    )
                }
            )
            preserved.update(_decision_values(row))
            flat_rows.append(preserved)

    groups = [
        {"key": group, "label": group, "product_count": group_counts.get(group, 0)}
        for group in ordered_groups
        if group_counts.get(group, 0) > 0
    ]
    return groups, flat_rows, active_keys


def _build_product_action_matrix() -> dict[str, Any]:
    action_rows = _action_rows()
    module_groups, flat_rows, active_keys = _module_group_build(action_rows)
    active_rows = [
        row
        for row in flat_rows
        if (row["product_key"], row["module_group"], row["action_nbr"])
        in active_keys
    ]
    actions = []
    for action in action_rows:
        actions.append(
            {
                "nbr": safe_int(action.get("nbr", "")),
                "event_id": value_to_str(action.get("event_id", "")),
                "actionable_item": value_to_str(action.get("actionable_item", "")),
                "reference": value_to_str(action.get("reference", "")),
                "package": _pipe_values(action.get("package", "")),
            }
        )
    return {
        "module_groups": module_groups,
        "actions": actions,
        "rows": active_rows,
        "flat_rows": flat_rows,
    }


def build_product_action_matrix() -> dict[str, Any]:
    global _CACHE_FINGERPRINT, _CACHED_MATRIX
    with _CACHE_LOCK:
        while True:
            fingerprint = _input_fingerprint()
            if fingerprint == _CACHE_FINGERPRINT and _CACHED_MATRIX is not None:
                return copy.deepcopy(_CACHED_MATRIX)
            built = _build_product_action_matrix()
            if fingerprint == _input_fingerprint():
                _CACHE_FINGERPRINT = fingerprint
                _CACHED_MATRIX = copy.deepcopy(built)
                return built


def _api_row(rows: list[dict[str, str]]) -> dict[str, Any]:
    first = rows[0]
    cells = {}
    for row in rows:
        decision = _decision_values(row)
        cells[value_to_str(row.get("action_nbr", ""))] = {
            "status": decision["status"],
            "comment": decision["comment"],
            "decision_state": decision["decision_state"],
            "suggested_status": value_to_str(row.get("suggested_status", "")),
            "suggested_comment": value_to_str(row.get("suggested_comment", "")),
            "updated_by": value_to_str(row.get("updated_by", "")),
            "updated_at": value_to_str(row.get("updated_at", "")),
            "version": record_version(_decision_values(row)),
        }
    return {
        "product_key": value_to_str(first.get("product_key", "")),
        "product_name": value_to_str(first.get("product_name", "")),
        "prodgroup3": value_to_str(first.get("prodgroup3", "")),
        "module_group": value_to_str(first.get("module_group", "")),
        "module_keys": _pipe_values(first.get("module_keys", "")),
        "submission_id": value_to_str(first.get("submission_id", "")),
        "submission_status": value_to_str(first.get("submission_status", "")),
        "submission_updated_at": value_to_str(first.get("submission_updated_at", "")),
        "operations": _pipe_values(first.get("operations", "")),
        **{field: value_to_str(first.get(field, "")) for field in PRODUCT_ATTRIBUTES},
        "cells": cells,
    }


def get_product_action_matrix(
    module_group: str | None = None,
    built: dict[str, Any] | None = None,
) -> dict[str, Any]:
    built = built if built is not None else build_product_action_matrix()
    available_groups = {item["key"] for item in built["module_groups"]}
    if module_group is not None and module_group not in available_groups:
        raise HTTPException(
            status_code=422,
            detail={
                "field": "module_group",
                "message": f"Unknown module_group: {module_group}.",
            },
        )
    selected = [
        row for row in built["rows"]
        if module_group is None or row["module_group"] == module_group
    ]
    groups = [
        group for group in built["module_groups"]
        if module_group is None or group["key"] == module_group
    ]
    grouped: dict[tuple[str, str], list[dict[str, str]]] = defaultdict(list)
    for row in selected:
        grouped[(row["product_key"], row["module_group"])].append(row)
    rows = []
    for _, product_rows in grouped.items():
        product_rows.sort(key=lambda row: safe_int(row.get("action_nbr", "")))
        rows.append(_api_row(product_rows))
    rows.sort(key=lambda row: (
        next((index for index, group in enumerate(built["module_groups"]) if group["key"] == row["module_group"]), 9999),
        row["product_name"].casefold(),
        row["product_key"],
    ))
    return {"module_groups": groups, "actions": built["actions"], "rows": rows}


def rebuild_product_action_matrix(
    decision_updates: dict[tuple[str, str, str], dict[str, str]] | None = None,
    built: dict[str, Any] | None = None,
) -> list[dict[str, str]]:
    """Regenerate current rows and preserve decisions, including orphaned ones."""
    global _CACHE_FINGERPRINT, _CACHED_MATRIX
    with locked_files(PRODUCT_ACTION_DECISIONS_FILE):
        with _CACHE_LOCK:
            built = built if built is not None else build_product_action_matrix()
            updates = decision_updates or {}
            for row in built["flat_rows"]:
                key = (row["product_key"], row["module_group"], row["action_nbr"])
                if key in updates:
                    row.update(updates[key])
            decision_rows = []
            for row in built["flat_rows"]:
                decision = _decision_values(row)
                if not any(value_to_str(row.get(field, "")) for field in DECISION_FIELDS):
                    continue
                decision_rows.append(
                    {
                        **{
                            header: value_to_str(row.get(header, ""))
                            for header in PRODUCT_ACTION_DECISION_HEADERS[:3]
                        },
                        **decision,
                        **{
                            header: value_to_str(row.get(header, ""))
                            for header in PRODUCT_ACTION_DECISION_HEADERS[8:]
                        },
                    }
                )
            write_rows_to_csv(
                PRODUCT_ACTION_DECISIONS_FILE,
                decision_rows,
                PRODUCT_ACTION_DECISION_HEADERS,
            )
            invalidate_product_action_matrix_cache()
            _CACHE_FINGERPRINT = _input_fingerprint()
            _CACHED_MATRIX = copy.deepcopy(built)
            return built["flat_rows"]


def matrix_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace(
        "+00:00", "Z"
    )


def export_product_action_matrix(module_group: str | None = None) -> tuple[str, str]:
    built = build_product_action_matrix()
    groups = {item["key"] for item in built["module_groups"]}
    if module_group is not None and module_group not in groups:
        raise HTTPException(
            status_code=422,
            detail={
                "field": "module_group",
                "message": f"Unknown module_group: {module_group}.",
            },
        )
    rows = [
        row for row in built["flat_rows"]
        if module_group is None or row["module_group"] == module_group
    ]
    output = io.StringIO(newline="")
    writer = csv.DictWriter(output, fieldnames=PRODUCT_ACTION_MATRIX_HEADERS, extrasaction="ignore")
    writer.writeheader()
    for row in rows:
        guarded = {}
        for header in PRODUCT_ACTION_MATRIX_HEADERS:
            value = value_to_str(row.get(header, ""))
            guarded[header] = "'" + value if value.startswith(("=", "+", "-", "@", "\t", "\r")) else value
        writer.writerow(guarded)
    suffix = f"_{module_group}" if module_group else ""
    return output.getvalue(), f"PYPCS_ProductActionMatrix{suffix}.csv"

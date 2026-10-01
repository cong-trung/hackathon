"""PYPCS CSV filenames plus row normalization / visible-question resolution logic."""

from typing import Any

from app.io.csv_excel import value_to_str
from app.io.generic_csv import read_generic_csv, safe_int, split_options, yn_to_bool

PYPCS_MODULES_FILE = "PYPCS_Modules.csv"
PYPCS_QUESTIONS_FILE = "PYPCS_Questions.csv"
PYPCS_QUESTION_MODULE_MAP_FILE = "PYPCS_QuestionModuleMap.csv"
PYPCS_SUBMISSIONS_FILE = "PYPCS_Submissions.csv"
PYPCS_SUBMISSION_ANSWERS_FILE = "PYPCS_SubmissionAnswers.csv"
PYPCS_SUBMISSION_CELLS_FILE = "PYPCS_SubmissionCells.csv"
PYPCS_ACTION_ITEMS_FILE = "PYPCS_ActionItems.csv"

ACTION_ITEM_APPLICABILITY_FIELDS = {
    "package": "package",
    "bare_die_lid": "bare_die_lid",
    "foveros": "foveros",
    "segment": "segment",
    "xvi_tool_type": "xvi_tool_type",
    "lts_ball": "lts_ball",
    "hdmx_ap_pan": "hdmx_ap_pan",
}
ACTION_ITEM_HEADERS = [
    "nbr",
    "ar_follow_up",
    "actionable_item",
    "reference",
    "description",
    "package",
    "bare_die_lid",
    "foveros",
    "segment",
    "xvi_tool_type",
    "xvi_tool_comment",
    "lts_ball",
    "hdmx_ap_pan",
    "owner",
    "update_by",
    "scenario",
    "updated_at",
]

# Derived from the ATRMS Operation_Process_Step tracker; see data/Operation_Process_Step.csv.
OPERATION_PROCESS_STEP_FILE = "Operation_Process_Step.csv"


def build_action_item_options() -> dict[str, Any]:
    questions_by_id = {
        value_to_str(row.get("question_id", "")): row
        for row in read_generic_csv(PYPCS_QUESTIONS_FILE)
    }
    extra_options = {
        "segment": ["Mobile"],
        "xvi_tool_type": ["Multiple"],
    }
    fields = {}

    for field, question_id in ACTION_ITEM_APPLICABILITY_FIELDS.items():
        question = questions_by_id.get(question_id, {})
        candidates = [
            "All",
            *split_options(question.get("options", "")),
            *extra_options.get(field, []),
            "NA",
        ]
        fields[field] = list(dict.fromkeys(candidates))

    return {
        "fields": fields,
        "owner": ["TRB", "Module Engineer", "Other"],
    }


def load_operation_options(selected_modules: set[str] | None = None) -> list[str]:
    rows = read_generic_csv(OPERATION_PROCESS_STEP_FILE)
    modules_upper = (
        {value_to_str(m).upper() for m in selected_modules}
        if selected_modules
        else None
    )
    seen: set[str] = set()
    options: list[str] = []

    for row in rows:
        module_key = value_to_str(row.get("MODULE_KEY", "")).upper()

        if modules_upper is not None and module_key not in modules_upper:
            continue

        operation = value_to_str(row.get("OPERATION", ""))

        if operation and operation not in seen:
            seen.add(operation)
            options.append(operation)

    options.append("Other")
    return options


def load_operation_options_by_module(
    selected_modules: set[str] | None = None,
) -> dict[str, list[str]]:
    """Per-module operation options, so each module's own cell only shows its operations."""
    rows = read_generic_csv(OPERATION_PROCESS_STEP_FILE)
    modules_upper = (
        {value_to_str(m).upper() for m in selected_modules}
        if selected_modules
        else None
    )
    seen_by_module: dict[str, set[str]] = {}
    options_by_module: dict[str, list[str]] = {}

    for row in rows:
        # Keep the CSV's original module_key casing (matches PYPCS_Modules.csv,
        # which is not all-uppercase, e.g. "HDMx_AHMT") so frontend lookups by
        # exact module_key succeed instead of silently falling back.
        module_key_original = value_to_str(row.get("MODULE_KEY", ""))
        module_key_upper = module_key_original.upper()

        if not module_key_original:
            continue

        if modules_upper is not None and module_key_upper not in modules_upper:
            continue

        operation = value_to_str(row.get("OPERATION", ""))

        if not operation:
            continue

        seen = seen_by_module.setdefault(module_key_original, set())

        if operation not in seen:
            seen.add(operation)
            options_by_module.setdefault(module_key_original, []).append(operation)

    for module_key, options in options_by_module.items():
        options.append("Other")

    return options_by_module


def normalize_pypcs_module(row: dict[str, str]) -> dict[str, Any]:
    return {
        "module_id": value_to_str(row.get("module_id", "")),
        "module_key": value_to_str(row.get("module_key", "")),
        "module_label": value_to_str(row.get("module_label", "")),
        "enabled_default": yn_to_bool(row.get("enabled_default", "")),
        "allowed_roles": split_options(row.get("allowed_roles", "")),
        "sort_order": safe_int(row.get("sort_order", "0")),
        "notes": value_to_str(row.get("notes", "")),
    }


def normalize_pypcs_question(
    row: dict[str, str], selected_modules: set[str] | None = None
) -> dict[str, Any]:
    question_id = value_to_str(row.get("question_id", ""))
    is_operation = question_id == "operation"
    options = (
        load_operation_options(selected_modules)
        if is_operation
        else split_options(row.get("options", ""))
    )
    options_by_module = (
        load_operation_options_by_module(selected_modules) if is_operation else {}
    )

    return {
        "question_id": question_id,
        "source_prefix": value_to_str(row.get("source_prefix", "")),
        "header": value_to_str(row.get("header", "")),
        "display_label": value_to_str(row.get("display_label", "")),
        "description": value_to_str(row.get("description", "")),
        "role": value_to_str(row.get("role", "")),
        "field_type": value_to_str(row.get("field_type", "text")),
        "required_default": yn_to_bool(row.get("required_default", "")),
        "sort_order": safe_int(row.get("sort_order", "0")),
        "options": options,
        "options_by_module": options_by_module,
        "dependency_rule": value_to_str(row.get("dependency_rule", "")),
        "notes": value_to_str(row.get("notes", "")),
    }


def normalize_pypcs_map(row: dict[str, str]) -> dict[str, Any]:
    return {
        "question_id": value_to_str(row.get("question_id", "")),
        "module_id": value_to_str(row.get("module_id", "")),
        "module_key": value_to_str(row.get("module_key", "")),
        "required": yn_to_bool(row.get("required", "")),
        "visible_default": yn_to_bool(row.get("visible_default", "")),
        "source_rule": value_to_str(row.get("source_rule", "")),
        "notes": value_to_str(row.get("notes", "")),
    }


def build_pypcs_visible_questions(
    selected_modules_input: list[str],
    role: str | None = None,
) -> dict[str, Any]:
    selected_modules = {
        value_to_str(module).upper()
        for module in selected_modules_input
        if value_to_str(module)
    }

    if not selected_modules:
        return {
            "selected_modules": [],
            "role": role,
            "count": 0,
            "items": [],
        }

    role_filter = value_to_str(role).upper() if role else ""

    question_rows = read_generic_csv(PYPCS_QUESTIONS_FILE)
    map_rows = read_generic_csv(PYPCS_QUESTION_MODULE_MAP_FILE)

    questions_by_id = {}

    for row in question_rows:
        question = normalize_pypcs_question(row, selected_modules)

        if question["question_id"]:
            questions_by_id[question["question_id"]] = question

    matched_maps = []

    for row in map_rows:
        mapping = normalize_pypcs_map(row)

        if (
            mapping["module_key"].upper() in selected_modules
            and mapping["visible_default"]
        ):
            matched_maps.append(mapping)

    visible_by_question_id: dict[str, dict[str, Any]] = {}

    for mapping in matched_maps:
        question_id = mapping["question_id"]

        if question_id not in questions_by_id:
            continue

        question = dict(questions_by_id[question_id])

        if role_filter and question.get("role", "").upper() != role_filter:
            continue

        if question_id not in visible_by_question_id:
            question["required"] = (
                mapping["required"]
                or question.get("required_default", False)
            )
            question["applies_to"] = [mapping["module_key"]]
            question["module_ids"] = [mapping["module_id"]]
            question["source_rules"] = [mapping["source_rule"]]
            visible_by_question_id[question_id] = question
        else:
            existing = visible_by_question_id[question_id]
            existing["required"] = existing["required"] or mapping["required"]

            if mapping["module_key"] not in existing["applies_to"]:
                existing["applies_to"].append(mapping["module_key"])

            if mapping["module_id"] not in existing["module_ids"]:
                existing["module_ids"].append(mapping["module_id"])

            if (
                mapping["source_rule"]
                and mapping["source_rule"] not in existing["source_rules"]
            ):
                existing["source_rules"].append(mapping["source_rule"])

    visible_questions = list(visible_by_question_id.values())

    visible_questions = sorted(
        visible_questions,
        key=lambda item: item.get("sort_order", 0),
    )

    return {
        "selected_modules": sorted(selected_modules),
        "role": role,
        "count": len(visible_questions),
        "items": visible_questions,
    }

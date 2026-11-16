"""Review queue for custom "Other" values typed into PYPCS selects and multiselects.

Custom values are stored only in submission cells. A reviewer can:
- approve a value: it is appended to the question's `options` before `Other`, or, for the
  `operation` question, added as an `Operation_Process_Step.csv` row for the module;
- reject a value: it stays in the submissions and is hidden from the pending queue;
- map a value to an existing option: matching cells and the submission summary fields are
  rewritten to that option.

Every decision is appended to `QualityMatrix/PYPCS_OptionReviews.csv` and the change log.
The questions CSV is edited in place (only the affected cell changes) so its CRLF line
endings, BOM, and quoting of other rows are kept.
"""

import csv
import io
import logging
import re
import uuid
from dataclasses import dataclass, field
from typing import Any

from fastapi import HTTPException

from app import config
from app.auth import timestamp_now
from app.io.concurrency import append_bytes, atomic_write_bytes, locked_files
from app.io.csv_excel import value_to_str
from app.io.generic_csv import (
    read_generic_csv,
    read_generic_csv_headers,
    safe_int,
    split_options,
    split_pipe_value,
    write_rows_to_csv,
)
from app.services.change_log import FieldChange, new_request_id, record_changes
from app.services.pypcs_service import (
    OPERATION_PROCESS_STEP_FILE,
    PYPCS_MODULES_FILE,
    PYPCS_QUESTIONS_FILE,
    PYPCS_SUBMISSION_CELLS_FILE,
    PYPCS_SUBMISSIONS_FILE,
    load_operation_options_by_module,
)
from app.services.product_action_matrix_service import invalidate_product_action_matrix_cache
from app.services.submission_history import (
    PYPCS_SUBMISSION_HISTORY_FILE,
    append_submission_history,
    normalize_status,
)

logger = logging.getLogger(__name__)

OPTION_REVIEWS_FILE = "QualityMatrix/PYPCS_OptionReviews.csv"
OPTION_REVIEW_HEADERS = [
    "review_id",
    "question_id",
    "module_key",
    "value",
    "decision",
    "mapped_to",
    "operation_description",
    "decided_by",
    "decided_at",
    "note",
]
OPERATION_QUESTION_ID = "operation"
OTHER = "other"
ACTION_STATUS = {"approve": "approved", "reject": "rejected", "map": "mapped"}
STATUS_FILTERS = ("pending", "approved", "mapped", "rejected", "all")
MAX_VALUE_LENGTH = 100
MAX_OPERATION_LENGTH = 20
MAX_DESCRIPTION_LENGTH = 200
MAX_NOTE_LENGTH = 500
_LOCKED_FILES = (
    PYPCS_QUESTIONS_FILE,
    OPERATION_PROCESS_STEP_FILE,
    PYPCS_SUBMISSION_CELLS_FILE,
    PYPCS_SUBMISSIONS_FILE,
    OPTION_REVIEWS_FILE,
    PYPCS_SUBMISSION_HISTORY_FILE,
)
_UTF8_BOM = b"\xef\xbb\xbf"
_CONTROL_RE = re.compile(r"[\r\n]")
_CSV_SPECIAL_RE = re.compile(r'[",\r\n]')
_OPERATION_RE = re.compile(r"\d+")
_FORMULA_PREFIXES = ("=", "+", "@")

_Key = tuple[str, str, str]


def _error(status_code: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status_code, detail={"code": code, "message": message})


def _clean(value: Any) -> str:
    return value_to_str(value).strip()


def _clean_value(value: Any) -> str:
    raw = value_to_str(value)
    text = raw.strip()
    if not text:
        raise _error(422, "value_required", "A value is required.")
    if len(text) > MAX_VALUE_LENGTH:
        raise _error(422, "value_too_long", f"Value must be at most {MAX_VALUE_LENGTH} characters.")
    if _CONTROL_RE.search(text):
        raise _error(422, "invalid_value", "Value cannot contain line breaks.")
    # Spreadsheet formula prefixes would execute when the CSV is opened in Excel.
    if text[0] in _FORMULA_PREFIXES or raw[:1] in ("\t", "\r"):
        raise _error(422, "formula_prefix", "Value cannot start with =, +, @, tab, or carriage return.")
    return text


def _key(question_id: str, module_key: str, value: str) -> _Key:
    return (question_id, module_key, value.casefold())


def _is_option_question(question_id: str, question: dict[str, str]) -> bool:
    if question_id == OPERATION_QUESTION_ID:
        return True
    if _clean(question.get("field_type")) not in ("select", "multiselect"):
        return False
    return any(option.casefold() == OTHER for option in split_options(question.get("options", "")))


def _is_multi(question_id: str, question: dict[str, str]) -> bool:
    return question_id == OPERATION_QUESTION_ID or _clean(question.get("field_type")) == "multiselect"


def _label(question_id: str, question: dict[str, str]) -> str:
    return _clean(question.get("display_label")) or _clean(question.get("header")) or question_id


@dataclass
class _Catalog:
    questions: dict[str, dict[str, str]]
    modules: dict[str, str]  # casefold -> canonical module_key
    operation_options: dict[str, list[str]]  # canonical module_key -> options (ends with Other)

    def module(self, value: Any) -> str:
        return self.modules.get(_clean(value).casefold(), "")

    def known(self, question_id: str, module_key: str) -> dict[str, str]:
        """Casefolded -> canonical spelling of the approved (non-Other) options."""
        if question_id == OPERATION_QUESTION_ID:
            options = self.operation_options.get(module_key, [])
        else:
            options = split_options(self.questions[question_id].get("options", ""))
        return {option.casefold(): option for option in options if option.casefold() != OTHER}


def _load_catalog() -> _Catalog:
    questions: dict[str, dict[str, str]] = {}
    for row in read_generic_csv(PYPCS_QUESTIONS_FILE):
        question_id = _clean(row.get("question_id"))
        if question_id:
            questions[question_id] = row
    modules: dict[str, str] = {}
    for row in read_generic_csv(PYPCS_MODULES_FILE):
        module_key = _clean(row.get("module_key"))
        if module_key:
            modules[module_key.casefold()] = module_key
    return _Catalog(questions, modules, load_operation_options_by_module())


def _latest_decisions() -> dict[_Key, dict[str, str]]:
    """The review file is append-only, so the last row for a key is the current decision."""
    latest: dict[_Key, dict[str, str]] = {}
    for row in read_generic_csv(OPTION_REVIEWS_FILE):
        question_id = _clean(row.get("question_id"))
        value = _clean(row.get("value"))
        if question_id and value:
            latest[_key(question_id, _clean(row.get("module_key")), value)] = row
    return latest


def _submission_statuses() -> dict[str, str]:
    return {
        _clean(row.get("submission_id")): _clean(row.get("status"))
        for row in read_generic_csv(PYPCS_SUBMISSIONS_FILE)
    }


@dataclass
class _Group:
    question_id: str
    module_key: str
    value: str
    submission_ids: list[str] = field(default_factory=list)
    first_seen: str = ""
    last_seen: str = ""


def _collect_groups(catalog: _Catalog, decisions: dict[_Key, dict[str, str]]) -> dict[_Key, _Group]:
    """Group custom values found in cells, plus every value that already has a decision."""
    groups: dict[_Key, _Group] = {}
    known_cache: dict[tuple[str, str], dict[str, str]] = {}
    for cell in read_generic_csv(PYPCS_SUBMISSION_CELLS_FILE):
        question_id = _clean(cell.get("question_id"))
        question = catalog.questions.get(question_id)
        if question is None or not _is_option_question(question_id, question):
            continue
        # Operation answers are per module; cells without a known module are not reviewable.
        module_key = catalog.module(cell.get("module_key")) if question_id == OPERATION_QUESTION_ID else ""
        if question_id == OPERATION_QUESTION_ID and not module_key:
            continue
        answer = value_to_str(cell.get("answer"))
        values = split_pipe_value(answer) if _is_multi(question_id, question) else [_clean(answer)]
        if (question_id, module_key) not in known_cache:
            known_cache[(question_id, module_key)] = catalog.known(question_id, module_key)
        known = known_cache[(question_id, module_key)]
        submission_id = _clean(cell.get("submission_id"))
        for raw_value in values:
            value = _clean(raw_value)
            folded = value.casefold()
            if not value or folded == OTHER:
                continue
            key = _key(question_id, module_key, value)
            if folded in known and key not in decisions:
                continue
            group = groups.get(key)
            if group is None:
                group = _Group(question_id, module_key, value)
                groups[key] = group
            if submission_id and submission_id not in group.submission_ids:
                group.submission_ids.append(submission_id)
            stamp = _clean(cell.get("updated_at"))
            if stamp:
                group.first_seen = min(group.first_seen or stamp, stamp)
                group.last_seen = max(group.last_seen or stamp, stamp)

    for key, row in decisions.items():
        if key not in groups:
            groups[key] = _Group(_clean(row.get("question_id")), _clean(row.get("module_key")), _clean(row.get("value")))
    return groups


def _question_order(catalog: _Catalog, question_id: str) -> int:
    return safe_int(catalog.questions.get(question_id, {}).get("sort_order"), 10**6)


def list_option_reviews(status_filter: str) -> dict[str, Any]:
    if status_filter not in STATUS_FILTERS:
        raise _error(422, "invalid_status", "Status must be pending, approved, mapped, rejected, or all.")
    catalog = _load_catalog()
    decisions = _latest_decisions()
    groups = _collect_groups(catalog, decisions)
    final_ids = {sid for sid, status in _submission_statuses().items() if normalize_status(status) == "final"}

    items: list[dict[str, Any]] = []
    for key, group in groups.items():
        decision = decisions.get(key)
        status = _clean(decision.get("decision")) if decision else "pending"
        question = catalog.questions.get(group.question_id, {})
        items.append(
            {
                "question_id": group.question_id,
                "question_label": _label(group.question_id, question),
                "module_key": group.module_key,
                "value": group.value,
                "status": status,
                "decided_by": _clean(decision.get("decided_by")) if decision else "",
                "decided_at": _clean(decision.get("decided_at")) if decision else "",
                "decision_note": _clean(decision.get("note")) if decision else "",
                "mapped_to": _clean(decision.get("mapped_to")) if decision else "",
                "submission_count": len(group.submission_ids),
                "final_submission_count": sum(1 for sid in group.submission_ids if sid in final_ids),
                "submission_ids": list(group.submission_ids),
                "first_seen": group.first_seen,
                "last_seen": group.last_seen,
            }
        )
    items.sort(
        key=lambda item: (
            _question_order(catalog, item["question_id"]),
            item["question_id"],
            item["module_key"],
            item["value"].casefold(),
        )
    )

    counts = {"pending": 0, "approved": 0, "mapped": 0, "rejected": 0}
    for item in items:
        counts[item["status"]] = counts.get(item["status"], 0) + 1
    visible = items if status_filter == "all" else [item for item in items if item["status"] == status_filter]
    return {"items": visible, "counts": counts}


# ---------------------------------------------------------------------------
# In-place CSV editing that keeps the original bytes outside the edited cell.
# ---------------------------------------------------------------------------


def _read_text(file_name: str) -> tuple[str, bool]:
    raw = (config.DATA_DIR / file_name).read_bytes()
    has_bom = raw.startswith(_UTF8_BOM)
    body = raw[len(_UTF8_BOM):] if has_bom else raw
    return body.decode("utf-8"), has_bom


def _write_text(file_name: str, text: str, has_bom: bool) -> None:
    data = text.encode("utf-8")
    atomic_write_bytes(config.DATA_DIR / file_name, (_UTF8_BOM if has_bom else b"") + data)


def _csv_field_spans(text: str) -> list[list[tuple[int, int]]]:
    """Return (start, end) offsets of each raw field, grouped by record."""
    records: list[list[tuple[int, int]]] = []
    spans: list[tuple[int, int]] = []
    start = 0
    in_quotes = False
    index = 0
    length = len(text)
    while index < length:
        char = text[index]
        if in_quotes:
            if char == '"':
                if index + 1 < length and text[index + 1] == '"':
                    index += 2
                    continue
                in_quotes = False
        elif char == '"' and index == start:
            in_quotes = True
        elif char == ",":
            spans.append((start, index))
            start = index + 1
        elif char in "\r\n":
            spans.append((start, index))
            records.append(spans)
            spans = []
            if char == "\r" and index + 1 < length and text[index + 1] == "\n":
                index += 1
            start = index + 1
        index += 1
    if start < length or spans:
        spans.append((start, length))
        records.append(spans)
    return records


def _unquote(raw: str) -> str:
    if len(raw) >= 2 and raw[0] == '"' and raw[-1] == '"':
        return raw[1:-1].replace('""', '"')
    return raw


def _quote_csv(value: str) -> str:
    if _CSV_SPECIAL_RE.search(value) or value != value.strip():
        return '"' + value.replace('"', '""') + '"'
    return value


def _options_with_custom(text: str, question_id: str, custom: str) -> str:
    """Insert `custom` before `Other` in the question's options cell; other bytes are unchanged."""
    records = _csv_field_spans(text)
    headers = [_unquote(text[start:end]) for start, end in records[0]]
    column = headers.index("options")
    for spans in records[1:]:
        start, end = spans[0]
        if _unquote(text[start:end]).strip() != question_id:
            continue
        if len(spans) <= column:
            raise _error(500, "malformed_csv", "PYPCS_Questions.csv row is missing the options column.")
        start, end = spans[column]
        parts = _unquote(text[start:end]).split("|")
        other_positions = [index for index, part in enumerate(parts) if part.strip().casefold() == OTHER]
        position = other_positions[-1] if other_positions else len(parts)
        parts.insert(position, custom)
        return text[:start] + _quote_csv("|".join(parts)) + text[end:]
    raise _error(404, "not_found", "Question not found in PYPCS_Questions.csv.")


def _operation_text_with_row(text: str, module_key: str, operation: str, description: str) -> str:
    line_end = "\r\n" if "\r\n" in text else "\n"
    headers = next(csv.reader([text.split("\n", 1)[0].rstrip("\r")]))
    values = {
        "MODULE_KEY": module_key,
        "OPERATION": operation,
        "OPER_SHORT_DESC": description,
        "OPER_LONG_DESC": description,
    }
    buffer = io.StringIO()
    csv.writer(buffer, lineterminator=line_end).writerow([values.get(header, "") for header in headers])
    if text and not text.endswith("\n"):
        text += line_end
    return text + buffer.getvalue()


def _append_review(row: dict[str, str]) -> None:
    path = config.DATA_DIR / OPTION_REVIEWS_FILE
    path.parent.mkdir(parents=True, exist_ok=True)
    is_new = not path.exists() or path.stat().st_size == 0
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=OPTION_REVIEW_HEADERS, lineterminator="\r\n")
    if is_new:
        writer.writeheader()
    writer.writerow(row)
    data = buffer.getvalue().encode("utf-8")
    if is_new:
        data = _UTF8_BOM + data
    append_bytes(path, data)


def _record_rollback(review_row: dict[str, str]) -> None:
    """Log a compensating 'pending' row after a failed data write; never masks the original error."""
    try:
        _append_review(
            {
                **review_row,
                "review_id": str(uuid.uuid4()),
                "decision": "pending",
                "mapped_to": "",
                "decided_at": timestamp_now(),
                "note": "rolled back: data write failed",
            }
        )
    except Exception:
        logger.exception("Could not write rollback row for option review %s", review_row.get("review_id"))


# ---------------------------------------------------------------------------
# Mapping custom values onto existing options.
# ---------------------------------------------------------------------------


def _replace_answer(answer: Any, folded: str, target: str, multi: bool) -> str | None:
    """Return the answer with the custom value replaced by `target`, or None if it is absent."""
    if multi:
        values = split_pipe_value(answer)
        if not any(value.casefold() == folded for value in values):
            return None
        result: list[str] = []
        seen: set[str] = set()
        for value in values:
            current = target if value.casefold() == folded else value
            if current.casefold() in seen:
                continue
            seen.add(current.casefold())
            result.append(current)
        return "|".join(result)
    return target if _clean(answer).casefold() == folded else None


def _apply_map(
    question_id: str,
    module_key: str,
    custom: str,
    target: str,
    question: dict[str, str],
    cells: list[dict[str, str]],
    submissions: list[dict[str, str]],
    username: str,
) -> dict[str, tuple[str, list[FieldChange]]]:
    """Rewrite matching cells and submission summary fields in memory; return changes per submission."""
    folded = custom.casefold()
    multi = _is_multi(question_id, question)
    timestamp = timestamp_now()
    changes: dict[str, tuple[str, list[FieldChange]]] = {}
    for cell in cells:
        if _clean(cell.get("question_id")) != question_id:
            continue
        cell_module = _clean(cell.get("module_key"))
        if question_id == OPERATION_QUESTION_ID and cell_module.casefold() != module_key.casefold():
            continue
        new_answer = _replace_answer(cell.get("answer"), folded, target, multi)
        if new_answer is None:
            continue
        cell["answer"] = new_answer
        cell["updated_at"] = timestamp
        cell["updated_by"] = username
        submission_id = _clean(cell.get("submission_id"))
        if submission_id not in changes:
            changes[submission_id] = ("", [])
        changes[submission_id][1].append(
            FieldChange(field=question_id, old_value=custom, new_value=target, module_key=cell_module)
        )

    summary_field = question_id if question_id in ("prodgroup3", OPERATION_QUESTION_ID) else ""
    labelled: dict[str, tuple[str, list[FieldChange]]] = {}
    for submission in submissions:
        submission_id = _clean(submission.get("submission_id"))
        if submission_id not in changes:
            continue
        if summary_field:
            replaced = _replace_answer(submission.get(summary_field), folded, target, True)
            if replaced is not None:
                submission[summary_field] = replaced
        label = _clean(submission.get("prodgroup3")) or submission_id
        labelled[submission_id] = (label, changes[submission_id][1])
    for submission_id, (_, change_list) in changes.items():
        labelled.setdefault(submission_id, (submission_id, change_list))
    return labelled


# ---------------------------------------------------------------------------
# Decisions.
# ---------------------------------------------------------------------------


def _unchanged(status: str) -> dict[str, Any]:
    return {"status": status, "changed": False, "option_added": False, "updated_cells": 0, "updated_submissions": 0}


def apply_option_decision(
    *,
    question_id: str,
    module_key: str,
    value: str,
    action: str,
    mapped_to: str,
    operation_description: str,
    note: str,
    user: dict[str, str],
) -> dict[str, Any]:
    if action not in ACTION_STATUS:
        raise _error(422, "invalid_action", "Action must be approve, reject, or map.")
    question_key = _clean(question_id)
    status = ACTION_STATUS[action]
    username = _clean(user.get("username"))
    role = _clean(user.get("role"))
    note_text = _clean(note)
    if len(note_text) > MAX_NOTE_LENGTH:
        raise _error(422, "note_too_long", f"Note must be at most {MAX_NOTE_LENGTH} characters.")
    custom = _clean_value(value)
    folded = custom.casefold()
    if folded == OTHER:
        raise _error(422, "invalid_value", "'Other' is not a custom value.")

    with locked_files(*_LOCKED_FILES):
        catalog = _load_catalog()
        question = catalog.questions.get(question_key)
        if question is None:
            raise _error(404, "not_found", "Question not found.")
        if not _is_option_question(question_key, question):
            raise _error(422, "not_option_question", "This question does not accept custom 'Other' values.")
        module = ""
        if question_key == OPERATION_QUESTION_ID:
            module = catalog.module(module_key)
            if not module:
                raise _error(422, "unknown_module", "Operation decisions need a known module_key.")

        decisions = _latest_decisions()
        latest = decisions.get(_key(question_key, module, custom))
        known = catalog.known(question_key, module)
        option_added = False
        questions_text: str | None = None
        questions_bom = False
        operations_text: str | None = None
        operations_bom = False
        description = ""
        changes: dict[str, tuple[str, list[FieldChange]]] = {}
        mapped_target = ""
        cells: list[dict[str, str]] = []
        cell_headers: list[str] = []
        submissions: list[dict[str, str]] = []
        submission_headers: list[str] = []
        final_ids: list[str] = []
        before_submission_by_id: dict[str, dict[str, str]] = {}
        before_cells_by_id: dict[str, list[dict[str, str]]] = {}

        if action == "approve":
            if question_key == OPERATION_QUESTION_ID:
                if not _OPERATION_RE.fullmatch(custom) or len(custom) > MAX_OPERATION_LENGTH:
                    raise _error(422, "invalid_operation", "Operation codes must be numeric (up to 20 digits).")
                description = _clean(operation_description)
                if not description:
                    raise _error(422, "description_required", "operation_description is required to approve an operation.")
                if len(description) > MAX_DESCRIPTION_LENGTH or _CONTROL_RE.search(description):
                    raise _error(422, "invalid_description", f"Description must be one line of at most {MAX_DESCRIPTION_LENGTH} characters.")
            elif "|" in custom:
                raise _error(422, "invalid_value", "An approved option cannot contain '|'.")
            if folded not in known:
                option_added = True
                if question_key == OPERATION_QUESTION_ID:
                    operations_text, operations_bom = _read_text(OPERATION_PROCESS_STEP_FILE)
                    operations_text = _operation_text_with_row(operations_text, module, custom, description)
                else:
                    questions_text, questions_bom = _read_text(PYPCS_QUESTIONS_FILE)
                    questions_text = _options_with_custom(questions_text, question_key, custom)
            if not option_added and latest and latest.get("decision") == status:
                return _unchanged(status)

        elif action == "reject":
            if folded in known:
                raise _error(422, "already_option", "This value is already an approved option.")
            if latest and latest.get("decision") == status:
                return _unchanged(status)

        else:  # map
            if question_key == "prodgroup3":
                raise _error(422, "map_not_supported", "prodgroup3 values cannot be mapped; approve or reject them instead.")
            if folded in known:
                raise _error(422, "already_option", "This value is already an approved option.")
            target = known.get(_clean(mapped_to).casefold())
            if not target:
                raise _error(422, "invalid_map_target", "mapped_to must be an existing option for this question.")
            mapped_target = target
            cells = read_generic_csv(PYPCS_SUBMISSION_CELLS_FILE)
            cell_headers = read_generic_csv_headers(PYPCS_SUBMISSION_CELLS_FILE)
            submissions = read_generic_csv(PYPCS_SUBMISSIONS_FILE)
            submission_headers = read_generic_csv_headers(PYPCS_SUBMISSIONS_FILE)
            # Snapshot pre-change rows so history records the state before this decision.
            before_submission_by_id = {_clean(row.get("submission_id")): dict(row) for row in submissions}
            for cell in cells:
                before_cells_by_id.setdefault(_clean(cell.get("submission_id")), []).append(dict(cell))
            changes = _apply_map(
                question_key, module, custom, target, question, cells, submissions, username
            )
            already_mapped = bool(
                latest
                and latest.get("decision") == status
                and _clean(latest.get("mapped_to")).casefold() == target.casefold()
            )
            if not changes and already_mapped:
                return _unchanged(status)
            status_by_submission = {
                _clean(row.get("submission_id")): normalize_status(row.get("status")) for row in submissions
            }
            final_ids = [sid for sid in changes if status_by_submission.get(sid) == "final"]
            if final_ids:
                if role != "admin":
                    raise _error(403, "admin_required", "Only admins may change final submissions.")
                if not note_text:
                    raise _error(422, "note_required", "A note is required when mapping values in final submissions.")

        updated_cells = sum(len(change_list) for _, change_list in changes.values())
        decided_at = timestamp_now()
        review_row = {
            "review_id": str(uuid.uuid4()),
            "question_id": question_key,
            "module_key": module,
            "value": custom,
            "decision": status,
            "mapped_to": mapped_target,
            "operation_description": description,
            "decided_by": username,
            "decided_at": decided_at,
            "note": note_text,
        }
        # Audit row first: if it cannot be written, no data has changed yet.
        _append_review(review_row)
        try:
            if questions_text is not None:
                _write_text(PYPCS_QUESTIONS_FILE, questions_text, questions_bom)
            if operations_text is not None:
                _write_text(OPERATION_PROCESS_STEP_FILE, operations_text, operations_bom)
            if changes:
                for submission_id in final_ids:
                    append_submission_history(
                        before_submission_by_id.get(submission_id, {}),
                        before_cells_by_id.get(submission_id, []),
                        "option_map",
                        username,
                        note_text,
                    )
                write_rows_to_csv(PYPCS_SUBMISSION_CELLS_FILE, cells, cell_headers)
                write_rows_to_csv(PYPCS_SUBMISSIONS_FILE, submissions, submission_headers)
        except Exception:
            _record_rollback(review_row)
            raise
        if changes:
            invalidate_product_action_matrix_cache()

        request_id = new_request_id()
        for submission_id, (label, change_list) in changes.items():
            record_changes(
                username=username,
                role=role,
                entity_type="product_info",
                entity_id=submission_id,
                ticket_label=label,
                action="option_map",
                request_id=request_id,
                changes=change_list,
            )
        entity_id = f"{question_key}:{module}:{custom}" if module else f"{question_key}:{custom}"
        new_value = f"mapped to {mapped_target}" if action == "map" else status
        record_changes(
            username=username,
            role=role,
            entity_type="option",
            entity_id=entity_id,
            ticket_label=f"{_label(question_key, question)}: {custom}",
            action=action,
            request_id=request_id,
            changes=[FieldChange(field="decision", old_value="", new_value=new_value, module_key=module)],
        )

    return {
        "status": status,
        "changed": True,
        "option_added": option_added,
        "updated_cells": updated_cells,
        "updated_submissions": len(changes),
    }

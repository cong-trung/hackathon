"""Targeted data retrieval for the AI chat endpoint.

The chat model cannot query the app's data files on its own; it only sees the
system prompt. This module scans the small CSV/XLSX files for rows related to
the user's question and renders a compact block that is injected into the
prompt, so questions about specific products, submissions, action items,
solutions or XRB cases can be answered with real records instead of aggregate
counts only.
"""

from __future__ import annotations

import csv
import html
import logging
import re
import threading
import time
from pathlib import Path

from app.config import DATA_DIR
from app.io.csv_excel import (
    is_excel_file,
    normalize_row,
    read_csv_file,
    read_excel_like,
)
from app.schema_config import MODULE_CONFIG, MODULE_SOLUTION_CONFIG, SOLUTION_CONFIG

logger = logging.getLogger(__name__)

MAX_BLOCK_CHARS = 4200
CACHE_TTL_SECONDS = 300
XRB_TTL_SECONDS = 3600

_SUBMISSIONS_FILE = "QualityMatrix/PYPCS_Submissions.csv"
_CELLS_FILE = "QualityMatrix/PYPCS_SubmissionCells.csv"
_MODULES_FILE = "QualityMatrix/Settings/PYPCS_Modules.csv"
_QUESTIONS_FILE = "QualityMatrix/Settings/PYPCS_Questions.csv"
_QUESTION_MAP_FILE = "QualityMatrix/Settings/PYPCS_QuestionModuleMap.csv"
_ACTION_ITEMS_FILE = "View2/PYPCS_ActionItems.csv"
_VIEW3_FILE = "View3/PYPCS_ProductActionDecisions.csv"
_XRB_FILE = "XRB.csv"

_IDENTITY_CONFIG = {"fields": [], "original_to_fe": {}, "fe_to_original": {}}

_TOKEN_RE = re.compile(r"[a-z0-9][a-z0-9._\-/]*")
_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")

_STOPWORDS = frozenset({
    "about", "action", "all", "also", "an", "and", "answer", "answers", "any",
    "are", "at", "be", "by", "can", "case", "cases", "could", "current", "data",
    "describe", "description", "descriptions", "detail", "details", "did", "do",
    "does", "each", "exist", "existing", "exists", "file", "files", "find",
    "for", "from", "give", "has", "have", "how", "however", "in", "into", "is",
    "it", "item", "items", "its", "just", "latest", "like", "list", "many",
    "matrix", "me", "module", "modules", "more", "most", "much", "n/a", "need",
    "new", "of", "on", "only", "or", "our", "over", "owned", "owner", "per",
    "please", "product", "products", "pypcs", "quality", "question", "questions",
    "record", "records", "row", "rows", "show", "some", "status", "submission",
    "submissions", "such", "summarise", "summarize", "summary", "system", "tell",
    "than", "that", "the", "their", "them", "then", "there", "these", "they",
    "this", "those", "to", "under", "us", "use", "used", "using", "view", "want",
    "was", "we", "were", "what", "when", "where", "which", "who", "whose", "why",
    "with", "would", "xrb", "you", "your",
    "bao", "cac", "cho", "co", "cua", "du", "gi", "hay", "he", "ke", "la",
    "liet", "may", "nao", "nhieu", "nhung", "tat", "thong", "toi", "tom",
    "trong", "va", "ve",
})

_cache: dict[str, tuple[float, float, list[dict[str, str]]]] = {}
_cache_lock = threading.Lock()

_xrb_state: dict[str, object] = {"rows": [], "at": 0.0, "building": False}
_xrb_lock = threading.Lock()

_XRB_FIELDS = (
    "excursion_id",
    "excursion_title",
    "excursion_status",
    "excursion_type",
    "module_detected",
    "create_date",
    "problem_owner_name",
    "responsible_func_area",
    "root_cause_fix_summary",
)

_ACTION_FIELDS = (
    "nbr",
    "event_id",
    "module",
    "actionable_item",
    "reference",
    "description",
    "package",
    "foveros",
    "segment",
    "xvi_tool_type",
    "lts_ball",
    "hdmx_ap_pan",
    "owner",
    "update_by",
    "scenario",
    "updated_at",
)

_VIEW3_FIELDS = (
    "product_key",
    "module_group",
    "action_nbr",
    "status",
    "decision_state",
    "comment",
    "product_name",
    "prodgroup3",
    "actionable_item",
)


def _flat(value: object, limit: int = 80) -> str:
    text = html.unescape(_TAG_RE.sub(" ", str(value or "")))
    text = _WS_RE.sub(" ", text).strip()
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "..."


def _compose_line(pairs: list[tuple[str, str]]) -> str:
    return "  - " + " ".join(f"{key}={value}" for key, value in pairs if value)


def _tokens(message: str) -> list[str]:
    tokens: list[str] = []
    for raw in _TOKEN_RE.findall(str(message or "").casefold()):
        token = raw.strip("._-/")
        if len(token) < 3 or token in _STOPWORDS or token in tokens:
            continue
        tokens.append(token)
    return tokens


def _read_table(path: Path) -> list[dict[str, str]]:
    """Read a CSV/XLSX file into header-keyed row dicts (cached by mtime)."""
    if not path.exists():
        return []
    try:
        mtime = path.stat().st_mtime
    except OSError:
        return []
    key = str(path)
    now = time.time()
    cached = _cache.get(key)
    if cached and cached[0] == mtime and now - cached[1] < CACHE_TTL_SECONDS:
        return cached[2]
    try:
        if is_excel_file(path):
            _, rows = read_excel_like(path, _IDENTITY_CONFIG)
        else:
            _, rows = read_csv_file(path, _IDENTITY_CONFIG)
    except Exception:
        logger.warning("chat retrieval failed to read %s", path, exc_info=True)
        return []
    clean = [
        {
            (name or "").lstrip("\ufeff").strip(): (value or "")
            for name, value in row.items()
        }
        for row in rows
    ]
    _cache[key] = (mtime, now, clean)
    return clean


def _col(row: dict[str, str], name: str) -> str:
    value = row.get(name)
    if isinstance(value, str):
        return value
    target = name.casefold()
    for key, item in row.items():
        if key.casefold() == target:
            return item
    return ""


def _score(tokens: list[str], text: str, key_text: str = "") -> int:
    lowered = str(text or "").casefold()
    key_lowered = str(key_text or "").casefold()
    score = 0
    for token in tokens:
        if key_lowered and token in key_lowered:
            score += 2 * len(token)
        elif token in lowered:
            score += len(token)
    return score


def _matches_modules(value: str, module_terms: list[str]) -> bool:
    if not module_terms:
        return False
    folded = str(value or "").casefold()
    return any(term in folded for term in module_terms)


def _module_terms(tokens: list[str]) -> list[str]:
    keys = {
        (row.get("module_key") or "").strip().casefold()
        for row in _read_table(DATA_DIR / _MODULES_FILE)
        if (row.get("module_key") or "").strip()
    }
    terms = []
    for token in tokens:
        if token in keys or token == "hdmx":
            terms.append(token)
    return terms


def _sort_order(row: dict[str, str]) -> int:
    try:
        return int(float(_col(row, "sort_order") or 0))
    except (TypeError, ValueError):
        return 0


def _submission_answers(row: dict[str, str]) -> list[str]:
    submission_id = row.get("submission_id", "")
    if not submission_id:
        return []
    cells = [
        cell
        for cell in _read_table(DATA_DIR / _CELLS_FILE)
        if cell.get("submission_id") == submission_id
    ]
    if not cells:
        return []
    questions = {
        _col(question, "question_id"): question
        for question in _read_table(DATA_DIR / _QUESTIONS_FILE)
        if _col(question, "question_id")
    }
    lines = []
    for cell in cells[:10]:
        question = questions.get(cell.get("question_id", ""), {})
        label = _flat(
            _col(question, "display_label")
            or _col(question, "header")
            or cell.get("question_id", ""),
            50,
        )
        module_key = _flat(cell.get("module_key", ""), 16)
        answer = _flat(cell.get("answer", ""), 70)
        prefix = f"    {label}"
        if module_key:
            prefix += f" [{module_key}]"
        lines.append(f"{prefix} = {answer}" if answer else f"{prefix} = (blank)")
    if len(cells) > 10:
        lines.append(f"    (+{len(cells) - 10} more answers)")
    return lines


def _submissions_section(tokens: list[str], module_terms: list[str]) -> str:
    rows = _read_table(DATA_DIR / _SUBMISSIONS_FILE)
    scored: list[tuple[int, int, dict[str, str]]] = []
    for row in rows:
        text = " ".join(
            row.get(name, "")
            for name in (
                "product_name",
                "prodgroup3",
                "selected_modules",
                "operation",
                "submitted_by",
                "role",
                "status",
                "submission_id",
            )
        )
        key_text = " ".join(
            row.get(name, "")
            for name in ("product_name", "prodgroup3", "submission_id")
        )
        key_score = _score(tokens, key_text)
        score = _score(tokens, text) + key_score
        if score and _matches_modules(row.get("selected_modules", ""), module_terms):
            score += 8
        if score:
            scored.append((score, key_score, row))
    if not scored:
        return ""
    scored.sort(key=lambda entry: entry[0], reverse=True)
    lines = ["PYPCS submissions matched:"]
    for _, _, row in scored[:5]:
        lines.append(
            _compose_line(
                [
                    ("id", _flat(row.get("submission_id"), 8)),
                    ("product", _flat(row.get("product_name"), 40)),
                    ("prodgroup3", _flat(row.get("prodgroup3"), 20)),
                    ("modules", _flat(row.get("selected_modules"), 40)),
                    ("status", _flat(row.get("status"), 12)),
                    ("answers", _flat(row.get("answer_count"), 6)),
                    ("updated", _flat(row.get("updated_at"), 20)),
                ]
            )
        )
    if len(scored) > 5:
        lines.append(f"  (showing 5 of {len(scored)} matching submissions)")
    if scored[0][1] > 0:
        detail = _submission_answers(scored[0][2])
        if detail:
            lines.append("  Answers of the closest matching submission:")
            lines.extend(detail)
    return "\n".join(lines)


def _action_items_section(tokens: list[str], module_terms: list[str]) -> str:
    rows = _read_table(DATA_DIR / _ACTION_ITEMS_FILE)
    scored: list[tuple[int, dict[str, str]]] = []
    for row in rows:
        text = " ".join(row.get(name, "") for name in _ACTION_FIELDS)
        key_text = " ".join(
            row.get(name, "")
            for name in ("nbr", "actionable_item", "owner", "reference")
        )
        score = _score(tokens, text) + _score(tokens, key_text)
        if score and _matches_modules(row.get("module", ""), module_terms):
            score += 8
        if score:
            scored.append((score, row))
    if not scored:
        return ""
    scored.sort(key=lambda entry: entry[0], reverse=True)
    lines = ["View 2 action items matched:"]
    for _, row in scored[:12]:
        lines.append(
            _compose_line(
                [
                    ("#", _flat(row.get("nbr"), 6)),
                    ("module", _flat(row.get("module"), 16)),
                    ("owner", _flat(row.get("owner"), 24)),
                    ("item", f'"{_flat(row.get("actionable_item"), 90)}"'),
                    ("ref", f'"{_flat(row.get("reference"), 40)}"'),
                    ("updated", _flat(row.get("updated_at"), 20)),
                ]
            )
        )
    if len(scored) > 12:
        lines.append(f"  (showing 12 of {len(scored)} matching action items)")
    return "\n".join(lines)


def _solutions_section(
    tokens: list[str], module_terms: list[str], allow_module_fallback: bool = False
) -> tuple[str, set[str]]:
    rows = _read_table(DATA_DIR / SOLUTION_CONFIG["file"])
    scored: list[tuple[int, dict[str, str]]] = []
    for row in rows:
        solution_id = _col(row, "ID")
        module = _col(row, "Module")
        text = " ".join(
            [
                solution_id,
                module,
                _col(row, "Solution"),
                _col(row, "Key Summary"),
                _col(row, "Excursion Releated"),
            ]
        )
        key_text = " ".join([solution_id, module, _col(row, "Solution")])
        score = _score(tokens, text) + _score(tokens, key_text)
        if score and _matches_modules(module, module_terms):
            score += 8
        if score:
            scored.append((score, row))
    if not scored:
        if not module_terms or not allow_module_fallback:
            return "", set()
        for row in rows:
            module = _col(row, "Module").casefold()
            if module and any(module.startswith(term) for term in module_terms):
                scored.append((1, row))
        if not scored:
            return "", set()
    scored.sort(key=lambda entry: entry[0], reverse=True)
    lines = ["GL-MQR solutions matched:"]
    for _, row in scored[:8]:
        lines.append(
            _compose_line(
                [
                    ("ID", _flat(_col(row, "ID"), 8)),
                    ("module", _flat(_col(row, "Module"), 16)),
                    ("solution", f'"{_flat(_col(row, "Solution"), 90)}"'),
                    ("summary", f'"{_flat(_col(row, "Key Summary"), 50)}"'),
                    ("excursion", _flat(_col(row, "Excursion Releated"), 6)),
                ]
            )
        )
    if len(scored) > 8:
        lines.append(f"  (showing 8 of {len(scored)} matching solutions)")
    solution_ids = {
        _col(row, "ID") for _, row in scored[:10] if _col(row, "ID")
    }
    return "\n".join(lines), solution_ids


def _pdo_section(
    tokens: list[str], solution_ids: set[str], module_terms: list[str]
) -> str:
    scored: list[tuple[int, str, dict[str, str]]] = []
    for module, config in MODULE_SOLUTION_CONFIG.items():
        for row in _read_table(DATA_DIR / config["file"]):
            solution_id = _col(row, "SolutionID")
            text = " ".join(
                (
                    _col(row, "PdID"),
                    solution_id,
                    _col(row, "Status"),
                    _col(row, "Note"),
                )
            )
            score = _score(tokens, text)
            if solution_id and solution_id in solution_ids:
                score = max(score, 30)
            if score and _matches_modules(module, module_terms):
                score += 8
            if score:
                scored.append((score, module, row))
    if not scored:
        return ""
    scored.sort(key=lambda entry: entry[0], reverse=True)
    lines = ["PdO product-solution rows matched:"]
    for _, module, row in scored[:6]:
        lines.append(
            _compose_line(
                [
                    ("module", module),
                    ("PdID", f'"{_flat(_col(row, "PdID"), 70)}"'),
                    ("solutionID", _flat(_col(row, "SolutionID"), 8)),
                    ("status", _flat(_col(row, "Status"), 20)),
                    ("note", f'"{_flat(_col(row, "Note"), 40)}"'),
                ]
            )
        )
    if len(scored) > 6:
        lines.append(f"  (showing 6 of {len(scored)} matching PdO rows)")
    return "\n".join(lines)


def _product_basis_section(tokens: list[str], module_terms: list[str]) -> str:
    lines: list[str] = []
    matched_total = 0
    for module, config in MODULE_CONFIG.items():
        scored: list[tuple[int, dict[str, str]]] = []
        for raw in _read_table(DATA_DIR / config["file"]):
            row = normalize_row(raw, config)
            text = " ".join(str(row.get(field, "")) for field in config["fields"])
            key_text = f"{row.get('product', '')} {row.get('prodgroup3', '')}"
            score = _score(tokens, text) + _score(tokens, key_text)
            if score and _matches_modules(module, module_terms):
                score += 8
            if score:
                scored.append((score, row))
        if not scored:
            continue
        scored.sort(key=lambda entry: entry[0], reverse=True)
        matched_total += len(scored)
        for _, row in scored[:3]:
            pairs: list[tuple[str, str]] = [("source", f"ProductBasisInfo_{module}")]
            for field in config["fields"]:
                value = _flat(row.get(field, ""), 30)
                if value:
                    pairs.append((field, f'"{value}"'))
                if len(pairs) >= 9:
                    break
            lines.append(_compose_line(pairs))
    if not lines:
        return ""
    header = f"Product Basis (TI) rows matched ({matched_total} total, top shown):"
    return "\n".join([header, *lines[:5]])


def _questions_section(module_terms: list[str]) -> str:
    questions = _read_table(DATA_DIR / _QUESTIONS_FILE)
    by_id = {
        _col(row, "question_id"): row
        for row in questions
        if _col(row, "question_id")
    }
    mapping = _read_table(DATA_DIR / _QUESTION_MAP_FILE)
    if module_terms:
        items: list[tuple[int, str]] = []
        for row in mapping:
            module_key = _col(row, "module_key").casefold()
            if not module_key or not any(
                module_key.startswith(term) for term in module_terms
            ):
                continue
            visible = _col(row, "visible_default").strip().upper()
            if visible not in {"Y", "YES", "TRUE", "1"}:
                continue
            question = by_id.get(_col(row, "question_id"))
            if not question:
                continue
            label = _flat(
                _col(question, "display_label") or _col(question, "header"), 60
            )
            if label:
                items.append((_sort_order(question), label))
        if not items:
            return ""
        items.sort(key=lambda entry: entry[0])
        labels = [label for _, label in items]
        shown = labels[:20]
        suffix = f"; +{len(labels) - 20} more" if len(labels) > 20 else ""
        return (
            f"Questions visible for module(s) {', '.join(module_terms).upper()} "
            f"({len(labels)}): " + "; ".join(shown) + suffix
        )
    counts: dict[str, int] = {}
    for row in mapping:
        module_key = _col(row, "module_key").strip()
        if not module_key:
            continue
        visible = _col(row, "visible_default").strip().upper()
        if visible not in {"Y", "YES", "TRUE", "1"}:
            continue
        counts[module_key] = counts.get(module_key, 0) + 1
    if not counts:
        return ""
    summary = ", ".join(
        f"{name}={count}" for name, count in sorted(counts.items())
    )
    return (
        f"Visible questions per module ({len(questions)} questions defined): "
        f"{summary}"
    )


def _view3_section(tokens: list[str], module_terms: list[str]) -> str:
    rows = _read_table(DATA_DIR / _VIEW3_FILE)
    scored: list[tuple[int, dict[str, str]]] = []
    for row in rows:
        text = " ".join(_col(row, name) for name in _VIEW3_FIELDS)
        key_text = " ".join(
            _col(row, name)
            for name in ("product_name", "prodgroup3", "product_key", "action_nbr")
        )
        score = _score(tokens, text) + _score(tokens, key_text)
        if score and _matches_modules(_col(row, "module_group"), module_terms):
            score += 8
        if score:
            scored.append((score, row))
    if not scored:
        return ""
    scored.sort(key=lambda entry: entry[0], reverse=True)
    lines = ["View 3 product action rows matched:"]
    for _, row in scored[:4]:
        lines.append(
            _compose_line(
                [
                    ("product", _flat(_col(row, "product_name"), 40)),
                    ("prodgroup3", _flat(_col(row, "prodgroup3"), 20)),
                    ("group", _flat(_col(row, "module_group"), 16)),
                    ("action", f"#{_flat(_col(row, 'action_nbr'), 6)}"),
                    ("status", _flat(_col(row, "status"), 16)),
                    ("state", _flat(_col(row, "decision_state"), 12)),
                    ("comment", f'"{_flat(_col(row, "comment"), 50)}"'),
                ]
            )
        )
    return "\n".join(lines)


def _xrb_path() -> Path:
    return DATA_DIR / _XRB_FILE


def _build_xrb_index() -> list[dict[str, str]]:
    path = _xrb_path()
    if not path.exists():
        return []
    csv.field_size_limit(10 * 1024 * 1024)
    rows: list[dict[str, str]] = []
    with path.open("r", encoding="utf-8", errors="replace", newline="") as handle:
        for row in csv.DictReader(handle):
            compact = {name: (row.get(name) or "").strip() for name in _XRB_FIELDS}
            compact["_search"] = " ".join(
                (
                    compact["excursion_id"],
                    compact["excursion_title"][:120],
                    compact["excursion_status"],
                    compact["excursion_type"],
                    compact["module_detected"],
                    compact["problem_owner_name"],
                    compact["responsible_func_area"],
                    compact["root_cause_fix_summary"][:150],
                )
            ).casefold()
            rows.append(compact)
    return rows


def _xrb_rows() -> list[dict[str, str]] | None:
    path = _xrb_path()
    now = time.time()
    with _xrb_lock:
        rows = _xrb_state["rows"]
        if (
            isinstance(rows, list)
            and rows
            and now - float(_xrb_state["at"] or 0.0) < XRB_TTL_SECONDS
        ):
            return rows
        if _xrb_state["building"] or not path.exists():
            return rows if isinstance(rows, list) else []
        _xrb_state["building"] = True

    def worker() -> None:
        try:
            built = _build_xrb_index()
        except Exception:
            logger.warning("XRB chat index build failed", exc_info=True)
            built = []
        with _xrb_lock:
            _xrb_state["rows"] = built
            _xrb_state["at"] = time.time()
            _xrb_state["building"] = False

    threading.Thread(target=worker, name="chat-xrb-index", daemon=True).start()
    return None


def _xrb_section(tokens: list[str], message: str) -> str:
    folded = message.casefold()
    if "xrb" not in folded and "excursion" not in folded:
        return ""
    if not _xrb_path().exists():
        return (
            f"  - {_XRB_FILE} was not found in the data directory ({DATA_DIR}); "
            "XRB details are unavailable from files right now."
        )
    rows = _xrb_rows()
    if rows is None:
        return (
            "  - The XRB index is still loading (large export); "
            "repeat the question in a moment."
        )
    if not rows:
        return ""
    matches: list[tuple[int, dict[str, str]]] = []
    for row in rows:
        score = _score(tokens, row.get("_search", ""))
        if score:
            matches.append((score, row))
    if not matches:
        return ""
    matches.sort(key=lambda entry: entry[0], reverse=True)
    lines = [f"  - {len(matches)} XRB cases matched; top examples:"]
    for _, row in matches[:5]:
        lines.append(
            _compose_line(
                [
                    ("id", row.get("excursion_id", "")),
                    ("title", f'"{_flat(row.get("excursion_title"), 70)}"'),
                    ("status", _flat(row.get("excursion_status"), 24)),
                    ("type", _flat(row.get("excursion_type"), 30)),
                    ("module", _flat(row.get("module_detected"), 16)),
                    ("owner", _flat(row.get("problem_owner_name"), 24)),
                    ("created", _flat(row.get("create_date"), 10)),
                    ("fix", f'"{_flat(row.get("root_cause_fix_summary"), 80)}"'),
                ]
            )
        )
    return "\n".join(lines)


def get_relevant_data(message: str) -> str:
    """Return a compact block of data rows relevant to the user's message."""
    try:
        text = str(message or "")
        tokens = _tokens(text)
        module_terms = _module_terms(tokens)
        module_set = set(module_terms)
        content_tokens = [token for token in tokens if token not in module_set]
        folded = text.casefold()
        if (
            not content_tokens
            and not module_terms
            and "xrb" not in folded
            and "excursion" not in folded
        ):
            return ""
        sections: list[str] = []

        submissions = _submissions_section(content_tokens, module_terms)
        if submissions:
            sections.append(submissions)
        action_items = _action_items_section(content_tokens, module_terms)
        if action_items:
            sections.append(action_items)
        solutions, solution_ids = _solutions_section(
            content_tokens, module_terms, "solution" in folded
        )
        if solutions:
            sections.append(solutions)
        pdo = _pdo_section(content_tokens, solution_ids, module_terms)
        if pdo:
            sections.append(pdo)
        product_basis = _product_basis_section(content_tokens, module_terms)
        if product_basis:
            sections.append(product_basis)
        if "question" in folded or ("module" in folded and module_terms):
            questions = _questions_section(module_terms)
            if questions:
                sections.append(questions)
        view3 = _view3_section(content_tokens, module_terms)
        if view3:
            sections.append(view3)
        xrb = _xrb_section(tokens, text)
        if xrb:
            sections.append(xrb)

        block = "\n".join(sections)
        if not block:
            return ""
        if len(block) > MAX_BLOCK_CHARS:
            block = block[:MAX_BLOCK_CHARS].rstrip() + "\n  ...(truncated)"
        return block
    except Exception:
        logger.warning("chat retrieval failed", exc_info=True)
        return ""

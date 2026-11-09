"""Compact live-data snapshot injected into the AI chat system prompt.

Builds a small cached text summary from the CSV/XLSX files the app reads, so
the chat model can answer with real values (counts, statuses, examples)
instead of guessing. Small files are summarized inline and cached briefly;
the large XRB export is summarized on a background thread and cached longer.
"""

from __future__ import annotations

import csv
import html
import logging
import re
import threading
import time
from collections import Counter
from collections.abc import Iterable, Iterator
from pathlib import Path

from app.config import DATA_DIR

logger = logging.getLogger(__name__)

SNAPSHOT_TTL_SECONDS = 600
XRB_TTL_SECONDS = 3600
MAX_SNAPSHOT_CHARS = 5200
RETRY_AFTER_FAILURE_SECONDS = 60

_lock = threading.Lock()
_light: dict[str, object] = {"text": "", "at": 0.0}
_xrb: dict[str, object] = {"text": "", "at": 0.0, "building": False, "missing": False}

_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")


def _short(value: object, limit: int = 80) -> str:
    text = html.unescape(_TAG_RE.sub(" ", str(value or "")))
    text = _WS_RE.sub(" ", text).strip()
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "..."


def _rows(path: Path) -> Iterator[dict[str, str]]:
    if not path.exists():
        return
    with path.open("r", encoding="utf-8", errors="replace", newline="") as handle:
        for row in csv.DictReader(handle):
            yield {
                (key or "").lstrip("\ufeff").strip(): (value or "")
                for key, value in row.items()
            }


def _counts(rows: Iterable[dict[str, str]], key: str, limit: int = 8) -> str:
    counter = Counter((row.get(key) or "").strip() for row in rows)
    counter.pop("", None)
    return ", ".join(f"{name}={count}" for name, count in counter.most_common(limit))


def _modules_section() -> str:
    path = DATA_DIR / "QualityMatrix" / "Settings" / "PYPCS_Modules.csv"
    keys = [(row.get("module_key") or "").strip() for row in _rows(path)]
    keys = [key for key in keys if key]
    return f"PYPCS modules: {', '.join(keys)}." if keys else ""


def _solutions_section() -> str:
    rows = list(_rows(DATA_DIR / "GL-MQR" / "Solution.csv"))
    if not rows:
        return ""
    by_module = Counter((row.get("Module") or "").strip() for row in rows)
    by_module.pop("", None)
    flagged = sum(
        1
        for row in rows
        if (row.get("Excursion Releated") or "").strip().lower()
        in {"y", "yes", "true", "1"}
    )
    summary = f"GL-MQR solution catalogue: {len(rows)} solutions"
    if by_module:
        summary += (
            " ("
            + ", ".join(f"{name}={count}" for name, count in by_module.most_common(8))
            + ")"
        )
    summary += f"; flagged 'Excursion Related': {flagged}."
    for module, _ in by_module.most_common(3):
        samples = [
            _short(row.get("Solution"), 60)
            for row in rows
            if (row.get("Module") or "").strip() == module
        ][:2]
        samples = [sample for sample in samples if sample]
        if samples:
            summary += f" Sample {module} solutions: {'; '.join(samples)}."
    return summary


def _product_basis_section() -> str:
    try:
        from app.io.csv_excel import read_data
        from app.schema_config import MODULE_CONFIG
    except Exception:
        return ""
    parts = []
    for module, config in MODULE_CONFIG.items():
        try:
            _, rows = read_data(config)
        except Exception:
            continue
        parts.append(f"{module}={len(rows)}")
    return f"Product Basis rows: {', '.join(parts)}." if parts else ""


def _pdo_section() -> str:
    parts = []
    for path in sorted((DATA_DIR / "PdO").glob("ProductSolutionMatrix_*.csv")):
        rows = list(_rows(path))
        if not rows:
            continue
        module = path.stem.replace("ProductSolutionMatrix_", "")
        statuses = _counts(rows, "Status", 6)
        detail = f" (Status: {statuses})" if statuses else ""
        parts.append(f"{module}: {len(rows)} rows{detail}")
    return "PdO product-solution rows: " + "; ".join(parts) + "." if parts else ""


def _action_items_section() -> str:
    rows = list(_rows(DATA_DIR / "View2" / "PYPCS_ActionItems.csv"))
    if not rows:
        return ""
    summary = f"View 2 action items: {len(rows)} rows"
    modules = _counts(rows, "module", 10)
    owners = _counts(rows, "owner", 5)
    if modules:
        summary += f" (module: {modules})"
    summary += "."
    if owners:
        summary += f" Owners: {owners}."
    latest = max(((row.get("updated_at") or "").strip() for row in rows), default="")
    if latest:
        summary += f" Latest update: {latest}."
    samples = [_short(row.get("actionable_item"), 60) for row in rows[:3]]
    samples = [sample for sample in samples if sample]
    if samples:
        summary += f" Examples: {'; '.join(samples)}."
    return summary


def _submissions_section() -> str:
    rows = list(_rows(DATA_DIR / "QualityMatrix" / "PYPCS_Submissions.csv"))
    if not rows:
        return ""
    products = {
        (row.get("prodgroup3") or "").strip()
        for row in rows
        if (row.get("prodgroup3") or "").strip()
    }
    summary = f"PYPCS submissions: {len(rows)} rows, {len(products)} distinct products"
    statuses = _counts(rows, "status", 6)
    if statuses:
        summary += f"; status: {statuses}"
    latest = max(((row.get("updated_at") or "").strip() for row in rows), default="")
    if latest:
        summary += f"; latest update: {latest}"
    return summary + "."


def _xrb_path() -> Path:
    return DATA_DIR / "XRB.csv"


def _build_xrb_summary() -> str:
    path = _xrb_path()
    if not path.exists():
        return ""
    csv.field_size_limit(10 * 1024 * 1024)
    status: Counter[str] = Counter()
    kind: Counter[str] = Counter()
    module: Counter[str] = Counter()
    total = 0
    latest: list[tuple[str, str, str, str, str]] = []
    with path.open("r", encoding="utf-8", errors="replace", newline="") as handle:
        for row in csv.DictReader(handle):
            total += 1
            status[(row.get("excursion_status") or "").strip()] += 1
            kind[(row.get("excursion_type") or "").strip()] += 1
            module[(row.get("module_detected") or "").strip()] += 1
            latest.append(
                (
                    (row.get("excursion_id") or "").strip(),
                    _short(row.get("excursion_title"), 60),
                    (row.get("excursion_status") or "").strip(),
                    (row.get("module_detected") or "").strip(),
                    (row.get("create_date") or "").strip()[:10],
                )
            )
            latest = latest[-5:]
    lines = [f"XRB excursion cases ({path.name}): {total} rows."]

    def top(counter: Counter[str], limit: int = 8) -> str:
        counter = Counter({name: count for name, count in counter.items() if name})
        return ", ".join(
            f"{name}={count}" for name, count in counter.most_common(limit)
        )

    for label, counter in (("Status", status), ("Type", kind), ("Top-module", module)):
        values = top(counter)
        if values:
            lines.append(f"{label}: {values}.")
    if latest:
        cases = "; ".join(
            f"{case_id} '{title}' {case_status} {case_module} {created}"
            for case_id, title, case_status, case_module, created in latest
        )
        lines.append(f"Latest 5 cases: {cases}.")
    return " ".join(lines)


def _xrb_text() -> str:
    """Return the cached XRB summary; start a background build when stale."""
    now = time.time()
    with _lock:
        text = str(_xrb["text"] or "")
        fresh = text and now - float(_xrb["at"] or 0.0) < XRB_TTL_SECONDS
        if fresh:
            return text
        if _xrb["building"] or _xrb["missing"]:
            return text
        _xrb["building"] = True

    def worker() -> None:
        try:
            summary = _build_xrb_summary()
        except Exception:
            logger.warning("XRB chat snapshot build failed", exc_info=True)
            summary = ""
        with _lock:
            _xrb["text"] = summary
            if summary or not _xrb_path().exists():
                _xrb["at"] = time.time()
            else:
                _xrb["at"] = time.time() - XRB_TTL_SECONDS + RETRY_AFTER_FAILURE_SECONDS
            _xrb["building"] = False
            _xrb["missing"] = not summary and not _xrb_path().exists()

    threading.Thread(target=worker, name="chat-xrb-warm", daemon=True).start()
    return text


def _light_snapshot() -> str:
    now = time.time()
    with _lock:
        if _light["text"] and now - float(_light["at"] or 0.0) < SNAPSHOT_TTL_SECONDS:
            return str(_light["text"])
    builders = (
        _modules_section,
        _solutions_section,
        _product_basis_section,
        _pdo_section,
        _action_items_section,
        _submissions_section,
    )
    parts = []
    for builder in builders:
        try:
            text = builder()
        except Exception:
            text = ""
        if text:
            parts.append(text)
    built = "\n".join(f"- {part}" for part in parts)
    with _lock:
        _light["text"] = built
        _light["at"] = now
    return built


def get_data_snapshot() -> str:
    """Return a compact, prompt-ready summary of the current project data."""
    try:
        light = _light_snapshot()
        xrb = _xrb_text()
    except Exception:
        return ""
    if not light and not xrb:
        return ""
    stamp = time.strftime("%Y-%m-%d %H:%M")
    text = f"Snapshot built {stamp} (values may lag a few minutes).\n{light}"
    if xrb:
        text += f"\n- {xrb}"
    elif _xrb_path().exists():
        text += "\n- XRB summary is still loading (large export file); it appears in a later reply."
    if len(text) > MAX_SNAPSHOT_CHARS:
        text = text[:MAX_SNAPSHOT_CHARS].rstrip() + " ...(truncated)"
    return text

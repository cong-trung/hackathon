import argparse
import csv
import hashlib
import io
import json
import re
import shutil
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from app.io.concurrency import atomic_write_bytes, locked_files

REQUIRED_FILES = (
    "QualityMatrix/PYPCS_Submissions.csv",
    "QualityMatrix/PYPCS_SubmissionCells.csv",
    "QualityMatrix/Settings/PYPCS_Modules.csv",
)
OPTIONAL_FILES = (
    "QualityMatrix/Settings/PYPCS_QuestionModuleMap.csv",
    "QualityMatrix/Settings/Operation_Process_Step.csv",
    "QualityMatrix/Settings/PYPCS_Questions.csv",
    "View2/PYPCS_ActionItems.csv",
    "View3/PYPCS_ProductActionDecisions.csv",
)


def read_csv(path):
    raw = path.read_bytes()
    text = raw.decode("utf-8-sig")
    sample = text[:8192]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t")
    except csv.Error:
        dialect = csv.excel
    reader = csv.DictReader(io.StringIO(text, newline=""), dialect=dialect)
    return raw, dialect, reader.fieldnames or [], list(reader)


def encode_csv(headers, rows, raw, dialect):
    line_ending = "\r\n" if b"\r\n" in raw else "\r" if b"\r" in raw else "\n"
    output = io.StringIO(newline="")
    writer = csv.DictWriter(
        output,
        fieldnames=headers,
        extrasaction="ignore",
        delimiter=dialect.delimiter,
        quotechar=dialect.quotechar,
        escapechar=dialect.escapechar,
        doublequote=dialect.doublequote,
        quoting=dialect.quoting,
        skipinitialspace=dialect.skipinitialspace,
        lineterminator=line_ending,
    )
    writer.writeheader()
    writer.writerows(rows)
    encoded = output.getvalue().encode("utf-8")
    if raw.startswith(b"\xef\xbb\xbf"):
        encoded = b"\xef\xbb\xbf" + encoded
    if raw and not raw.endswith((b"\n", b"\r")):
        encoded = encoded[: -len(line_ending.encode("ascii"))]
    return encoded


def canonicalizer(data_dir):
    _, _, headers, rows = read_csv(data_dir / "QualityMatrix/Settings/PYPCS_Modules.csv")
    if "module_key" not in headers:
        raise ValueError("PYPCS_Modules.csv is missing module_key")
    canonical = {
        row.get("module_key", "").strip().casefold(): row.get("module_key", "").strip()
        for row in rows
        if row.get("module_key", "").strip()
    }
    if not canonical:
        raise ValueError("PYPCS_Modules.csv contains no module keys")

    def normalize(value):
        trimmed = value.strip()
        return canonical.get(trimmed.casefold(), trimmed)

    return canonical, normalize


def canonical_group(value, normalize):
    trimmed = value.strip()
    return "HDMx" if trimmed.casefold() == "hdmx" else normalize(trimmed)


def normalize_list(value, normalize):
    values = []
    seen = set()
    for part in value.split("|"):
        item = normalize(part)
        if item and item not in seen:
            seen.add(item)
            values.append(item)
    return "|".join(values)


def normalize_applicability_tokens(value, canonical, normalize):
    if "|" not in value:
        token = value.strip()
        return normalize(value) if token.casefold() in canonical else value
    values = []
    seen_modules = set()
    for part in value.split("|"):
        token = part.strip()
        if token.casefold() in canonical:
            normalized = normalize(token)
            if normalized.casefold() in seen_modules:
                continue
            seen_modules.add(normalized.casefold())
            values.append(normalized)
        else:
            values.append(part)
    return "|".join(values)


def normalize_dependency(value, canonical):
    result = value
    for folded, key in sorted(canonical.items(), key=lambda item: len(item[1]), reverse=True):
        pattern = re.compile(
            rf"(?<![A-Za-z0-9_]){re.escape(key)}(?![A-Za-z0-9_])",
            re.IGNORECASE,
        )
        result = pattern.sub(lambda _match, replacement=key: replacement, result)
    return result


def normalize_history_json(value, normalize):
    try:
        payload = json.loads(value)
    except (TypeError, json.JSONDecodeError):
        return value

    def visit(item):
        if isinstance(item, dict):
            for key, nested in list(item.items()):
                folded = key.casefold()
                if folded == "module_key" and isinstance(nested, str):
                    item[key] = normalize(nested)
                elif folded == "selected_modules" and isinstance(nested, str):
                    item[key] = normalize_list(nested, normalize)
                else:
                    visit(nested)
        elif isinstance(item, list):
            for nested in item:
                visit(nested)

    visit(payload)
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))


def candidate_paths(data_dir):
    for relative in REQUIRED_FILES:
        yield data_dir / relative
    for relative in OPTIONAL_FILES:
        path = data_dir / relative
        if path.is_file():
            yield path
        else:
            print(f"skipped (missing): {relative}")
    history_dir = data_dir / "QualityMatrix/History"
    if history_dir.is_dir():
        yield from sorted(history_dir.rglob("*.csv"))
    else:
        print("skipped (missing): QualityMatrix/History")


def target_columns(relative_path, headers):
    targets = {}
    if relative_path.endswith("QualityMatrix/PYPCS_Submissions.csv"):
        if "selected_modules" in headers:
            targets["selected_modules"] = "list"
    elif relative_path.endswith("QualityMatrix/PYPCS_SubmissionCells.csv"):
        if "module_key" in headers:
            targets["module_key"] = "single"
    elif relative_path.endswith("QualityMatrix/Settings/PYPCS_QuestionModuleMap.csv"):
        if "module_key" in headers:
            targets["module_key"] = "single"
    elif relative_path.endswith("QualityMatrix/Settings/Operation_Process_Step.csv"):
        if "MODULE_KEY" in headers:
            targets["MODULE_KEY"] = "single"
    elif relative_path.endswith("QualityMatrix/Settings/PYPCS_Questions.csv"):
        if "dependency_rule" in headers:
            targets["dependency_rule"] = "dependency"
    elif relative_path.endswith("View2/PYPCS_ActionItems.csv"):
        for header in headers:
            folded = header.casefold()
            if "module" in folded or "applicability" in folded or folded.startswith("hdmx_"):
                targets[header] = "tokens"
    elif relative_path.endswith("View3/PYPCS_ProductActionDecisions.csv"):
        if "module_group" in headers:
            targets["module_group"] = "group"
        if "module_keys" in headers:
            targets["module_keys"] = "list"
    elif "/QualityMatrix/History/" in f"/{relative_path}/":
        for header in headers:
            folded = header.casefold()
            if folded == "module_key":
                targets[header] = "single"
            elif folded in {"selected_modules", "module_keys"}:
                targets[header] = "list"
            elif folded == "module_group":
                targets[header] = "group"
            elif folded.endswith("_json"):
                targets[header] = "history_json"
    return targets


def normalize_value(value, mode, canonical, normalize):
    if mode == "single":
        return normalize(value)
    if mode == "list":
        return normalize_list(value, normalize)
    if mode == "group":
        return canonical_group(value, normalize)
    if mode == "dependency":
        return normalize_dependency(value, canonical)
    if mode == "history_json":
        return normalize_history_json(value, normalize)
    if mode == "tokens":
        return normalize_applicability_tokens(value, canonical, normalize)
    return value


def load_plan(data_dir):
    canonical, normalize = canonicalizer(data_dir)
    changes = Counter()
    collisions = []
    outputs = {}

    for path in candidate_paths(data_dir):
        relative = path.relative_to(data_dir).as_posix()
        raw, dialect, headers, original_rows = read_csv(path)
        rows = [dict(row) for row in original_rows]
        targets = target_columns(relative, headers)

        if relative.endswith("QualityMatrix/PYPCS_SubmissionCells.csv") and "module_key" in targets:
            groups = defaultdict(list)
            for index, row in enumerate(rows):
                before = row.get("module_key", "")
                after = normalize(before)
                key_before = (
                    row.get("submission_id", ""),
                    row.get("question_id", ""),
                    before,
                )
                key_after = (
                    row.get("submission_id", ""),
                    row.get("question_id", ""),
                    after,
                )
                groups[key_after].append((index, key_before, before, after))
            for group in groups.values():
                distinct_before = {item[1] for item in group}
                if len(group) > 1 and len(distinct_before) > 1:
                    collisions.append((relative, tuple(item[0] + 2 for item in group)))
                    for index, _key, before, _after in group:
                        rows[index]["module_key"] = before

        for header, mode in targets.items():
            for index, row in enumerate(rows):
                before = row.get(header, "") or ""
                after = normalize_value(before, mode, canonical, normalize)
                if after != before:
                    row[header] = after
                    changes[(relative, header, before, after)] += 1

        if changes_for_file(changes, relative):
            outputs[path] = encode_csv(headers, rows, raw, dialect)

    return canonical, changes, collisions, outputs


def changes_for_file(changes, relative):
    return any(key[0] == relative for key in changes)


def inventory(data_dir):
    canonical, _normalize = canonicalizer(data_dir)
    counts = Counter()
    inventory_columns = set()

    def record(relative, column, value, mode):
        token = value.strip()
        if not token:
            return
        if mode == "group" and token.casefold() == "hdmx":
            counts[(relative, column, "HDMx (aggregate)")] += 1
            return
        if mode == "dependency":
            tokens = set(re.findall(r"(?i)\bHDMX_[A-Z0-9_]+\b", token))
            tokens.update(
                match.group(0)
                for key in canonical.values()
                for match in re.finditer(
                    rf"(?<![A-Za-z0-9_]){re.escape(key)}(?![A-Za-z0-9_])",
                    token,
                    re.IGNORECASE,
                )
            )
            for found in tokens:
                counts[(relative, column, found)] += 1
            return
        parts = re.split(r"[|,]", token) if mode in {"list", "tokens"} else [token]
        for part in parts:
            candidate = part.strip()
            if not candidate:
                continue
            if mode == "tokens" and candidate.casefold() not in canonical and not candidate.casefold().startswith("hdmx_"):
                continue
            counts[(relative, column, candidate)] += 1

    for path in candidate_paths(data_dir):
        relative = path.relative_to(data_dir).as_posix()
        _raw, _dialect, headers, rows = read_csv(path)
        targets = target_columns(relative, headers)
        for header, mode in targets.items():
            inventory_columns.add((relative, header))
            for row in rows:
                record(relative, header, row.get(header, "") or "", mode)
    return canonical, counts, inventory_columns


def print_inventory(canonical, counts, inventory_columns):
    print("Inventory (distinct spellings and occurrence counts)")
    by_column = defaultdict(list)
    for column in inventory_columns:
        by_column[column] = []
    for (relative, column, spelling), count in counts.items():
        by_column[(relative, column)].append((spelling, count))
    for (relative, column), items in sorted(by_column.items()):
        if not items:
            print(f"{relative} / {column}: (no module-key values)")
            continue
        details = []
        for spelling, count in sorted(items, key=lambda item: item[0].casefold()):
            folded = spelling.casefold()
            if spelling == "HDMx (aggregate)":
                flag = "aggregate"
            elif folded in canonical and canonical[folded] == spelling:
                flag = "canonical"
            elif folded in canonical:
                flag = f"FLAG -> {canonical[folded]}"
            else:
                flag = "FLAG: no case-insensitive canonical match"
            details.append(f"{spelling}={count} [{flag}]")
        print(f"{relative} / {column}: " + "; ".join(details))
    print(f"Inventory columns: {len(by_column)}; spellings: {sum(map(len, by_column.values()))}")


def print_changes(changes):
    print("Preview changes (file / column / from -> to / values)")
    if not changes:
        print("  none")
    for (relative, column, before, after), count in sorted(changes.items()):
        print(f"  {relative} / {column}: {before!r} -> {after!r} ({count})")
    print(f"Values to change: {sum(changes.values())}; files to change: {len({key[0] for key in changes})}")


def verify_layout(data_dir):
    if not data_dir.is_dir():
        raise ValueError(f"--data-dir is not a directory: {data_dir}")
    missing = [
        relative
        for relative in REQUIRED_FILES
        if not (data_dir / relative).is_file()
    ]
    if missing:
        raise ValueError(f"--data-dir is missing expected layout files: {missing}")


def apply_plan(data_dir):
    _canonical, _changes, _collisions, outputs = load_plan(data_dir)
    if not outputs:
        return None, [], 0
    with locked_files(*outputs):
        _canonical, changes, collisions, outputs = load_plan(data_dir)
        if not outputs:
            return None, collisions, len(collisions)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        backup_root = data_dir / "backups" / f"module_keys_{stamp}"
        backup_root.mkdir(parents=True, exist_ok=False)
        for path in outputs:
            backup_path = backup_root / path.relative_to(data_dir)
            backup_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, backup_path)
            if path.read_bytes() != backup_path.read_bytes():
                raise OSError(f"Backup verification failed for {path.relative_to(data_dir)}")
        for path, content in outputs.items():
            atomic_write_bytes(path, content)
    return backup_root, collisions, len(collisions)


def main():
    parser = argparse.ArgumentParser(description="Inventory and normalize canonical PYPCS module keys.")
    parser.add_argument("--data-dir", required=True, type=Path, help="Data root containing the expected CSV layout")
    parser.add_argument("--apply", action="store_true", help="Back up and apply changes; default is preview only")
    parser.add_argument("--inventory", action="store_true", help="Print distinct module-key spellings and counts")
    parser.add_argument("--strict", action="store_true", help="Exit nonzero if cell-key collisions are found")
    args = parser.parse_args()
    data_dir = args.data_dir.expanduser().resolve()
    try:
        verify_layout(data_dir)
        if args.inventory:
            canonical, counts, inventory_columns = inventory(data_dir)
            print_inventory(canonical, counts, inventory_columns)
            if not (data_dir / "QualityMatrix/History").is_dir():
                print("QualityMatrix/History: not present")
        _canonical, changes, collisions, _outputs = load_plan(data_dir)
        print_changes(changes)
        if collisions:
            print(f"Cell-key collisions left unchanged: {len(collisions)} group(s)")
            for relative, rows in collisions:
                print(f"  {relative}: {len(rows)} CSV rows involved")
        backup_root = None
        if args.apply:
            backup_root, collisions, _count = apply_plan(data_dir)
            if backup_root:
                print(f"Backups verified: {backup_root}")
            else:
                print("Apply result: no files needed changes")
            print(f"Apply result: {sum(changes.values())} values normalized")
        if args.strict and collisions:
            return 1
    except (OSError, ValueError, csv.Error) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
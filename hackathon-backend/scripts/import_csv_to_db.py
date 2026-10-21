import argparse
import json
import os
import sys
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.db.importer import ImportValidationError, run_import


def _print_report(report: dict, applied: bool) -> None:
    print("Source row counts:")
    for name, count in report["source_counts"].items():
        print(f"  {name}: {count}")
    print("Planned database row counts:")
    for name, count in report["table_counts"].items():
        print(f"  {name}: {count}")
    print("Database row counts before import:")
    for name, count in report.get("existing_db_counts", {}).items():
        print(f"  {name}: {count}")
    print("Validation findings:")
    print(f"  orphan cells: {len(report.get('orphan_cells', []))}")
    print(f"  invalid submission UUIDs: {len(report.get('invalid_submission_ids', []))}")
    duplicate_keys = {
        key: count for key, count in report.get("duplicate_keys", {}).items() if count
    }
    print(f"  duplicate keys: {json.dumps(duplicate_keys, sort_keys=True) if duplicate_keys else 'none'}")
    unknown_count = len(report.get("unknown_references_retained_as_text", []))
    print(f"  unknown references retained as text: {unknown_count}")
    print(
        "  duplicate answer-key groups retained losslessly: "
        f"{report.get('answer_collision_groups', 0)} groups, "
        f"{report.get('conflicting_answer_collision_groups', 0)} conflicting groups, "
        f"{report.get('losslessly_retained_answer_collision_rows', 0)} extra rows"
    )
    merge_counts = [item["submission_count"] for item in report.get("product_merge_groups", [])]
    print(f"  products merged by normalized key: {len(merge_counts)} groups; submission counts: {merge_counts}")
    if applied:
        print(f"  round-trip: {report['round_trip']}")
        print(f"  migration audit marker: {report['audit_marker']}")
        print("Verified database row counts:")
        for name, count in report["actual_db_counts"].items():
            print(f"  {name}: {count}")
    elif report.get("blocking_findings"):
        print(f"  blocking findings: {'; '.join(report['blocking_findings'])}")
    else:
        print("  blocking findings: none")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Preview or import CSV resources into the optional database"
    )
    parser.add_argument("--data-dir", type=Path, required=True)
    parser.add_argument("--database-url", default=os.getenv("DATABASE_URL"))
    parser.add_argument("--apply", action="store_true", help="write rows (default is preview only)")
    parser.add_argument("--replace", action="store_true", help="truncate target tables before import")
    args = parser.parse_args()
    if not args.database_url:
        parser.error("--database-url or DATABASE_URL is required")
    if args.replace and not args.apply:
        parser.error("--replace requires --apply")
    if not args.data_dir.is_dir():
        parser.error(f"data directory does not exist: {args.data_dir}")
    try:
        report = run_import(
            args.data_dir, args.database_url, apply=args.apply, replace=args.replace
        )
        _print_report(report, args.apply)
        return 0 if not report.get("blocking_findings") else 2
    except (ImportValidationError, ValueError) as exc:
        print(f"Import refused: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
import argparse
import csv
import io
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from app.io.concurrency import atomic_write_bytes

LEGACY_ROOT_FILES = (
    "PYPCS_Submissions.csv",
    "PYPCS_SubmissionCells.csv",
    "PYPCS_SubmissionAnswers.csv",
    "PYPCS_Modules.csv",
    "PYPCS_Questions.csv",
    "PYPCS_QuestionModuleMap.csv",
    "Operation_Process_Step.csv",
    "PYPCS_ActionItems.csv",
    "PYPCS_ProductActionMatrix.csv",
    "ProductBasisInfo_STHI.csv",
    "ProductBasicInfo_LCBI.csv",
    "ProductSolutionMatrix_STHI.csv",
    "ProductSolutionMatrix_LCBI.csv",
    "Solution.csv",
)
MOVE_MAP = {
    "PYPCS_Submissions.csv": "QualityMatrix/PYPCS_Submissions.csv",
    "PYPCS_Modules.csv": "QualityMatrix/Settings/PYPCS_Modules.csv",
    "PYPCS_Questions.csv": "QualityMatrix/Settings/PYPCS_Questions.csv",
    "PYPCS_QuestionModuleMap.csv": "QualityMatrix/Settings/PYPCS_QuestionModuleMap.csv",
    "Operation_Process_Step.csv": "QualityMatrix/Settings/Operation_Process_Step.csv",
    "PYPCS_ActionItems.csv": "View2/PYPCS_ActionItems.csv",
    "ProductBasisInfo_STHI.csv": "TI/ProductBasisInfo_STHI.csv",
    "ProductBasicInfo_LCBI.csv": "TI/ProductBasisInfo_LCBI.csv",
    "ProductSolutionMatrix_STHI.csv": "PdO/ProductSolutionMatrix_STHI.csv",
    "ProductSolutionMatrix_LCBI.csv": "PdO/ProductSolutionMatrix_LCBI.csv",
    "Solution.csv": "GL-MQR/Solution.csv",
}
CELL_HEADERS = [
    "submission_id",
    "question_id",
    "module_key",
    "role",
    "answer",
    "updated_at",
    "updated_by",
]
DECISION_FIELDS = ["status", "decision_state", "comment", "updated_by", "updated_at"]
DECISION_HEADERS = [
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


def read_csv(path):
    if not path.exists():
        return [], []
    with path.open("r", encoding="utf-8-sig", errors="replace", newline="") as source:
        reader = csv.DictReader(source)
        return reader.fieldnames or [], list(reader)


def encode_csv(headers, rows):
    output = io.StringIO(newline="")
    writer = csv.DictWriter(
        output,
        fieldnames=headers,
        extrasaction="ignore",
        lineterminator="\r\n",
    )
    writer.writeheader()
    writer.writerows(rows)
    return b"\xef\xbb\xbf" + output.getvalue().encode("utf-8")


def decision_rows(rows):
    converted = []
    for row in rows:
        decision = {field: row.get(field, "") or "" for field in DECISION_FIELDS}
        if not any(decision.values()):
            continue
        if not decision["decision_state"] and any(
            decision[field] for field in ("status", "comment")
        ):
            decision["decision_state"] = "final"
        converted.append(
            {
                "product_key": row.get("product_key", "") or "",
                "module_group": row.get("module_group", "") or "",
                "action_nbr": row.get("action_nbr", "") or "",
                **decision,
                "product_name": row.get("product_name", "") or "",
                "prodgroup3": row.get("prodgroup3", "") or "",
                "event_id": row.get("event_id", "") or "",
                "actionable_item": row.get("actionable_item", "") or "",
            }
        )
    return converted


def plan(data_dir):
    existing = {name for name in LEGACY_ROOT_FILES if (data_dir / name).is_file()}
    moves = []
    for source_name, target_name in MOVE_MAP.items():
        source = data_dir / source_name
        if source_name in existing:
            headers, rows = read_csv(source)
            moves.append((source, data_dir / target_name, source.read_bytes(), len(rows)))

    cell_source = data_dir / "PYPCS_SubmissionCells.csv"
    answer_source = data_dir / "PYPCS_SubmissionAnswers.csv"
    cell_rows = read_csv(cell_source)[1] if cell_source.is_file() else []
    answer_rows = read_csv(answer_source)[1] if answer_source.is_file() else []
    submission_rows = read_csv(data_dir / "PYPCS_Submissions.csv")[1]
    submitted_by = {
        row.get("submission_id", ""): row.get("submitted_by", "") or ""
        for row in submission_rows
    }
    converted_cells = [
        {
            "submission_id": row.get("submission_id", "") or "",
            "question_id": row.get("question_id", "") or "",
            "module_key": row.get("module_key", "") or "",
            "role": row.get("role", "") or "",
            "answer": row.get("answer", "") or "",
            "updated_at": row.get("updated_at", "") or "",
            "updated_by": row.get("updated_by", "") or row.get("submitted_by", "") or "",
        }
        for row in cell_rows
    ]
    converted_cells.extend(
        {
            "submission_id": row.get("submission_id", "") or "",
            "question_id": row.get("question_id", "") or "",
            "module_key": "",
            "role": row.get("role", "") or "",
            "answer": row.get("answer", "") or "",
            "updated_at": row.get("created_at", "") or "",
            "updated_by": submitted_by.get(row.get("submission_id", ""), ""),
        }
        for row in answer_rows
    )
    has_cells = "PYPCS_SubmissionCells.csv" in existing or "PYPCS_SubmissionAnswers.csv" in existing
    cell_target = data_dir / "QualityMatrix/PYPCS_SubmissionCells.csv"

    matrix_source = data_dir / "PYPCS_ProductActionMatrix.csv"
    matrix_rows = read_csv(matrix_source)[1] if matrix_source.is_file() else []
    converted_decisions = decision_rows(matrix_rows)
    decisions_target = data_dir / "View3/PYPCS_ProductActionDecisions.csv"

    return {
        "existing": existing,
        "moves": moves,
        "has_cells": has_cells,
        "cell_source": cell_source,
        "answer_source": answer_source,
        "converted_cells": converted_cells,
        "cell_target": cell_target,
        "matrix_source": matrix_source,
        "converted_decisions": converted_decisions,
        "decisions_target": decisions_target,
        "matrix_count": len(matrix_rows),
        "has_matrix": matrix_source.is_file(),
        "cell_count": len(cell_rows),
        "answer_count": len(answer_rows),
    }


def print_preview(data_dir, migration):
    for source, target, _, row_count in migration["moves"]:
        print(f"MOVE {source.name} ({row_count} rows) -> {target.relative_to(data_dir)} ({row_count} rows; byte-identical)")
    if migration["has_cells"]:
        print(
            "CONVERT PYPCS_SubmissionCells.csv "
            f"({migration['cell_count']} rows) + PYPCS_SubmissionAnswers.csv "
            f"({migration['answer_count']} rows) -> "
            f"{migration['cell_target'].relative_to(data_dir)} "
            f"({len(migration['converted_cells'])} rows; 7 columns)"
        )
    if "PYPCS_ProductActionMatrix.csv" in migration["existing"]:
        print(
            "CONVERT PYPCS_ProductActionMatrix.csv "
            f"({migration['matrix_count']} rows) -> "
            f"{migration['decisions_target'].relative_to(data_dir)} "
            f"({len(migration['converted_decisions'])} decision rows; 12 columns)"
        )
    unknown = sorted(
        path.name
        for path in data_dir.iterdir()
        if path.is_file() and path.name not in LEGACY_ROOT_FILES
    )
    print("UNKNOWN ROOT FILES LEFT UNTOUCHED:")
    for name in unknown:
        print(f"  {name}")
    if not migration["existing"]:
        print("No legacy root files found.")


def verify_csv(path, headers, expected_count, expected_bytes):
    actual_headers, rows = read_csv(path)
    if actual_headers != headers or len(rows) != expected_count:
        raise RuntimeError(f"CSV verification failed for {path}")
    if path.read_bytes() != expected_bytes:
        raise RuntimeError(f"Byte verification failed for {path}")


def apply_migration(data_dir, backup_dir, migration):
    legacy_sources = [data_dir / name for name in LEGACY_ROOT_FILES if name in migration["existing"]]

    conflicts = []
    for source_name, target_name in MOVE_MAP.items():
        source = data_dir / source_name
        target = data_dir / target_name
        if source.is_file() and target.exists():
            conflicts.append(f"{source_name} -> {target.relative_to(data_dir)}")
    for source in (migration["cell_source"], migration["answer_source"]):
        if source.is_file() and migration["cell_target"].exists():
            conflicts.append(f"{source.name} -> {migration['cell_target'].relative_to(data_dir)}")
    if migration["matrix_source"].is_file() and migration["decisions_target"].exists():
        conflicts.append(
            f"{migration['matrix_source'].name} -> "
            f"{migration['decisions_target'].relative_to(data_dir)}"
        )
    if conflicts:
        raise RuntimeError("Target already exists alongside legacy source: " + "; ".join(conflicts))

    if backup_dir.exists():
        raise RuntimeError(f"Backup directory already exists: {backup_dir}")
    backup_dir.mkdir(parents=True)
    backup_sizes = {}
    for source in legacy_sources:
        backup = backup_dir / source.name
        shutil.copy2(source, backup)
        backup_sizes[source.name] = source.stat().st_size
        if (
            backup.stat().st_size != backup_sizes[source.name]
            or backup.read_bytes() != source.read_bytes()
        ):
            raise RuntimeError(f"Backup verification failed for {source.name}")

    for _, target, data, _ in migration["moves"]:
        atomic_write_bytes(target, data)
        if target.read_bytes() != data:
            raise RuntimeError(f"Moved-file byte verification failed for {target}")

    if migration["has_cells"]:
        cell_bytes = encode_csv(CELL_HEADERS, migration["converted_cells"])
        atomic_write_bytes(migration["cell_target"], cell_bytes)
        verify_csv(
            migration["cell_target"],
            CELL_HEADERS,
            len(migration["converted_cells"]),
            cell_bytes,
        )

    if "PYPCS_ProductActionMatrix.csv" in migration["existing"]:
        decisions_bytes = encode_csv(DECISION_HEADERS, migration["converted_decisions"])
        atomic_write_bytes(migration["decisions_target"], decisions_bytes)
        verify_csv(
            migration["decisions_target"],
            DECISION_HEADERS,
            len(migration["converted_decisions"]),
            decisions_bytes,
        )

    for source in legacy_sources:
        source.unlink()

    print(f"Migration complete for {data_dir}.")
    print(f"Backup: {backup_dir}")
    print(f"Moved files: {len(migration['moves'])}")
    print(f"Cells written: {len(migration['converted_cells']) if migration['has_cells'] else 0}")
    print(f"Decisions written: {len(migration['converted_decisions']) if migration['has_matrix'] else 0}")
    print(f"Legacy root files removed: {len(legacy_sources)}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", required=True, type=Path)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--backup-dir", type=Path)
    args = parser.parse_args()
    data_dir = args.data_dir.expanduser().resolve()
    if not data_dir.is_dir():
        parser.error(f"--data-dir is not a directory: {data_dir}")

    migration = plan(data_dir)
    if not args.apply:
        print_preview(data_dir, migration)
        return 0

    new_layout_present = any(
        (data_dir / target).exists()
        for target in [*MOVE_MAP.values(), "QualityMatrix/PYPCS_SubmissionCells.csv", "View3/PYPCS_ProductActionDecisions.csv"]
    )
    if not migration["existing"] and new_layout_present:
        print(f"Data layout already migrated: {data_dir}")
        return 0
    if not migration["existing"]:
        print(f"No legacy root files found in {data_dir}; nothing to migrate.")
        return 0

    backup_dir = args.backup_dir.expanduser().resolve() if args.backup_dir else (
        data_dir / f"_migration_backup_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}"
    )
    apply_migration(data_dir, backup_dir, migration)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except RuntimeError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(1)
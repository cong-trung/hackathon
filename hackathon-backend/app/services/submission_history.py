"""Shared PYPCS submission status helpers and the submission history writer.

Lives outside the routers so both the PYPCS router and the option review service can use it
without a circular import.
"""

import json
import uuid
from datetime import datetime, timezone

from app.io.csv_excel import value_to_str
from app.io.generic_csv import (
    read_generic_csv_headers,
    read_optional_csv,
    split_pipe_value,
    write_rows_to_csv,
)
from app.services.pypcs_service import canonical_module_key

PYPCS_SUBMISSION_HISTORY_FILE = "QualityMatrix/History/PYPCS_SubmissionHistory.csv"
PYPCS_SUBMISSION_HISTORY_HEADERS = [
    "history_id",
    "submission_id",
    "action",
    "changed_at",
    "changed_by",
    "reason",
    "previous_submission_json",
    "previous_cells_json",
]


def action_item_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace(
        "+00:00", "Z"
    )


def normalize_status(value: str) -> str:
    # Older rows predate the status column; treat missing status as already-final.
    status = value_to_str(value).lower()
    return status if status in {"draft", "waiting_me", "final"} else "final"


def append_submission_history(
    submission: dict[str, str],
    cells: list[dict[str, str]],
    action: str,
    changed_by: str,
    reason: str,
) -> None:
    history_rows = read_optional_csv(PYPCS_SUBMISSION_HISTORY_FILE)
    headers = read_generic_csv_headers(PYPCS_SUBMISSION_HISTORY_FILE)
    if not headers:
        headers = PYPCS_SUBMISSION_HISTORY_HEADERS
    canonical_submission = dict(submission)
    if "selected_modules" in canonical_submission:
        canonical_submission["selected_modules"] = "|".join(
            canonical_module_key(module)
            for module in split_pipe_value(canonical_submission["selected_modules"])
        )
    canonical_cells = [
        {**cell, "module_key": canonical_module_key(cell.get("module_key", ""))}
        for cell in cells
    ]
    history_rows.append(
        {
            "history_id": str(uuid.uuid4()),
            "submission_id": value_to_str(submission.get("submission_id", "")),
            "action": action,
            "changed_at": action_item_timestamp(),
            "changed_by": changed_by,
            "reason": reason,
            "previous_submission_json": json.dumps(
                canonical_submission, ensure_ascii=False, separators=(",", ":")
            ),
            "previous_cells_json": json.dumps(
                canonical_cells, ensure_ascii=False, separators=(",", ":")
            ),
        }
    )
    write_rows_to_csv(PYPCS_SUBMISSION_HISTORY_FILE, history_rows, headers)

"""Repository functions for PYPCS submissions, cells, and history."""

from typing import Any

from app.io.generic_csv import (
    delete_rows_from_csv,
    read_generic_csv_headers,
    read_optional_csv,
    upsert_rows_to_csv,
    write_rows_to_csv,
)
from app.repositories import Resource


CELL_HEADERS = [
    "submission_id",
    "question_id",
    "module_key",
    "role",
    "answer",
    "updated_at",
    "updated_by",
]
HISTORY_HEADERS = [
    "history_id",
    "submission_id",
    "action",
    "changed_at",
    "changed_by",
    "reason",
    "previous_submission_json",
    "previous_cells_json",
]


def list_submissions() -> list[dict[str, str]]:
    return read_optional_csv(Resource.SUBMISSIONS.value)


def list_cells() -> list[dict[str, str]]:
    return read_optional_csv(Resource.CELLS.value)


def list_history() -> list[dict[str, str]]:
    return read_optional_csv(Resource.HISTORY.value)


def save_submission(
    submission_id: str,
    row: dict[str, Any],
    headers: list[str],
) -> None:
    upsert_rows_to_csv(
        Resource.SUBMISSIONS.value,
        "submission_id",
        submission_id,
        [row],
        headers,
    )


def save_cells(rows: list[dict[str, Any]], headers: list[str] | None = None) -> None:
    write_rows_to_csv(Resource.CELLS.value, rows, headers or CELL_HEADERS)


def append_history(row: dict[str, Any]) -> None:
    rows = list_history()
    headers = read_generic_csv_headers(Resource.HISTORY.value) or HISTORY_HEADERS
    rows.append(row)
    write_rows_to_csv(Resource.HISTORY.value, rows, headers)


def delete_submission(submission_id: str) -> int:
    return delete_rows_from_csv(Resource.SUBMISSIONS.value, "submission_id", submission_id)


def delete_cells(submission_id: str) -> int:
    return delete_rows_from_csv(Resource.CELLS.value, "submission_id", submission_id)
"""Repository functions for View 3 product-action decisions."""

from typing import Any

from app.io.generic_csv import read_generic_csv, write_rows_to_csv
from app.repositories import Resource


HEADERS = [
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


def list_decisions() -> list[dict[str, str]]:
    return read_generic_csv(Resource.DECISIONS.value)


def save_decisions(rows: list[dict[str, Any]]) -> None:
    write_rows_to_csv(Resource.DECISIONS.value, rows, HEADERS)
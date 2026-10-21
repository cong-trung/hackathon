"""Repository functions for View 2 action-item rows."""

from typing import Any

from app.io.generic_csv import read_generic_csv, write_rows_to_csv
from app.repositories import Resource


HEADERS = [
    "nbr",
    "event_id",
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


def list_action_items() -> list[dict[str, str]]:
    return read_generic_csv(Resource.ACTION_ITEMS.value)


def save_action_items(rows: list[dict[str, Any]]) -> None:
    write_rows_to_csv(Resource.ACTION_ITEMS.value, rows, HEADERS)
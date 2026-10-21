"""Repository functions for the global solution catalog."""

from typing import Any

from app.repositories import Resource
from app.repositories import config_csv


def resource_for(_config: dict[str, Any] | None = None) -> Resource:
    return Resource.SOLUTIONS


def list_solutions(
    config: dict[str, Any],
) -> tuple[list[str], list[dict[str, str]]]:
    return config_csv.read_rows(config)


def save_solutions(
    config: dict[str, Any], rows: list[dict[str, Any]], headers: list[str]
) -> None:
    config_csv.save_rows(config, rows, headers)


def solution_file_metadata(config: dict[str, Any]) -> dict[str, Any]:
    metadata = config_csv.file_metadata(config)
    metadata.pop("file_is_excel_format")
    return metadata
"""Shared adapter for config-driven CSV/XLSX files."""

from typing import Any

from app.io.csv_excel import get_path, is_excel_file, read_data, write_data


def read_rows(config: dict[str, Any]) -> tuple[list[str], list[dict[str, str]]]:
    return read_data(config)


def save_rows(
    config: dict[str, Any], rows: list[dict[str, Any]], headers: list[str]
) -> None:
    write_data(config, rows, headers)


def file_metadata(config: dict[str, Any]) -> dict[str, Any]:
    path = get_path(config)
    headers, rows = read_data(config)
    return {
        "file": str(path),
        "file_is_excel_format": is_excel_file(path),
        "row_count": len(rows),
        "column_count": len(headers),
    }
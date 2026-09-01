"""Generic (schema-less) CSV helpers used by the PYPCS matrix subsystem."""

from typing import Any, List

import polars as pl
from fastapi import HTTPException

from app.config import DATA_DIR
from app.io.csv_excel import value_to_str


def split_options(value: Any) -> List[str]:
    """Splits a string by the '|' delimiter and returns a list of cleaned, non-empty strings."""
    text = value_to_str(value)
    if not text:
        return []
    return [item.strip() for item in text.split("|") if item.strip()]


def split_pipe_value(value: Any) -> List[str]:
    """Splits a string by the '|' delimiter and returns a list of cleaned, non-empty strings."""
    text = value_to_str(value)
    if not text:
        return []
    return [item.strip() for item in text.split("|") if item.strip()]


def safe_int(value: Any, default: int = 0) -> int:
    text = value_to_str(value)

    if not text:
        return default

    try:
        return int(float(text))
    except Exception:
        return default


def yn_to_bool(value: Any) -> bool:
    return value_to_str(value).upper() in {"Y", "YES", "TRUE", "1"}


def read_generic_csv(file_name: str) -> list[dict[str, str]]:
    path = DATA_DIR / file_name

    if not path.exists():
        return []

    try:
        df = pl.read_csv(
            path,
            encoding="utf8-lossy",
            infer_schema_length=0,
            ignore_errors=True,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to read {file_name}: {exc}",
        )

    rows = []

    for row in df.to_dicts():
        rows.append({key: value_to_str(value) for key, value in row.items()})

    return rows


def read_optional_csv(file_name: str) -> list[dict[str, str]]:
    path = DATA_DIR / file_name

    if not path.exists():
        return []

    return read_generic_csv(file_name)


def write_rows_to_csv(
    file_name: str,
    rows: list[dict[str, Any]],
    headers: list[str],
) -> None:
    path = DATA_DIR / file_name
    path.parent.mkdir(parents=True, exist_ok=True)

    normalized_rows = []

    for row in rows:
        normalized_rows.append(
            {
                header: value_to_str(row.get(header, ""))
                for header in headers
            }
        )

    df = pl.DataFrame(
        {
            header: [row.get(header, "") for row in normalized_rows]
            for header in headers
        },
        schema={header: pl.Utf8 for header in headers},
    )

    path.write_bytes(b"\xef\xbb\xbf" + df.write_csv().encode("utf-8"))


def append_rows_to_csv(
    file_name: str,
    new_rows: list[dict[str, Any]],
    headers: list[str],
) -> None:
    existing_rows = []

    path = DATA_DIR / file_name

    if path.exists():
        existing_rows = read_generic_csv(file_name)

    all_rows = existing_rows + new_rows

    write_rows_to_csv(file_name, all_rows, headers)


def upsert_rows_to_csv(
    file_name: str,
    key_field: str,
    key_value: str,
    new_rows: list[dict[str, Any]],
    headers: list[str],
) -> None:
    """Replace all rows matching key_field == key_value with new_rows (drops, then re-appends)."""
    existing_rows = read_generic_csv(file_name)
    target = value_to_str(key_value)

    remaining_rows = [
        row for row in existing_rows
        if value_to_str(row.get(key_field, "")) != target
    ]

    write_rows_to_csv(file_name, remaining_rows + new_rows, headers)


def delete_rows_from_csv(file_name: str, key_field: str, key_value: str) -> int:
    """Remove all rows matching key_field == key_value. Returns the number of rows removed."""
    path = DATA_DIR / file_name

    if not path.exists():
        return 0

    df = pl.read_csv(
        path,
        encoding="utf8-lossy",
        infer_schema_length=0,
        ignore_errors=True,
    )
    headers = df.columns
    target = value_to_str(key_value)

    rows = [
        {key: value_to_str(value) for key, value in row.items()}
        for row in df.to_dicts()
    ]
    remaining_rows = [
        row for row in rows if value_to_str(row.get(key_field, "")) != target
    ]

    deleted_count = len(rows) - len(remaining_rows)

    if deleted_count:
        write_rows_to_csv(file_name, remaining_rows, headers)

    return deleted_count



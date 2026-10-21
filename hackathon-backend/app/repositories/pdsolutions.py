"""Repository functions for module-specific product-solution matrices."""

from typing import Any

from app.repositories import Resource
from app.repositories import config_csv


def resource_for(config: dict[str, Any]) -> Resource:
    return Resource(config["file"])


def list_pdsolutions(
    config: dict[str, Any],
) -> tuple[list[str], list[dict[str, str]]]:
    return config_csv.read_rows(config)


def save_pdsolutions(
    config: dict[str, Any], rows: list[dict[str, Any]], headers: list[str]
) -> None:
    config_csv.save_rows(config, rows, headers)
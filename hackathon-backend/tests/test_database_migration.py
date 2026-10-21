from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import URL, create_engine, inspect, select
from sqlalchemy.orm import Session

from app.db import models
from app.db.importer import apply_import, preview_import
from conftest import assert_test_database_url


BACKEND_ROOT = Path(__file__).resolve().parents[1]


def _upgrade(database_path: Path) -> str:
    url = URL.create("sqlite", database=str(database_path))
    config = Config(str(BACKEND_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_ROOT / "alembic"))
    config.set_main_option("sqlalchemy.url", str(url).replace("%", "%%"))
    command.upgrade(config, "head")
    return str(url)


def test_database_engine_guard_rejects_non_isolated_urls():
    import pytest

    with pytest.raises(AssertionError, match="Test database must be SQLite under pytest tmp"):
        assert_test_database_url("postgresql+psycopg://invalid")
    with pytest.raises(AssertionError, match="Test database must be SQLite under pytest tmp"):
        assert_test_database_url("sqlite:///outside-test.sqlite")


def test_alembic_preview_is_read_only_and_counts_match(api_client, tmp_path):
    _client, data_dir = api_client
    database_url = _upgrade(tmp_path / "empty.sqlite")
    engine = create_engine(database_url)

    report, _plan = preview_import(data_dir, engine)

    assert report["source_counts"]["submissions"] > 0
    assert report["table_counts"]["submission"] == report["source_counts"]["submissions"]
    assert report["table_counts"]["product_basis_sthi"] == report["source_counts"]["basis_sthi"]
    assert report["table_counts"]["submission_answer"] + report["table_counts"]["submission_answer_collision"] == report["source_counts"]["answers"]
    assert not report["blocking_findings"]
    with Session(engine) as session:
        assert session.scalar(select(models.Submission).limit(1)) is None
        assert session.scalar(select(models.AuditLog).limit(1)) is None
    assert "submission_answer" in inspect(engine).get_table_names()


def test_import_round_trip_and_replace_are_idempotent(api_client, tmp_path):
    _client, data_dir = api_client
    database_url = _upgrade(tmp_path / "import.sqlite")
    engine = create_engine(database_url)

    preview, _plan = preview_import(data_dir, engine)
    expected_collision_count = preview["table_counts"]["submission_answer_collision"]
    first = apply_import(data_dir, engine)
    second = apply_import(data_dir, engine, replace=True)

    assert first["round_trip"] == second["round_trip"] == "passed"
    assert first["actual_db_counts"] == second["actual_db_counts"]
    assert first["actual_db_counts"]["submission_answer_collision"] == expected_collision_count
    assert (
        first["actual_db_counts"]["submission_answer"]
        + first["actual_db_counts"]["submission_answer_collision"]
        == preview["source_counts"]["answers"]
    )
    assert second["actual_db_counts"]["audit_log"] == 1
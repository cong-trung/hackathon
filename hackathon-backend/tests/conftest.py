import importlib
import os
import shutil
import sys
import tempfile
from pathlib import Path

import pytest
import sqlalchemy
from fastapi.testclient import TestClient
from sqlalchemy.engine import make_url


BACKEND_ROOT = Path(__file__).resolve().parents[1]
FIXTURE_ROOT = Path(__file__).parent / "fixtures"
FIXTURE_DATA_DIR = FIXTURE_ROOT / "data"
XLSX_FIXTURE_DIR = FIXTURE_ROOT / "xlsx"
TEST_EDIT_PIN = "test-pin-0000"

for key, value in {
    "DATABASE_URL": "",
    "QUALITY_MATRIX_DB_FEATURES": "",
    "PROXY_SHARED_SECRET": "",
    "QUALITY_MATRIX_EDIT_PIN": "",
    "QUALITY_MATRIX_DATA_DIR": str(FIXTURE_DATA_DIR),
    "QUALITY_MATRIX_SKIP_ENV_FILES": "1",
}.items():
    os.environ[key] = value


def assert_test_database_url(url):
    parsed_url = make_url(url)
    database_path = Path(parsed_url.database or "").resolve()
    if (
        parsed_url.drivername != "sqlite"
        or not database_path.is_relative_to(Path(tempfile.gettempdir()).resolve())
        or not any(part.casefold().startswith("pytest-of-") for part in database_path.parts)
    ):
        raise AssertionError(f"Test database must be SQLite under pytest tmp: {parsed_url.drivername}")


_original_create_engine = sqlalchemy.create_engine


def _guarded_create_engine(url, *args, **kwargs):
    assert_test_database_url(url)
    return _original_create_engine(url, *args, **kwargs)


sqlalchemy.create_engine = _guarded_create_engine
sqlalchemy.engine.create.create_engine = _guarded_create_engine


def _copy_test_data(tmp_path):
    data_dir = tmp_path / "data"
    for source in FIXTURE_DATA_DIR.rglob("*"):
        relative = source.relative_to(FIXTURE_DATA_DIR)
        target = data_dir / relative
        if source.is_dir():
            target.mkdir(parents=True, exist_ok=True)
        elif source.is_file():
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
    return data_dir


def _prepare_settings_database(data_dir, tmp_path, monkeypatch):
    database_path = tmp_path / "settings.sqlite"
    database_url = f"sqlite:///{database_path.as_posix()}"
    monkeypatch.setenv("DATABASE_URL", database_url)
    monkeypatch.setenv("QUALITY_MATRIX_DB_FEATURES", "settings")

    from alembic import command
    from alembic.config import Config
    from sqlalchemy import create_engine
    from app.db.importer import apply_import

    config = Config(str(BACKEND_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_ROOT / "alembic"))
    config.set_main_option("sqlalchemy.url", database_url.replace("%", "%%"))
    command.upgrade(config, "head")
    engine = create_engine(database_url)
    apply_import(data_dir, engine)
    engine.dispose()


def _configured_api_client(data_dir, tmp_path, monkeypatch, proxy_shared_secret, db_settings):
    monkeypatch.setenv("QUALITY_MATRIX_DATA_DIR", str(data_dir.resolve()))
    monkeypatch.setenv("QUALITY_MATRIX_EDIT_PIN", TEST_EDIT_PIN)
    monkeypatch.setenv("PROXY_SHARED_SECRET", proxy_shared_secret)
    if db_settings:
        _prepare_settings_database(data_dir, tmp_path, monkeypatch)
    else:
        monkeypatch.setenv("DATABASE_URL", "")
        monkeypatch.setenv("QUALITY_MATRIX_DB_FEATURES", "")
    for name in tuple(sys.modules):
        if name == "app" or name.startswith("app."):
            del sys.modules[name]

    app_main = importlib.import_module("app.main")
    app_config = importlib.import_module("app.config")
    assert app_config.DATA_DIR.resolve() == data_dir.resolve()
    assert tmp_path.resolve() in app_config.DATA_DIR.resolve().parents

    with TestClient(app_main.app) as client:
        yield client, data_dir


@pytest.fixture
def proxy_shared_secret():
    return ""


@pytest.fixture
def api_client(tmp_path, monkeypatch, proxy_shared_secret):
    data_dir = _copy_test_data(tmp_path)
    yield from _configured_api_client(
        data_dir, tmp_path, monkeypatch, proxy_shared_secret, db_settings=False
    )


@pytest.fixture
def settings_db_api_client(tmp_path, monkeypatch, proxy_shared_secret):
    data_dir = _copy_test_data(tmp_path)
    yield from _configured_api_client(
        data_dir, tmp_path, monkeypatch, proxy_shared_secret, db_settings=True
    )


@pytest.fixture(params=["csv", "db_settings"])
def characterization_api_client(tmp_path, monkeypatch, proxy_shared_secret, request):
    data_dir = _copy_test_data(tmp_path)
    yield from _configured_api_client(
        data_dir,
        tmp_path,
        monkeypatch,
        proxy_shared_secret,
        db_settings=request.param == "db_settings",
    )
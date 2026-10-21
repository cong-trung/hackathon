import importlib
import shutil
import sys
from pathlib import Path

import pytest
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from conftest import XLSX_FIXTURE_DIR


@pytest.fixture
def proxy_shared_secret():
    return "test-proxy-secret"


def test_settings_feature_fails_fast_without_database_url(monkeypatch):
    monkeypatch.setenv("QUALITY_MATRIX_DB_FEATURES", "settings")
    monkeypatch.setenv("DATABASE_URL", "")
    for name in tuple(__import__("sys").modules):
        if name == "app" or name.startswith("app."):
            del __import__("sys").modules[name]

    app_main = importlib.import_module("app.main")

    with pytest.raises(RuntimeError, match="DATABASE_URL is not set"):
        app_main.validate_database_feature_configuration()


def test_settings_feature_fails_fast_when_database_is_not_migrated(monkeypatch, tmp_path):
    monkeypatch.setenv("QUALITY_MATRIX_DB_FEATURES", "settings")
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{(tmp_path / 'unmigrated.sqlite').as_posix()}")
    for name in tuple(sys.modules):
        if name == "app" or name.startswith("app."):
            del sys.modules[name]

    app_main = importlib.import_module("app.main")

    with pytest.raises(RuntimeError, match="requires Alembic head"):
        app_main.validate_database_feature_configuration()


def test_question_write_audits_actor_and_fallback(settings_db_api_client):
    client, _data_dir = settings_db_api_client
    response = client.patch(
        "/pypcs/questions/product_name",
        json={"description": "Audit actor description"},
        headers={
            "x-proxy-secret": "test-proxy-secret",
            "x-user-wwid": "10000002",
            "x-user-name": "Cutover Check",
            "x-user-email": "cutover-check@example.test",
            "x-user-source": "manual",
        },
    )
    assert response.status_code == 200

    from app.db import models
    from app.db.session import get_engine

    with Session(get_engine()) as session:
        actor_audit = session.scalars(
            select(models.AuditLog).where(
                models.AuditLog.entity_type == "question",
                models.AuditLog.entity_id == "product_name",
                models.AuditLog.field == "description",
                models.AuditLog.new_value == "Audit actor description",
            )
        ).one()
        user = session.get(models.AppUser, "10000002")
        assert (actor_audit.actor_wwid, actor_audit.actor_name, actor_audit.actor_email) == (
            "10000002", "Cutover Check", "cutover-check@example.test"
        )
        assert user is not None
        assert user.first_seen_at <= user.last_seen_at

    from app.repositories import Resource, transaction
    from app.repositories import settings as settings_repository

    rows = settings_repository.list_questions()
    target = next(row for row in rows if row["question_id"] == "product_name")
    target["description"] = "Fallback label description"
    with transaction(Resource.QUESTIONS):
        settings_repository.save_questions(
            rows,
            list(rows[0]),
            actor_label="settings batch",
        )
    with Session(get_engine()) as session:
        fallback_audit = session.scalars(
            select(models.AuditLog).where(
                models.AuditLog.entity_id == "product_name",
                models.AuditLog.field == "description",
                models.AuditLog.new_value == "Fallback label description",
            )
        ).one()
        assert fallback_audit.actor_label == "settings batch"
        assert fallback_audit.actor_wwid == ""


def test_settings_transaction_rollback_does_not_write_csv(settings_db_api_client):
    _client, data_dir = settings_db_api_client
    from app.repositories import Resource, transaction
    from app.repositories import settings as settings_repository

    path = data_dir / Resource.QUESTIONS.value
    before = path.read_bytes()
    rows = settings_repository.list_questions()
    target = next(row for row in rows if row["question_id"] == "product_name")
    target["description"] = "Rolled back description"
    with pytest.raises(RuntimeError, match="rollback probe"):
        with transaction(Resource.QUESTIONS):
            settings_repository.save_questions(rows, list(rows[0]))
            raise RuntimeError("rollback probe")
    assert path.read_bytes() == before
    assert next(
        row for row in settings_repository.list_questions()
        if row["question_id"] == "product_name"
    )["description"] != "Rolled back description"


def test_disabling_feature_reads_committed_csv_export(settings_db_api_client, monkeypatch):
    client, _data_dir = settings_db_api_client
    response = client.patch(
        "/pypcs/questions/product_name",
        json={"description": "Committed before rollback switch"},
        headers={
            "x-proxy-secret": "test-proxy-secret",
            "x-user-wwid": "10000002",
            "x-user-name": "Cutover Check",
            "x-user-email": "cutover-check@example.test",
            "x-user-source": "manual",
        },
    )
    assert response.status_code == 200
    app_config = importlib.import_module("app.config")
    monkeypatch.setattr(app_config, "QUALITY_MATRIX_DB_FEATURES", frozenset())

    from app.repositories import settings as settings_repository

    question = next(
        row for row in settings_repository.list_questions()
        if row["question_id"] == "product_name"
    )
    assert question["description"] == "Committed before rollback switch"


def test_xlsx_import_updates_db_settings_and_is_idempotent(settings_db_api_client):
    _client, data_dir = settings_db_api_client
    source_xlsx = next(XLSX_FIXTURE_DIR.glob("*.xlsx"))
    local_source = data_dir / "QualityMatrix" / "Source" / source_xlsx.name
    local_source.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source_xlsx, local_source)

    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
    sys.modules.pop("import_quality_matrix_xlsx", None)
    import import_quality_matrix_xlsx as xlsx_importer

    initial_plan = xlsx_importer.create_plan(data_dir, local_source)
    from app.db import models
    from app.db.session import get_engine

    product_groups = [
        item["prodgroup3"] for item in initial_plan["source_rows"]
        if item["prodgroup3"]
    ]
    operation_candidates = [
        (module, operation)
        for item in initial_plan["source_rows"]
        for module, operations in item["values"]["operation"].items()
        for operation in operations.split("|")
        if operation
    ]
    with Session(get_engine()) as session:
        question = session.get(models.Question, "prodgroup3")
        options = [part.strip() for part in question.options.split("|") if part.strip()]
        missing_group = next(group for group in product_groups if group in options)
        options.remove(missing_group)
        question.options = "|".join(options)
        session.execute(delete(models.QuestionOption).where(
            models.QuestionOption.question_id == "prodgroup3",
            models.QuestionOption.option_value == missing_group,
        ))
        catalog = {
            (row.module_key.casefold(), row.operation.casefold()): row
            for row in session.scalars(select(models.Operation))
        }
        missing_operation = next(
            pair for pair in operation_candidates
            if (pair[0].casefold(), pair[1].casefold()) in catalog
        )
        session.delete(catalog[(missing_operation[0].casefold(), missing_operation[1].casefold())])
        session.commit()

    first_plan = xlsx_importer.create_plan(data_dir, local_source)
    from app.config import database_feature_enabled
    from app.repositories import settings as settings_repository
    db_options = next(
        row["options"] for row in settings_repository.list_questions()
        if row["question_id"] == "prodgroup3"
    )
    assert missing_group in first_plan["new_pg_options"], (
        missing_group, first_plan["new_pg_options"], database_feature_enabled("settings"),
        missing_group in db_options.split("|"),
    )
    assert any(
        row["MODULE_KEY"].casefold() == missing_operation[0].casefold()
        and row["OPERATION"].casefold() == missing_operation[1].casefold()
        for row in first_plan["new_operation_rows"]
    )
    xlsx_importer.apply_plan(first_plan)
    second_plan = xlsx_importer.create_plan(data_dir, local_source)
    assert second_plan["new_pg_options"] == []
    assert second_plan["new_operation_rows"] == []

    with Session(get_engine()) as session:
        import_audits = session.scalars(
            select(models.AuditLog).where(models.AuditLog.source == "import")
        ).all()
        assert any(row.entity_type == "operation" for row in import_audits)
        assert any(row.entity_type == "question_option" for row in import_audits)
        assert session.scalar(
            select(models.Question.question_id).where(
                models.Question.question_id == "prodgroup3",
                models.Question.options.contains("Other"),
            )
        ) == "prodgroup3"

    assert missing_group in (data_dir / "QualityMatrix/Settings/PYPCS_Questions.csv").read_text(
        encoding="utf-8-sig"
    )
    assert missing_operation[1] in (data_dir / "QualityMatrix/Settings/Operation_Process_Step.csv").read_text(
        encoding="utf-8-sig"
    )


def test_xlsx_import_database_failure_does_not_write_csv(settings_db_api_client, monkeypatch):
    _client, data_dir = settings_db_api_client
    source_xlsx = next(XLSX_FIXTURE_DIR.glob("*.xlsx"))
    local_source = data_dir / "QualityMatrix" / "Source" / source_xlsx.name
    local_source.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source_xlsx, local_source)

    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
    sys.modules.pop("import_quality_matrix_xlsx", None)
    import import_quality_matrix_xlsx as xlsx_importer

    from app.repositories import settings as settings_repository

    original_create_plan = xlsx_importer.create_plan

    def changed_plan(data_dir, xlsx_path):
        plan = original_create_plan(data_dir, xlsx_path)
        first_header = plan["originals"][0][1][0]
        plan["submissions"][0][first_header] = "rollback probe"
        return plan

    monkeypatch.setattr(xlsx_importer, "create_plan", changed_plan)

    def fail_operation_write(*_args, **_kwargs):
        raise RuntimeError("database rollback probe")

    monkeypatch.setattr(
        settings_repository,
        "add_operation_rows",
        fail_operation_write,
    )
    before = {
        path: path.read_bytes()
        for path in (
            data_dir / "QualityMatrix/PYPCS_Submissions.csv",
            data_dir / "QualityMatrix/PYPCS_SubmissionCells.csv",
            data_dir / "QualityMatrix/Settings/PYPCS_Questions.csv",
            data_dir / "QualityMatrix/Settings/Operation_Process_Step.csv",
        )
    }

    with pytest.raises(RuntimeError, match="database rollback probe"):
        xlsx_importer.apply_plan(original_create_plan(data_dir, local_source))

    changed_paths = [
        path.relative_to(data_dir).as_posix()
        for path, original in before.items()
        if path.read_bytes() != original
    ]
    assert changed_paths == []
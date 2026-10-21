"""CSV-backed repositories and feature-level transaction boundaries."""

from contextlib import contextmanager
from enum import Enum
import logging
from typing import Iterator

from app.config import DATA_DIR, database_feature_enabled
from app.io.concurrency import apply_deferred_writes, defer_atomic_writes, locked_files

logger = logging.getLogger(__name__)


class Resource(str, Enum):
    MODULES = "QualityMatrix/Settings/PYPCS_Modules.csv"
    QUESTIONS = "QualityMatrix/Settings/PYPCS_Questions.csv"
    QUESTION_MODULE_MAP = "QualityMatrix/Settings/PYPCS_QuestionModuleMap.csv"
    OPERATION_CATALOG = "QualityMatrix/Settings/Operation_Process_Step.csv"
    SUBMISSIONS = "QualityMatrix/PYPCS_Submissions.csv"
    CELLS = "QualityMatrix/PYPCS_SubmissionCells.csv"
    HISTORY = "QualityMatrix/History/PYPCS_SubmissionHistory.csv"
    ACTION_ITEMS = "View2/PYPCS_ActionItems.csv"
    DECISIONS = "View3/PYPCS_ProductActionDecisions.csv"
    PRODUCT_BASIS_STHI = "TI/ProductBasisInfo_STHI.csv"
    PRODUCT_BASIS_LCBI = "TI/ProductBasisInfo_LCBI.csv"
    SOLUTIONS = "GL-MQR/Solution.csv"
    PDSOLUTIONS_STHI = "PdO/ProductSolutionMatrix_STHI.csv"
    PDSOLUTIONS_LCBI = "PdO/ProductSolutionMatrix_LCBI.csv"


@contextmanager
def transaction(*resources: Resource, export_dir=None) -> Iterator[None]:
    """Lock resources and commit settings DB work before applying staged CSV writes."""
    with locked_files(*(resource.value for resource in resources)):
        settings_resources = {
            Resource.MODULES,
            Resource.QUESTIONS,
            Resource.QUESTION_MODULE_MAP,
            Resource.OPERATION_CATALOG,
        }
        if not database_feature_enabled("settings") or not settings_resources.intersection(resources):
            yield
            return

        from app.db.session import (
            get_session_factory,
            reset_active_settings_changes,
            reset_active_settings_session,
            set_active_settings_changes,
            set_active_settings_session,
        )

        factory = get_session_factory()
        if factory is None:
            raise RuntimeError(
                "Settings database mode requires DATABASE_URL to be set."
            )
        changed: set[str] = set()
        with factory() as session:
            with defer_atomic_writes() as pending:
                session_token = set_active_settings_session(session)
                changes_token = set_active_settings_changes(changed)
                try:
                    with session.begin():
                        yield
                finally:
                    reset_active_settings_changes(changes_token)
                    reset_active_settings_session(session_token)

            # Commit settings before applying staged CSV writes.
            apply_deferred_writes(pending)
            if changed:
                from app.repositories import settings

                try:
                    settings.export_settings_to_csv(
                        sorted(changed), data_dir=export_dir or DATA_DIR
                    )
                except Exception:
                    logger.warning("Settings CSV write-through export failed.")


def resource_fingerprint(*resources: Resource) -> tuple[tuple[str, int | None, int | None], ...]:
    fingerprint = []
    for resource in resources:
        path = DATA_DIR / resource.value
        try:
            stat = path.stat()
        except FileNotFoundError:
            fingerprint.append((str(path.resolve()), None, None))
        else:
            fingerprint.append((str(path.resolve()), stat.st_mtime_ns, stat.st_size))
    return tuple(fingerprint)
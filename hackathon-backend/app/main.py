"""FastAPI app factory: wires CORS and all routers together."""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import inspect

from app.auth import get_actor
from app.config import (
    ALLOWED_ORIGINS,
    BACKEND_ROOT,
    DATA_DIR,
    PROXY_SHARED_SECRET,
    QUALITY_MATRIX_DB_FEATURES,
)
from app.db.session import database_url, get_engine

LEGACY_ROOT_DATA_FILES = (
    "PYPCS_Submissions.csv",
    "PYPCS_SubmissionCells.csv",
    "PYPCS_SubmissionAnswers.csv",
    "PYPCS_Modules.csv",
    "PYPCS_Questions.csv",
    "PYPCS_QuestionModuleMap.csv",
    "Operation_Process_Step.csv",
    "PYPCS_ActionItems.csv",
    "PYPCS_ProductActionMatrix.csv",
    "ProductBasisInfo_STHI.csv",
    "ProductBasicInfo_LCBI.csv",
    "ProductSolutionMatrix_STHI.csv",
    "ProductSolutionMatrix_LCBI.csv",
    "Solution.csv",
)

legacy_files = [name for name in LEGACY_ROOT_DATA_FILES if (DATA_DIR / name).exists()]
if legacy_files:
    migration_command = (
        f'.\\.venv\\Scripts\\python.exe scripts\\migrate_data_layout.py '
        f'--data-dir "{DATA_DIR}" --apply'
    )
    raise RuntimeError(
        f"Legacy data files found directly in DATA_DIR={DATA_DIR}: "
        f"{', '.join(legacy_files)}. Run from hackathon-backend: {migration_command}"
    )

from app.routers import (
    chat,
    health,
    pdsolutions,
    product_action_matrix,
    product_basis,
    pypcs,
    solutions,
)

app = FastAPI(
    title="Quality Matrix Multi-Module API",
    version="1.0.0",
    description="No-auth GitHub-ready API for STHI, LCBI product basic info and module solutions.",
)


def validate_database_feature_configuration() -> None:
    supported = {"settings"}
    unsupported = QUALITY_MATRIX_DB_FEATURES - supported
    if unsupported:
        raise RuntimeError(
            "Unsupported QUALITY_MATRIX_DB_FEATURES: "
            + ", ".join(sorted(unsupported))
        )
    if not QUALITY_MATRIX_DB_FEATURES:
        return
    url = database_url()
    if not url:
        raise RuntimeError(
            "QUALITY_MATRIX_DB_FEATURES enables settings, but DATABASE_URL is not set."
        )

    try:
        engine = get_engine(url)
        with engine.connect() as connection:
            current = MigrationContext.configure(connection).get_current_revision()
            config = Config(str(BACKEND_ROOT / "alembic.ini"))
            config.set_main_option(
                "script_location", str(BACKEND_ROOT / "alembic")
            )
            head = ScriptDirectory.from_config(config).get_current_head()
            if current != head:
                raise RuntimeError(
                    "Database feature settings requires Alembic head "
                    f"{head}; database revision is {current or 'unversioned'}."
                )
            inspect(connection).get_table_names()
    except RuntimeError:
        raise
    except Exception as exc:
        raise RuntimeError(
            "QUALITY_MATRIX_DB_FEATURES enables settings, but the database "
            "is unreachable or unavailable. Check DATABASE_URL and database status."
        ) from exc


@app.on_event("startup")
def validate_database_features_on_startup() -> None:
    validate_database_feature_configuration()

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def require_proxy_actor(request: Request, call_next):
    if PROXY_SHARED_SECRET and request.url.path not in {
        "/health",
        "/docs",
        "/openapi.json",
        "/redoc",
    } and not request.url.path.startswith("/docs/"):
        actor = get_actor(request)
        if actor is None:
            return JSONResponse(
                status_code=401,
                content={"detail": {"code": "unauthenticated"}},
            )
        request.state.actor = actor

    return await call_next(request)

app.include_router(health.router)
app.include_router(product_basis.router)
app.include_router(solutions.router)
app.include_router(pdsolutions.router)
app.include_router(pypcs.router)
app.include_router(product_action_matrix.router)
app.include_router(chat.router)

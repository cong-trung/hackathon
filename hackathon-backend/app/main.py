"""FastAPI app factory: wires CORS and all routers together."""

import logging
import os
import sys

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import (
    ALLOWED_ORIGINS,
    DATA_DIR,
    QUALITY_MATRIX_MAIL_TRANSPORT,
    QUALITY_MATRIX_SMTP_HOST,
    QUALITY_MATRIX_SMTP_PORT,
)
from app.auth import bootstrap_admin, record_audit

# Uvicorn configures only its own loggers, so give the app package a handler.
_app_logger = logging.getLogger("app")
if not _app_logger.handlers:
    _log_level = getattr(logging, os.getenv("QUALITY_MATRIX_LOG_LEVEL", "INFO").strip().upper(), None)
    _handler = logging.StreamHandler()
    _handler.setFormatter(logging.Formatter("%(levelname)s:     %(name)s - %(message)s"))
    _app_logger.addHandler(_handler)
    _app_logger.setLevel(_log_level if isinstance(_log_level, int) else logging.INFO)

_mail_logger = logging.getLogger(__name__)
_log_only_transport = (
    QUALITY_MATRIX_MAIL_TRANSPORT == "log"
    or (QUALITY_MATRIX_MAIL_TRANSPORT == "smtp" and not QUALITY_MATRIX_SMTP_HOST)
    or (QUALITY_MATRIX_MAIL_TRANSPORT == "outlook" and sys.platform != "win32")
)
if _log_only_transport:
    _mail_logger.warning(
        "Mail transport is '%s': final-submit emails will NOT be sent. Set QUALITY_MATRIX_SMTP_HOST "
        "(and QUALITY_MATRIX_SMTP_PORT/STARTTLS/USERNAME/PASSWORD if needed) in .env.production.",
        QUALITY_MATRIX_MAIL_TRANSPORT,
    )
else:
    _mail_logger.info(
        "Mail transport is '%s' (SMTP host:port %s:%s).",
        QUALITY_MATRIX_MAIL_TRANSPORT,
        QUALITY_MATRIX_SMTP_HOST or "-",
        QUALITY_MATRIX_SMTP_PORT,
    )

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
    auth,
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
    description="Local-account API for STHI, LCBI product basic info and module solutions.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def initialize_auth_store():
    bootstrap_admin()


@app.middleware("http")
async def audit_authenticated_mutations(request, call_next):
    response = await call_next(request)
    user = getattr(request.state, "auth_user", None)
    if (
        user
        and request.method in {"POST", "PUT", "PATCH", "DELETE"}
        and request.url.path not in {"/auth/login", "/auth/request-account", "/auth/change-password"}
    ):
        record_audit(user["username"], request.method, request.url.path, response.status_code)
    return response

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(product_basis.router)
app.include_router(solutions.router)
app.include_router(pdsolutions.router)
app.include_router(pypcs.router)
app.include_router(product_action_matrix.router)
app.include_router(chat.router)

"""FastAPI app factory: wires CORS and all routers together."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import ALLOWED_ORIGINS, DATA_DIR

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

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(product_basis.router)
app.include_router(solutions.router)
app.include_router(pdsolutions.router)
app.include_router(pypcs.router)
app.include_router(product_action_matrix.router)
app.include_router(chat.router)

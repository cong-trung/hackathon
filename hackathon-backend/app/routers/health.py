"""Service health check and module listing."""

from fastapi import APIRouter

from app.repositories import product_basis as product_basis_repository
from app.repositories import solutions as solutions_repository
from app.schema_config import MODULE_CONFIG, SOLUTION_CONFIG

router = APIRouter()


@router.get("/health")
def health():
    result = {"status": "ok", "modules": {}}
    for module, config in MODULE_CONFIG.items():
        result["modules"][module] = product_basis_repository.product_basis_file_metadata(config)
    result["solutions"] = solutions_repository.solution_file_metadata(SOLUTION_CONFIG)
    return result


@router.get("/modules")
def modules():
    return {"items": list(MODULE_CONFIG.keys())}

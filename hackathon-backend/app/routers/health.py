"""Service health check and module listing."""

from fastapi import APIRouter

from app.io.csv_excel import is_excel_file, get_path, read_data
from app.schema_config import MODULE_CONFIG, SOLUTION_CONFIG

router = APIRouter()


@router.get("/health")
def health():
    result = {"status": "ok", "modules": {}}
    for module, config in MODULE_CONFIG.items():
        headers, rows = read_data(config)
        result["modules"][module] = {
            "file": str(get_path(config)),
            "file_is_excel_format": is_excel_file(get_path(config)),
            "row_count": len(rows),
            "column_count": len(headers),
        }
    headers, rows = read_data(SOLUTION_CONFIG)
    result["solutions"] = {
        "file": str(get_path(SOLUTION_CONFIG)),
        "row_count": len(rows),
        "column_count": len(headers),
    }
    return result


@router.get("/modules")
def modules():
    return {"items": list(MODULE_CONFIG.keys())}

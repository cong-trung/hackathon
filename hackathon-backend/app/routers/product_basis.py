"""CRUD endpoints for per-module product-basis rows (STHI/LCBI)."""

from fastapi import APIRouter, HTTPException, Query

from app.io.csv_excel import find_by_key, read_data, value_to_str, write_data
from app.models.common import FlexiblePayload, ProductBasisPayload
from app.schema_config import field_schema, get_module_config

router = APIRouter()


@router.get("/schema/product-basis/{module}")
def schema_product_basis(module: str):
    return field_schema(get_module_config(module))


@router.get("/product-basis/{module}")
def list_product_basis(
    module: str,
    q: str | None = None,
    limit: int = Query(200, ge=1, le=5000),
    offset: int = Query(0, ge=0),
):
    config = get_module_config(module)
    _headers, rows = read_data(config)
    if q:
        qn = q.lower()
        rows = [row for row in rows if qn in " ".join(row.values()).lower()]
    rows = sorted(rows, key=lambda r: r.get("prodgroup3", "").lower())
    return {
        "module": module.upper(),
        "count": len(rows[offset : offset + limit]),
        "total": len(rows),
        "items": rows[offset : offset + limit],
    }


@router.get("/product-basis/{module}/{prodgroup3}")
def get_product_basis(module: str, prodgroup3: str):
    config = get_module_config(module)
    _headers, rows = read_data(config)
    idx = find_by_key(rows, "prodgroup3", prodgroup3)
    if idx < 0:
        raise HTTPException(status_code=404, detail="Product not found")
    return rows[idx]


@router.post("/product-basis/{module}")
def create_product_basis(module: str, payload: ProductBasisPayload):
    config = get_module_config(module)
    headers, rows = read_data(config)
    data = payload.model_dump()
    if find_by_key(rows, "prodgroup3", str(data.get("prodgroup3", ""))) >= 0:
        raise HTTPException(status_code=409, detail="ProdGroup3 already exists")
    for key in config["fields"]:
        data.setdefault(key, "")
    data["module"] = module.upper()
    rows.append({k: value_to_str(v) for k, v in data.items()})
    write_data(config, rows, headers)
    return {"message": "created", "item": data}


@router.put("/product-basis/{module}/{prodgroup3}")
def update_product_basis(module: str, prodgroup3: str, payload: ProductBasisPayload):
    config = get_module_config(module)
    headers, rows = read_data(config)
    idx = find_by_key(rows, "prodgroup3", prodgroup3)
    if idx < 0:
        raise HTTPException(status_code=404, detail="Product not found")
    data = payload.model_dump()
    rows[idx] = {**rows[idx], **{k: value_to_str(v) for k, v in data.items()}}
    write_data(config, rows, headers)
    return {"message": "updated", "item": rows[idx]}


@router.patch("/product-basis/{module}/{prodgroup3}")
def patch_product_basis(module: str, prodgroup3: str, payload: FlexiblePayload):
    config = get_module_config(module)
    headers, rows = read_data(config)
    idx = find_by_key(rows, "prodgroup3", prodgroup3)
    if idx < 0:
        raise HTTPException(status_code=404, detail="Product not found")
    data = payload.model_dump(exclude_none=True)
    rows[idx] = {**rows[idx], **{k: value_to_str(v) for k, v in data.items()}}
    write_data(config, rows, headers)
    return {"message": "patched", "item": rows[idx]}


@router.delete("/product-basis/{module}/{prodgroup3}")
def delete_product_basis(module: str, prodgroup3: str):
    config = get_module_config(module)
    headers, rows = read_data(config)
    idx = find_by_key(rows, "prodgroup3", prodgroup3)
    if idx < 0:
        raise HTTPException(status_code=404, detail="Product not found")
    removed = rows.pop(idx)
    write_data(config, rows, headers)
    return {"message": "deleted", "item": removed}

"""CRUD endpoints for the global Solution list."""

from fastapi import APIRouter, Query, HTTPException

from app.io.csv_excel import find_by_key, read_data, value_to_str, write_data
from app.models.common import FlexiblePayload, SolutionPayload
from app.schema_config import SOLUTION_CONFIG, field_schema

router = APIRouter()


@router.get("/schema/solution")
def schema_solution():
    return field_schema(SOLUTION_CONFIG)


@router.get("/solutions")
def list_solutions(
    module: str | None = None,
    q: str | None = None,
    limit: int = Query(500, ge=1, le=5000),
    offset: int = Query(0, ge=0),
):
    _headers, rows = read_data(SOLUTION_CONFIG)
    if module:
        rows = [row for row in rows if row.get("module", "").upper() == module.upper()]
    if q:
        qn = q.lower()
        rows = [row for row in rows if qn in " ".join(row.values()).lower()]
    return {
        "count": len(rows[offset : offset + limit]),
        "total": len(rows),
        "items": rows[offset : offset + limit],
    }


@router.post("/solutions")
def create_solution(payload: SolutionPayload):
    headers, rows = read_data(SOLUTION_CONFIG)
    data = payload.model_dump()
    existing_ids = [
        int(row["id"]) for row in rows if value_to_str(row.get("id", "")).isdigit()
    ]
    data["id"] = str(max(existing_ids, default=0) + 1)
    rows.append({k: value_to_str(v) for k, v in data.items()})
    write_data(SOLUTION_CONFIG, rows, headers)
    return {"message": "created", "item": data}


@router.patch("/solutions/{solution_id}")
def patch_solution(solution_id: str, payload: FlexiblePayload):
    headers, rows = read_data(SOLUTION_CONFIG)
    idx = find_by_key(rows, "id", solution_id)
    if idx < 0:
        raise HTTPException(status_code=404, detail="Solution not found")
    data = payload.model_dump(exclude_none=True)
    rows[idx] = {**rows[idx], **{k: value_to_str(v) for k, v in data.items()}}
    write_data(SOLUTION_CONFIG, rows, headers)
    return {"message": "patched", "item": rows[idx]}


@router.delete("/solutions/{solution_id}")
def delete_solution(solution_id: str):
    headers, rows = read_data(SOLUTION_CONFIG)
    idx = find_by_key(rows, "id", solution_id)
    if idx < 0:
        raise HTTPException(status_code=404, detail="Solution not found")
    removed = rows.pop(idx)
    write_data(SOLUTION_CONFIG, rows, headers)
    return {"message": "deleted", "item": removed}

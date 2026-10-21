"""Product <-> Solution matrix (status/note per product-solution pair) endpoints."""

from fastapi import APIRouter

from app.models.common import PdSolutionItem
from app.repositories import pdsolutions as pdsolutions_repository
from app.repositories import solutions as solutions_repository
from app.repositories import transaction
from app.schema_config import SOLUTION_CONFIG, get_module_solution_config

router = APIRouter()


@router.get("/pdsolutions/{module}")
def list_pdsolutions(module: str, q: str | None = None):
    config = get_module_solution_config(module)
    _headers, rows = pdsolutions_repository.list_pdsolutions(config)

    _sol_headers, sol_rows = solutions_repository.list_solutions(SOLUTION_CONFIG)
    sol_map = {r["id"]: r.get("solution", "") for r in sol_rows}

    if q:
        qn = q.lower()
        rows = [row for row in rows if qn in " ".join(row.values()).lower()]

    grouped: dict[str, list[dict]] = {}
    for row in rows:
        pdid = row.get("pdid", "")
        sid = row.get("solutionid", "")
        grouped.setdefault(pdid, []).append(
            {
                "solutionid": sid,
                "solution": sol_map.get(sid, ""),
                "status": row.get("status", ""),
                "note": row.get("note", ""),
            }
        )

    for items in grouped.values():
        items.sort(
            key=lambda x: (
                int(x["solutionid"]) if x["solutionid"].isdigit() else x["solutionid"]
            )
        )

    return {"module": module.upper(), "total": len(grouped), "items": grouped}


@router.post("/pdsolutions/{module}")
def update_pdsolutions(module: str, payload: list[PdSolutionItem]):
    config = get_module_solution_config(module)
    with transaction(pdsolutions_repository.resource_for(config)):
        headers, rows = pdsolutions_repository.list_pdsolutions(config)
        for item in payload:
            idx = next(
                (
                    i
                    for i, r in enumerate(rows)
                    if r.get("pdid", "").lower() == item.pdid.lower()
                    and r.get("solutionid", "").lower() == item.solutionid.lower()
                ),
                -1,
            )
            if idx >= 0:
                rows[idx]["status"] = item.status
                rows[idx]["note"] = item.note
            else:
                rows.append(
                    {
                        "pdid": item.pdid,
                        "solutionid": item.solutionid,
                        "status": item.status,
                        "note": item.note,
                    }
                )
        pdsolutions_repository.save_pdsolutions(config, rows, headers)
    return {"message": "updated", "module": module.upper(), "count": len(payload)}

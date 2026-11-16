"""Admin-only endpoints for the field-level change log."""

from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse

from app.auth import require_admin
from app.services.change_log import (
    ENTITY_TYPES,
    ChangeFilters,
    filter_changes,
    iter_change_rows_csv,
    read_change_log,
)

router = APIRouter()


def _parse_date(value: str | None, field: str) -> str:
    if not value:
        return ""
    try:
        return date.fromisoformat(value.strip()).isoformat()
    except ValueError:
        raise HTTPException(
            status_code=422,
            detail={"field": field, "code": "invalid_date", "message": "Use YYYY-MM-DD."},
        ) from None


def _filters(
    entity_type: str | None,
    entity_id: str | None,
    username: str | None,
    q: str | None,
    date_from: str | None,
    date_to: str | None,
) -> ChangeFilters:
    entity = (entity_type or "").strip()
    if entity and entity not in ENTITY_TYPES:
        raise HTTPException(
            status_code=422,
            detail={
                "field": "entity_type",
                "code": "invalid_entity_type",
                "message": f"Values must be one of: {', '.join(ENTITY_TYPES)}.",
            },
        )
    return ChangeFilters(
        entity_type=entity,
        entity_id=entity_id or "",
        username=username or "",
        q=q or "",
        date_from=_parse_date(date_from, "from"),
        date_to=_parse_date(date_to, "to"),
    )


@router.get("/admin/changes")
def list_admin_changes(
    entity_type: str | None = Query(default=None),
    entity_id: str | None = Query(default=None, max_length=200),
    username: str | None = Query(default=None, max_length=128),
    q: str | None = Query(default=None, max_length=200),
    date_from: str | None = Query(default=None, alias="from"),
    date_to: str | None = Query(default=None, alias="to"),
    limit: int = Query(default=200, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    _admin: dict = Depends(require_admin),
):
    filters = _filters(entity_type, entity_id, username, q, date_from, date_to)
    rows = filter_changes(read_change_log(), filters)
    return {"items": rows[offset : offset + limit], "total": len(rows)}


@router.get("/admin/changes/export.csv")
def export_admin_changes(
    entity_type: str | None = Query(default=None),
    entity_id: str | None = Query(default=None, max_length=200),
    username: str | None = Query(default=None, max_length=128),
    q: str | None = Query(default=None, max_length=200),
    date_from: str | None = Query(default=None, alias="from"),
    date_to: str | None = Query(default=None, alias="to"),
    _admin: dict = Depends(require_admin),
):
    filters = _filters(entity_type, entity_id, username, q, date_from, date_to)
    rows = filter_changes(read_change_log(), filters)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d")
    return StreamingResponse(
        iter_change_rows_csv(rows),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="change-log-{stamp}.csv"',
            "Cache-Control": "no-store",
        },
    )

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.session import get_db
from backend.schemas import track_out
from backend.services import search as search_service

router = APIRouter(prefix="/api/search", tags=["search"])

MAX_LIMIT = 50
ALLOWED = ("all", *search_service.SOURCES)


@router.get("")
async def search(
    q: str = "",
    source: str = "all",
    limit: int = Query(25, ge=1, le=MAX_LIMIT),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    q = q.strip()
    if not q:
        return {"tracks": [], "errors": []}
    if source not in ALLOWED:
        raise HTTPException(400, f"지원하지 않는 source: {source}")

    tracks, errors = await search_service.search(db, q, source, limit)

    if not tracks and errors:
        raise HTTPException(502, {"error": errors[0]["error"], "errors": errors})

    return {"tracks": [track_out(t) for t in tracks], "errors": errors}

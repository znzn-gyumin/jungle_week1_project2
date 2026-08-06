from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.session import get_db
from backend.schemas import album_out, track_out
from backend.services import search as search_service

router = APIRouter(prefix="/api/search", tags=["search"])

MAX_LIMIT = 50
ALLOWED_SOURCES = ("all", *search_service.SOURCES)
ALLOWED_TYPES = ("track", "album")


@router.get("")
async def search(
    q: str = "",
    source: str = "all",
    type: str = "track",
    limit: int = Query(25, ge=1, le=MAX_LIMIT),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    q = q.strip()
    if type not in ALLOWED_TYPES:
        raise HTTPException(400, f"지원하지 않는 type: {type}")
    if source not in ALLOWED_SOURCES:
        raise HTTPException(400, f"지원하지 않는 source: {source}")
    if not q:
        return {"tracks": [], "albums": [], "errors": []}

    if type == "album":
        albums, errors = await search_service.search_albums(db, q, source, limit)
        if not albums and errors:
            raise HTTPException(502, {"error": errors[0]["error"], "errors": errors})
        return {
            "tracks": [],
            "albums": [album_out(a) for a in albums],
            "errors": errors,
        }

    tracks, errors = await search_service.search(db, q, source, limit)
    if not tracks and errors:
        raise HTTPException(502, {"error": errors[0]["error"], "errors": errors})
    return {"tracks": [track_out(t) for t in tracks], "albums": [], "errors": errors}

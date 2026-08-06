from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db import repository
from backend.db.session import get_db
from backend.models import Track
from backend.models.enums import SourceType
from backend.schemas import track_out
from backend.services.search import SOURCES

router = APIRouter(prefix="/api/tracks", tags=["tracks"])

MAX_LIMIT = 50


@router.get("")
async def list_tracks(
    q: str | None = None,
    source: str | None = None,
    limit: int = Query(25, ge=1, le=MAX_LIMIT),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    if source is not None and source not in SOURCES:
        raise HTTPException(400, f"지원하지 않는 source: {source}")
    rows = await repository.list_tracks(
        db,
        query=q,
        source=SourceType(source) if source else None,
        limit=limit,
    )
    return {"tracks": [track_out(t) for t in rows]}


@router.get("/{track_id}")
async def get_track(
    track_id: int, db: AsyncSession = Depends(get_db)
) -> dict[str, Any]:
    track = await db.get(Track, track_id)
    if track is None:
        raise HTTPException(404, "곡을 찾을 수 없습니다")
    return track_out(track)

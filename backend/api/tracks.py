from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api import DEFAULT_LIMIT, MAX_LIMIT
from backend.db import repository
from backend.db.session import get_db
from backend.models.enums import SourceType
from backend.schemas import TrackListResponse, TrackOut
from backend.services.search import SOURCES

router = APIRouter(prefix="/api/tracks", tags=["tracks"])


@router.get("", response_model=TrackListResponse)
async def list_tracks(
    q: str | None = None,
    source: str | None = None,
    limit: int = Query(DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    db: AsyncSession = Depends(get_db),
) -> TrackListResponse:
    if source is not None and source not in SOURCES:
        raise HTTPException(400, f"지원하지 않는 source: {source}")
    rows = await repository.list_tracks(
        db,
        query=q,
        source=SourceType(source) if source else None,
        limit=limit,
    )
    return TrackListResponse(tracks=[TrackOut.model_validate(t) for t in rows])


@router.get("/{track_id}", response_model=TrackOut)
async def get_track(
    track_id: int, db: AsyncSession = Depends(get_db)
) -> TrackOut:
    track = await repository.get_track(db, track_id)
    if track is None:
        raise HTTPException(404, "곡을 찾을 수 없습니다")
    return TrackOut.model_validate(track)

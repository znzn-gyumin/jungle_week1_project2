from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api import DEFAULT_LIMIT, MAX_LIMIT
from backend.db import repository
from backend.db.session import get_db
from backend.models.enums import SourceType
from backend.schemas import TrackListResponse, TrackOut
from backend.services import search as search_service
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


# /{track_id} 보다 먼저 걸어야 한다. 아래에 두면 "top" 이 int 로 파싱돼 422 가 난다.
@router.get("/top", response_model=TrackListResponse)
async def top_tracks(
    limit: int = Query(20, ge=1, le=MAX_LIMIT),
    db: AsyncSession = Depends(get_db),
) -> TrackListResponse:
    tracks, errors = await search_service.top_tracks(db, limit)
    if not tracks:
        error = errors[0]["error"] if errors else "차트를 불러오지 못했다"
        raise HTTPException(502, {"error": error, "errors": errors})
    return TrackListResponse(tracks=[TrackOut.model_validate(t) for t in tracks])


@router.get("/{track_id}", response_model=TrackOut)
async def get_track(
    track_id: int, db: AsyncSession = Depends(get_db)
) -> TrackOut:
    track = await repository.get_track(db, track_id)
    if track is None:
        raise HTTPException(404, "곡을 찾을 수 없습니다")
    return TrackOut.model_validate(track)

from fastapi import APIRouter, Query
from fastapi.exceptions import HTTPException
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.accounts import CurrentUser, DbSession
from backend.models import Play, Track, User
from backend.routers.limits import MAX_LIST_LIMIT
from backend.schemas import TrackListResponse, TrackOut

router = APIRouter(prefix="/api/plays", tags=["plays"])

DEFAULT_RECENT_LIMIT = 20


@router.get("", response_model=TrackListResponse)
async def list_mine(
    limit: int = Query(DEFAULT_RECENT_LIMIT, ge=1, le=MAX_LIST_LIMIT),
    user: User = CurrentUser,
    db: AsyncSession = DbSession,
) -> TrackListResponse:
    """최근 재생. ix_plays_user_id_played_at 를 탄다."""
    rows = await db.execute(
        select(Track)
        .join(Play, Play.track_id == Track.id)
        .options(selectinload(Track.album))
        .where(Play.user_id == user.id)
        .order_by(Play.played_at.desc(), Play.id.desc())
        .limit(limit)
    )
    return TrackListResponse(tracks=[TrackOut.model_validate(t) for t in rows.scalars()])


@router.post("/{track_id}")
async def record(
    track_id: int, user: User = CurrentUser, db: AsyncSession = DbSession
) -> dict[str, bool]:
    if await db.get(Track, track_id) is None:
        raise HTTPException(404, "곡을 찾을 수 없습니다")
    stmt = (
        insert(Play)
        .values(user_id=user.id, track_id=track_id)
        .on_conflict_do_update(
            index_elements=[Play.user_id, Play.track_id],
            set_={"played_at": func.now()},
        )
    )
    await db.execute(stmt)
    await db.commit()
    return {"saved": True}

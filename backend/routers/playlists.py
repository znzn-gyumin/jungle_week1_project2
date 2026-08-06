from typing import Any

from fastapi import APIRouter, Query
from fastapi.exceptions import HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, literal, select
from sqlalchemy import insert as sql_insert
from sqlalchemy import update as sql_update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.accounts import CurrentUser, DbSession, OptionalUser
from backend.models import Playlist, PlaylistTrack, Track, User
from backend.serializers import playlist_out

router = APIRouter(prefix="/api/playlists", tags=["playlists"])


class CreateBody(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: str | None = None
    isPublic: bool = False


class UpdateBody(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = None
    isPublic: bool | None = None


class AddTrackBody(BaseModel):
    trackId: int


class ReorderBody(BaseModel):
    itemIds: list[int]


async def _owned(
    playlist_id: int, user: User, db: AsyncSession, lock: bool = False
) -> Playlist:
    """lock=True 면 플레이리스트 행에 FOR UPDATE 를 건다.

    같은 플레이리스트에 동시에 곡을 담는 요청들을 줄 세워서
    position 계산과 total_tracks 증가가 서로를 덮어쓰지 않게 한다.
    """
    playlist = await db.get(Playlist, playlist_id, with_for_update=lock)
    if playlist is None:
        raise HTTPException(404, "플레이리스트를 찾을 수 없습니다")
    if playlist.user_id != user.id:
        raise HTTPException(403, "내 플레이리스트가 아닙니다")
    return playlist


@router.post("")
async def create(
    body: CreateBody, user: User = CurrentUser, db: AsyncSession = DbSession
) -> dict[str, Any]:
    playlist = Playlist(
        user_id=user.id,
        name=body.name.strip(),
        description=body.description,
        is_public=body.isPublic,
        total_tracks=0,
        view_count=0,
    )
    db.add(playlist)
    await db.commit()
    await db.refresh(playlist)
    return playlist_out(playlist)


@router.get("")
async def list_mine(
    user: User = CurrentUser, db: AsyncSession = DbSession
) -> dict[str, Any]:
    rows = await db.execute(
        select(Playlist)
        .where(Playlist.user_id == user.id)
        .order_by(Playlist.created_at.desc())
    )
    return {"playlists": [playlist_out(p) for p in rows.scalars()]}


@router.get("/public")
async def list_public(
    limit: int = Query(20, ge=1, le=100), db: AsyncSession = DbSession
) -> dict[str, Any]:
    rows = await db.execute(
        select(Playlist)
        .where(Playlist.is_public.is_(True))
        .order_by(Playlist.view_count.desc(), Playlist.id.desc())
        .limit(limit)
    )
    return {"playlists": [playlist_out(p) for p in rows.scalars()]}


@router.get("/{playlist_id}")
async def detail(
    playlist_id: int,
    user: User | None = OptionalUser,
    db: AsyncSession = DbSession,
) -> dict[str, Any]:
    row = (
        await db.execute(
            select(Playlist.user_id, Playlist.is_public).where(Playlist.id == playlist_id)
        )
    ).first()
    if row is None:
        raise HTTPException(404, "플레이리스트를 찾을 수 없습니다")

    is_owner = user is not None and user.id == row.user_id
    if not is_owner and not row.is_public:
        raise HTTPException(403, "비공개 플레이리스트입니다")

    if not is_owner:
        await db.execute(
            sql_update(Playlist)
            .where(Playlist.id == playlist_id)
            .values(view_count=Playlist.view_count + 1)
        )
        await db.commit()

    playlist = await db.scalar(
        select(Playlist)
        .where(Playlist.id == playlist_id)
        .options(
            selectinload(Playlist.items)
            .selectinload(PlaylistTrack.track)
            .selectinload(Track.album)
        )
    )
    return {**playlist_out(playlist, items=True), "isOwner": is_owner}


@router.patch("/{playlist_id}")
async def update(
    playlist_id: int,
    body: UpdateBody,
    user: User = CurrentUser,
    db: AsyncSession = DbSession,
) -> dict[str, Any]:
    playlist = await _owned(playlist_id, user, db)
    if body.name is not None:
        playlist.name = body.name.strip()
    if body.description is not None:
        playlist.description = body.description
    if body.isPublic is not None:
        playlist.is_public = body.isPublic
    await db.commit()
    await db.refresh(playlist)
    return playlist_out(playlist)


@router.delete("/{playlist_id}")
async def remove(
    playlist_id: int, user: User = CurrentUser, db: AsyncSession = DbSession
) -> dict[str, bool]:
    playlist = await _owned(playlist_id, user, db)
    await db.delete(playlist)
    await db.commit()
    return {"ok": True}


@router.post("/{playlist_id}/tracks")
async def add_track(
    playlist_id: int,
    body: AddTrackBody,
    user: User = CurrentUser,
    db: AsyncSession = DbSession,
) -> dict[str, Any]:
    await _owned(playlist_id, user, db, lock=True)
    if await db.get(Track, body.trackId) is None:
        raise HTTPException(404, "곡을 찾을 수 없습니다")

    # position 을 파이썬에서 읽고 쓰지 않는다. 한 문장 안에서 DB 가 계산한다.
    next_position = (
        select(func.coalesce(func.max(PlaylistTrack.position), -1) + 1)
        .where(PlaylistTrack.playlist_id == playlist_id)
        .scalar_subquery()
    )
    item = (
        await db.execute(
            sql_insert(PlaylistTrack)
            .from_select(
                ["playlist_id", "track_id", "position"],
                select(literal(playlist_id), literal(body.trackId), next_position),
            )
            .returning(PlaylistTrack.id, PlaylistTrack.position)
        )
    ).one()

    # total_tracks 도 read-modify-write 대신 SQL 식으로 증가시킨다.
    total_tracks = await db.scalar(
        sql_update(Playlist)
        .where(Playlist.id == playlist_id)
        .values(total_tracks=Playlist.total_tracks + 1)
        .returning(Playlist.total_tracks)
        .execution_options(synchronize_session=False)
    )
    await db.commit()
    return {"itemId": item.id, "position": item.position, "totalTracks": total_tracks}


@router.delete("/{playlist_id}/tracks/{item_id}")
async def remove_track(
    playlist_id: int,
    item_id: int,
    user: User = CurrentUser,
    db: AsyncSession = DbSession,
) -> dict[str, Any]:
    playlist = await _owned(playlist_id, user, db, lock=True)
    item = await db.get(PlaylistTrack, item_id)
    if item is None or item.playlist_id != playlist_id:
        raise HTTPException(404, "항목을 찾을 수 없습니다")

    await db.delete(item)
    await db.flush()

    remaining = (
        await db.execute(
            select(PlaylistTrack)
            .where(PlaylistTrack.playlist_id == playlist_id)
            .order_by(PlaylistTrack.position)
        )
    ).scalars()
    for position, row in enumerate(remaining):
        row.position = position

    playlist.total_tracks = max(playlist.total_tracks - 1, 0)
    await db.commit()
    return {"ok": True, "totalTracks": playlist.total_tracks}


@router.put("/{playlist_id}/tracks/order")
async def reorder(
    playlist_id: int,
    body: ReorderBody,
    user: User = CurrentUser,
    db: AsyncSession = DbSession,
) -> dict[str, Any]:
    """position UNIQUE 가 DEFERRABLE 이라 한 트랜잭션에서 통째로 갈아끼울 수 있다."""
    await _owned(playlist_id, user, db, lock=True)
    rows = list(
        (
            await db.execute(
                select(PlaylistTrack).where(PlaylistTrack.playlist_id == playlist_id)
            )
        ).scalars()
    )
    by_id = {row.id: row for row in rows}
    if len(body.itemIds) != len(rows) or set(body.itemIds) != set(by_id):
        raise HTTPException(400, "itemIds 는 플레이리스트의 모든 항목을 한 번씩 담아야 합니다")

    for position, item_id in enumerate(body.itemIds):
        by_id[item_id].position = position
    await db.commit()
    return {"ok": True, "order": body.itemIds}

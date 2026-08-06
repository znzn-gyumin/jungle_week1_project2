from typing import Any

from fastapi import APIRouter
from fastapi.exceptions import HTTPException
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.accounts import CurrentUser, DbSession
from backend.models import Album, Like, Playlist, User
from backend.serializers import like_out

router = APIRouter(prefix="/api/likes", tags=["likes"])


@router.get("")
async def list_mine(
    user: User = CurrentUser, db: AsyncSession = DbSession
) -> dict[str, Any]:
    """마이페이지 목록. ix_likes_user_id_created_at 를 탄다."""
    rows = await db.execute(
        select(Like)
        .where(Like.user_id == user.id)
        .options(selectinload(Like.album), selectinload(Like.playlist))
        .order_by(Like.created_at.desc(), Like.id.desc())
    )
    likes = [like_out(like) for like in rows.scalars()]
    return {
        "likes": likes,
        "albums": [like for like in likes if like["target"] == "album"],
        "playlists": [like for like in likes if like["target"] == "playlist"],
    }


async def _toggle_on(db: AsyncSession, user_id: int, column: str, target_id: int) -> bool:
    """중복 체크는 애플리케이션이 아니라 UNIQUE 제약에 맡긴다."""
    stmt = (
        insert(Like)
        .values(user_id=user_id, **{column: target_id})
        .on_conflict_do_nothing(index_elements=[Like.user_id, getattr(Like, column)])
        .returning(Like.id)
    )
    inserted = (await db.execute(stmt)).scalar_one_or_none()
    await db.commit()
    return inserted is not None


@router.put("/albums/{album_id}")
async def like_album(
    album_id: int, user: User = CurrentUser, db: AsyncSession = DbSession
) -> dict[str, Any]:
    if await db.get(Album, album_id) is None:
        raise HTTPException(404, "앨범을 찾을 수 없습니다")
    created = await _toggle_on(db, user.id, "album_id", album_id)
    return {"liked": True, "created": created}


@router.delete("/albums/{album_id}")
async def unlike_album(
    album_id: int, user: User = CurrentUser, db: AsyncSession = DbSession
) -> dict[str, Any]:
    result = await db.execute(
        delete(Like).where(Like.user_id == user.id, Like.album_id == album_id)
    )
    await db.commit()
    return {"liked": False, "removed": result.rowcount > 0}


@router.put("/playlists/{playlist_id}")
async def like_playlist(
    playlist_id: int, user: User = CurrentUser, db: AsyncSession = DbSession
) -> dict[str, Any]:
    playlist = await db.get(Playlist, playlist_id)
    if playlist is None:
        raise HTTPException(404, "플레이리스트를 찾을 수 없습니다")
    if not playlist.is_public and playlist.user_id != user.id:
        raise HTTPException(403, "비공개 플레이리스트입니다")
    created = await _toggle_on(db, user.id, "playlist_id", playlist_id)
    return {"liked": True, "created": created}


@router.delete("/playlists/{playlist_id}")
async def unlike_playlist(
    playlist_id: int, user: User = CurrentUser, db: AsyncSession = DbSession
) -> dict[str, Any]:
    result = await db.execute(
        delete(Like).where(Like.user_id == user.id, Like.playlist_id == playlist_id)
    )
    await db.commit()
    return {"liked": False, "removed": result.rowcount > 0}

from typing import Any

from fastapi import APIRouter, Query
from fastapi.exceptions import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.accounts import DbSession
from backend.devtools import itunes
from backend.models import Album, Track
from backend.serializers import album_out, track_out

router = APIRouter(prefix="/api/catalog", tags=["catalog"])


@router.get("/search")
async def search(
    q: str = "",
    limit: int = Query(20, ge=1, le=itunes.MAX_LIMIT),
    country: str = Query(itunes.DEFAULT_COUNTRY, min_length=2, max_length=2),
    db: AsyncSession = DbSession,
) -> dict[str, Any]:
    """iTunes Search 결과를 tracks/albums 에 upsert 하고 DB 행으로 돌려준다."""
    tracks, cached = await itunes.search_tracks(db, q, limit, country.upper())

    album_ids = {t.album_id for t in tracks if t.album_id}
    albums = (
        list((await db.execute(select(Album).where(Album.id.in_(album_ids)))).scalars())
        if album_ids
        else []
    )
    return {
        "cached": cached,
        "tracks": [track_out(t) for t in tracks],
        "albums": [album_out(a) for a in albums],
    }


@router.get("/albums")
async def list_albums(
    limit: int = Query(20, ge=1, le=100), db: AsyncSession = DbSession
) -> dict[str, Any]:
    rows = await db.execute(select(Album).order_by(Album.id.desc()).limit(limit))
    return {"albums": [album_out(a) for a in rows.scalars()]}


@router.get("/albums/{album_id}")
async def album_detail(album_id: int, db: AsyncSession = DbSession) -> dict[str, Any]:
    album = await db.get(Album, album_id)
    if album is None:
        raise HTTPException(404, "앨범을 찾을 수 없습니다")
    rows = await db.execute(
        select(Track).where(Track.album_id == album_id).order_by(Track.id)
    )
    return {**album_out(album), "tracks": [track_out(t) for t in rows.scalars()]}


@router.get("/tracks")
async def list_tracks(
    limit: int = Query(20, ge=1, le=100), db: AsyncSession = DbSession
) -> dict[str, Any]:
    rows = await db.execute(select(Track).order_by(Track.id.desc()).limit(limit))
    return {"tracks": [track_out(t) for t in rows.scalars()]}

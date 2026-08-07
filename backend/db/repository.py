from typing import Any

from sqlalchemy import func, select, tuple_
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.models import Album, Track
from backend.models.enums import SourceType


LIKE_ESCAPE = "\\"


def _like(value: str) -> str:
    escaped = (
        value.replace(LIKE_ESCAPE, LIKE_ESCAPE * 2)
        .replace("%", LIKE_ESCAPE + "%")
        .replace("_", LIKE_ESCAPE + "_")
    )
    return f"%{escaped}%"


def _dedupe(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: dict[tuple[Any, str], dict[str, Any]] = {}
    for row in rows:
        seen[(row["source"], row["source_id"])] = row
    return list(seen.values())


async def upsert_albums(db: AsyncSession, rows: list[dict[str, Any]]) -> dict[str, int]:
    rows = _dedupe(rows)
    if not rows:
        return {}

    stmt = insert(Album).values(rows)
    stmt = stmt.on_conflict_do_update(
        index_elements=[Album.source, Album.source_id],
        set_={
            "name": stmt.excluded.name,
            "artist": stmt.excluded.artist,
            "release_date": stmt.excluded.release_date,
            "total_tracks": stmt.excluded.total_tracks,
            "thumbnail_url": stmt.excluded.thumbnail_url,
            "updated_at": func.now(),
        },
    ).returning(Album.id, Album.source_id)

    result = await db.execute(stmt)
    return {source_id: album_id for album_id, source_id in result.all()}


async def upsert_tracks(db: AsyncSession, rows: list[dict[str, Any]]) -> list[Track]:
    rows = _dedupe(rows)
    if not rows:
        return []

    stmt = insert(Track).values(rows)
    stmt = stmt.on_conflict_do_update(
        index_elements=[Track.source, Track.source_id],
        set_={
            "title": stmt.excluded.title,
            "artist": stmt.excluded.artist,
            "album_id": stmt.excluded.album_id,
            "duration_ms": stmt.excluded.duration_ms,
            "thumbnail_url": stmt.excluded.thumbnail_url,
            "play_url": stmt.excluded.play_url,
            "updated_at": func.now(),
        },
    )
    await db.execute(stmt)
    await db.flush()

    keys = [(r["source"], r["source_id"]) for r in rows]
    found = (
        (
            await db.execute(
                select(Track)
                .options(selectinload(Track.album))
                .where(tuple_(Track.source, Track.source_id).in_(keys))
            )
        )
        .scalars()
        .all()
    )
    by_key = {(t.source, t.source_id): t for t in found}
    return [by_key[k] for k in keys if k in by_key]


async def get_track(db: AsyncSession, track_id: int) -> Track | None:
    return await db.get(Track, track_id, options=[selectinload(Track.album)])


async def list_tracks(
    db: AsyncSession,
    query: str | None = None,
    source: SourceType | None = None,
    limit: int = 25,
) -> list[Track]:
    stmt = select(Track).options(selectinload(Track.album))
    if query:
        pattern = _like(query)
        stmt = stmt.where(
            Track.title.ilike(pattern, escape=LIKE_ESCAPE)
            | Track.artist.ilike(pattern, escape=LIKE_ESCAPE)
        )
    if source is not None:
        stmt = stmt.where(Track.source == source)
    stmt = stmt.order_by(Track.updated_at.desc()).limit(limit)
    return list((await db.execute(stmt)).scalars().all())


async def get_album(db: AsyncSession, album_id: int) -> Album | None:
    stmt = (
        select(Album)
        .options(selectinload(Album.tracks))
        .where(Album.id == album_id)
        .execution_options(populate_existing=True)
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def list_albums(
    db: AsyncSession, query: str | None = None, limit: int = 25
) -> list[Album]:
    stmt = select(Album)
    if query:
        pattern = _like(query)
        stmt = stmt.where(
            Album.name.ilike(pattern, escape=LIKE_ESCAPE)
            | Album.artist.ilike(pattern, escape=LIKE_ESCAPE)
        )
    stmt = stmt.order_by(Album.updated_at.desc()).limit(limit)
    return list((await db.execute(stmt)).scalars().all())


async def albums_by_ids(db: AsyncSession, ids: list[int]) -> list[Album]:
    if not ids:
        return []
    found = (await db.execute(select(Album).where(Album.id.in_(ids)))).scalars().all()
    by_id = {a.id: a for a in found}
    return [by_id[i] for i in ids if i in by_id]

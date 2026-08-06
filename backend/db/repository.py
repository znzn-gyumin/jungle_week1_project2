from typing import Any

from sqlalchemy import select, tuple_
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models import Album, Track
from backend.models.enums import SourceType


def _dedupe(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: dict[tuple[Any, str], dict[str, Any]] = {}
    for row in rows:
        seen[(row["source"], row["source_id"])] = row
    return list(seen.values())


async def upsert_albums(
    db: AsyncSession, rows: list[dict[str, Any]]
) -> dict[str, int]:
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
        },
    )
    await db.execute(stmt)
    await db.commit()

    keys = [(r["source"], r["source_id"]) for r in rows]
    found = (
        (
            await db.execute(
                select(Track).where(tuple_(Track.source, Track.source_id).in_(keys))
            )
        )
        .scalars()
        .all()
    )
    by_key = {(t.source, t.source_id): t for t in found}
    return [by_key[k] for k in keys if k in by_key]


async def list_tracks(
    db: AsyncSession,
    query: str | None = None,
    source: SourceType | None = None,
    limit: int = 25,
) -> list[Track]:
    stmt = select(Track)
    if query:
        pattern = f"%{query}%"
        stmt = stmt.where(Track.title.ilike(pattern) | Track.artist.ilike(pattern))
    if source is not None:
        stmt = stmt.where(Track.source == source)
    stmt = stmt.order_by(Track.updated_at.desc()).limit(limit)
    return list((await db.execute(stmt)).scalars().all())

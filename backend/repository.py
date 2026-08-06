from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models import Album, Track
from backend.models.enums import SourceType


async def upsert_album(db: AsyncSession, values: dict[str, Any]) -> int:
    stmt = (
        insert(Album)
        .values(**values)
        .on_conflict_do_update(
            index_elements=[Album.source, Album.source_id],
            set_={
                "name": values["name"],
                "artist": values["artist"],
                "release_date": values.get("release_date"),
                "total_tracks": values.get("total_tracks"),
                "thumbnail_url": values.get("thumbnail_url"),
            },
        )
        .returning(Album.id)
    )
    return (await db.execute(stmt)).scalar_one()


async def upsert_tracks(
    db: AsyncSession, rows: list[dict[str, Any]]
) -> list[Track]:
    if not rows:
        return []

    for row in rows:
        stmt = (
            insert(Track)
            .values(**row)
            .on_conflict_do_update(
                index_elements=[Track.source, Track.source_id],
                set_={
                    "title": row["title"],
                    "artist": row["artist"],
                    "album_id": row.get("album_id"),
                    "duration_ms": row.get("duration_ms"),
                    "thumbnail_url": row.get("thumbnail_url"),
                    "play_url": row.get("play_url"),
                },
            )
        )
        await db.execute(stmt)
    await db.commit()

    keys = [(r["source"], r["source_id"]) for r in rows]
    found = (
        (
            await db.execute(
                select(Track).where(
                    Track.source.in_({k[0] for k in keys}),
                    Track.source_id.in_({k[1] for k in keys}),
                )
            )
        )
        .scalars()
        .all()
    )
    by_key = {(t.source, t.source_id): t for t in found}
    return [by_key[k] for k in keys if k in by_key]


async def tracks_by_source(
    db: AsyncSession, source: SourceType, limit: int
) -> list[Track]:
    stmt = (
        select(Track)
        .where(Track.source == source)
        .order_by(Track.updated_at.desc())
        .limit(limit)
    )
    return list((await db.execute(stmt)).scalars().all())


async def search_tracks_local(
    db: AsyncSession, query: str, limit: int
) -> list[Track]:
    pattern = f"%{query.lower()}%"
    stmt = (
        select(Track)
        .where(Track.title.ilike(pattern) | Track.artist.ilike(pattern))
        .order_by(Track.updated_at.desc())
        .limit(limit)
    )
    return list((await db.execute(stmt)).scalars().all())

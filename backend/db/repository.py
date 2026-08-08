from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import func, select, tuple_, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.models import Album, SearchCache, Track
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
            "artist_source_id": stmt.excluded.artist_source_id,
            "genre": stmt.excluded.genre,
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
            "artist_source_id": stmt.excluded.artist_source_id,
            "genre": stmt.excluded.genre,
            "release_date": stmt.excluded.release_date,
            "disc_number": stmt.excluded.disc_number,
            "track_number": stmt.excluded.track_number,
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


async def mark_tracks_synced(db: AsyncSession, album_id: int) -> None:
    await db.execute(
        update(Album).where(Album.id == album_id).values(tracks_synced_at=func.now())
    )


async def tracks_by_ids(db: AsyncSession, ids: list[int]) -> list[Track]:
    if not ids:
        return []
    found = (
        (
            await db.execute(
                select(Track).options(selectinload(Track.album)).where(Track.id.in_(ids))
            )
        )
        .scalars()
        .all()
    )
    by_id = {t.id: t for t in found}
    return [by_id[i] for i in ids if i in by_id]


async def cached_ids(
    db: AsyncSession,
    kind: str,
    source: str,
    query: str,
    limit: int,
    ttl: int,
) -> list[int] | None:
    """TTL 안이면 저장된 결과 ID 목록, 아니면 None.

    빈 리스트도 유효한 적중이다 - "결과 없음" 을 기억해 헛질의가 API 를 다시
    치지 않게 한다. 만료 판정 기준 시각은 앱이 계산한다 (앱과 DB 가 같은 UTC).
    """
    cutoff = datetime.now(timezone.utc) - timedelta(seconds=ttl)
    return (
        await db.execute(
            select(SearchCache.result_ids).where(
                SearchCache.kind == kind,
                SearchCache.source == source,
                SearchCache.query == query,
                SearchCache.result_limit == limit,
                SearchCache.updated_at > cutoff,
            )
        )
    ).scalar_one_or_none()


async def put_cached_ids(
    db: AsyncSession,
    kind: str,
    source: str,
    query: str,
    limit: int,
    ids: list[int],
) -> None:
    stmt = insert(SearchCache).values(
        kind=kind,
        source=source,
        query=query,
        result_limit=limit,
        result_ids=ids,
    )
    await db.execute(
        stmt.on_conflict_do_update(
            index_elements=[
                SearchCache.kind,
                SearchCache.source,
                SearchCache.query,
                SearchCache.result_limit,
            ],
            set_={
                "result_ids": stmt.excluded.result_ids,
                "updated_at": func.now(),
            },
        )
    )

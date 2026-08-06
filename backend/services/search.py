import asyncio
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import get_settings
from backend.db import repository
from backend.models import Album, Track
from backend.models.enums import SourceType
from backend.sources import itunes, youtube

settings = get_settings()

ALBUM_SOURCES = (SourceType.ITUNES.value,)


async def _itunes(db: AsyncSession, q: str, limit: int) -> list[Track]:
    results = await itunes.search_tracks(
        q, limit=limit, country=settings.itunes_country
    )
    if not results:
        return []

    albums = [itunes.to_album(r) for r in results if itunes.album_source_id(r)]
    album_ids = await repository.upsert_albums(db, albums)

    rows = []
    for r in results:
        row = itunes.to_track(r)
        row["album_id"] = album_ids.get(itunes.album_source_id(r) or "")
        rows.append(row)
    return await repository.upsert_tracks(db, rows)


async def _youtube(db: AsyncSession, q: str, limit: int) -> list[Track]:
    items = await youtube.search_videos(q, limit=limit)
    return await repository.upsert_tracks(db, [youtube.to_track(i) for i in items])


_FETCHERS = {
    SourceType.ITUNES.value: _itunes,
    SourceType.YOUTUBE.value: _youtube,
}

SOURCES = tuple(_FETCHERS)

_missing = {s.value for s in SourceType} - set(_FETCHERS)
if _missing:
    raise RuntimeError(f"검색 구현이 없는 source: {sorted(_missing)}")


def resolve_sources(source: str) -> tuple[str, ...]:
    return SOURCES if source == "all" else (source,)


async def search(
    db: AsyncSession, q: str, source: str, limit: int
) -> tuple[list[Track], list[dict[str, str]]]:
    wanted = [
        name
        for name in resolve_sources(source)
        if name != SourceType.YOUTUBE.value or youtube.configured()
    ]

    done = await asyncio.gather(
        *(_FETCHERS[name](db, q, limit) for name in wanted),
        return_exceptions=True,
    )

    tracks: list[Track] = []
    errors: list[dict[str, str]] = []
    for name, result in zip(wanted, done):
        if isinstance(result, BaseException):
            message: Any = getattr(result, "message", None) or str(result)
            errors.append({"source": name, "error": message})
        else:
            tracks.extend(result)
    return tracks, errors


async def search_albums(
    db: AsyncSession, q: str, source: str, limit: int
) -> tuple[list[Album], list[dict[str, str]]]:
    wanted = [s for s in resolve_sources(source) if s in ALBUM_SOURCES]
    if not wanted:
        return [], [{"source": source, "error": "앨범 검색을 지원하지 않는 소스"}]

    try:
        results = await itunes.search_albums(
            q, limit=limit, country=settings.itunes_country
        )
    except Exception as exc:
        message = getattr(exc, "message", None) or str(exc)
        return [], [{"source": "itunes", "error": message}]

    ids = await repository.upsert_albums(db, [itunes.to_album(r) for r in results])
    await db.commit()
    ordered = [
        ids[key]
        for r in results
        if (key := itunes.album_source_id(r)) and key in ids
    ]
    return await repository.albums_by_ids(db, ordered), []

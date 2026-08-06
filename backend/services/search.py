import asyncio
from collections.abc import Awaitable, Callable
from typing import Any, NamedTuple

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import get_settings
from backend.db import repository
from backend.models import Album, Track
from backend.models.enums import SourceType
from backend.sources import itunes, youtube
from backend.sources.itunes import ITunesError
from backend.sources.youtube import YouTubeError

settings = get_settings()

ALBUM_SOURCES = (SourceType.ITUNES.value,)

SOURCE_ERRORS = (ITunesError, YouTubeError, httpx.HTTPError)


class Fetcher(NamedTuple):
    fetch: Callable[[str, int], Awaitable[list[dict[str, Any]]]]
    persist: Callable[[AsyncSession, list[dict[str, Any]]], Awaitable[list[Track]]]


async def _fetch_itunes(q: str, limit: int) -> list[dict[str, Any]]:
    return await itunes.search_tracks(q, limit=limit, country=settings.itunes_country)


async def _persist_itunes(
    db: AsyncSession, results: list[dict[str, Any]]
) -> list[Track]:
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


async def _fetch_youtube(q: str, limit: int) -> list[dict[str, Any]]:
    return await youtube.search_videos(q, limit=limit)


async def _persist_youtube(
    db: AsyncSession, items: list[dict[str, Any]]
) -> list[Track]:
    if not items:
        return []
    return await repository.upsert_tracks(db, [youtube.to_track(i) for i in items])


_FETCHERS: dict[str, Fetcher] = {
    SourceType.ITUNES.value: Fetcher(_fetch_itunes, _persist_itunes),
    SourceType.YOUTUBE.value: Fetcher(_fetch_youtube, _persist_youtube),
}

SOURCES = tuple(_FETCHERS)

_missing = {s.value for s in SourceType} - set(_FETCHERS)
if _missing:
    raise RuntimeError(f"검색 구현이 없는 source: {sorted(_missing)}")


def resolve_sources(source: str) -> tuple[str, ...]:
    return SOURCES if source == "all" else (source,)


def _select_sources(source: str) -> tuple[list[str], list[dict[str, str]]]:
    wanted: list[str] = []
    errors: list[dict[str, str]] = []
    for name in resolve_sources(source):
        if name == SourceType.YOUTUBE.value and not youtube.configured():
            if source != "all":
                errors.append(
                    {"source": name, "error": "YOUTUBE_API_KEY 가 설정되지 않았다"}
                )
            continue
        wanted.append(name)
    return wanted, errors


def _message(exc: BaseException) -> str:
    return getattr(exc, "message", None) or str(exc)


async def search(
    db: AsyncSession, q: str, source: str, limit: int
) -> tuple[list[Track], list[dict[str, str]]]:
    wanted, errors = _select_sources(source)

    fetched = await asyncio.gather(
        *(_FETCHERS[name].fetch(q, limit) for name in wanted),
        return_exceptions=True,
    )

    tracks: list[Track] = []
    for name, result in zip(wanted, fetched):
        if isinstance(result, BaseException):
            if not isinstance(result, SOURCE_ERRORS):
                raise result
            errors.append({"source": name, "error": _message(result)})
            continue
        tracks.extend(await _FETCHERS[name].persist(db, result))

    await db.commit()
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
    except SOURCE_ERRORS as exc:
        return [], [{"source": SourceType.ITUNES.value, "error": _message(exc)}]

    ids = await repository.upsert_albums(db, [itunes.to_album(r) for r in results])
    await db.commit()

    ordered = [
        ids[key] for r in results if (key := itunes.album_source_id(r)) and key in ids
    ]
    return await repository.albums_by_ids(db, ordered), []

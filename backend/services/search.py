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

# search_cache.query 컬럼 크기. api.search 가 같은 값으로 입력을 막는다.
MAX_QUERY_LENGTH = 200

# 차트는 검색어가 없다. query 자리에 국가를 넣는 대신 kind 를 따로 준다.
# 그래야 "top" 을 검색한 사람의 캐시와 절대 겹치지 않는다.
TOP_KIND = "top"


def cache_key(q: str) -> str:
    """대소문자만 다른 검색어가 캐시를 따로 먹지 않게 한다."""
    return q.casefold()[:MAX_QUERY_LENGTH]


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
    return await youtube.search_videos(q, limit=limit, country=settings.itunes_country)


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
    key = cache_key(q)

    # 캐시는 소스별로 잡는다. source=all 로 한 번 검색해 두면 나중에
    # source=itunes 로 같은 검색어가 와도 그 소스 몫은 그대로 적중한다.
    # DB 세션은 동시 접근이 안 되니 조회는 순차, 외부 호출만 gather.
    cached: dict[str, list[int] | None] = {}
    for name in wanted:
        cached[name] = await repository.cached_ids(
            db, "track", name, key, limit, settings.search_cache_ttl
        )

    live = [name for name in wanted if cached[name] is None]
    fetched = await asyncio.gather(
        *(_FETCHERS[name].fetch(q, limit) for name in live),
        return_exceptions=True,
    )
    results = dict(zip(live, fetched))

    tracks: list[Track] = []
    for name in wanted:
        ids = cached[name]
        if ids is not None:
            tracks.extend(await repository.tracks_by_ids(db, ids))
            continue

        result = results[name]
        if isinstance(result, BaseException):
            if not isinstance(result, SOURCE_ERRORS):
                raise result
            # 실패는 캐시하지 않는다. 429 한 번이 TTL 동안 굳으면 안 된다.
            errors.append({"source": name, "error": _message(result)})
            continue

        rows = await _FETCHERS[name].persist(db, result)
        await repository.put_cached_ids(
            db, "track", name, key, limit, [t.id for t in rows]
        )
        tracks.extend(rows)

    await db.commit()
    return tracks, errors


async def top_tracks(
    db: AsyncSession, limit: int
) -> tuple[list[Track], list[dict[str, str]]]:
    """Apple Music 인기곡 차트. 하루 한 번 갱신되니 캐시 TTL 을 그대로 쓴다."""
    name = SourceType.ITUNES.value
    country = settings.itunes_country
    cached = await repository.cached_ids(
        db, TOP_KIND, name, country, limit, settings.search_cache_ttl
    )
    if cached is not None:
        return await repository.tracks_by_ids(db, cached), []

    try:
        results = await itunes.top_tracks(limit=limit, country=country)
    except SOURCE_ERRORS as exc:
        return [], [{"source": name, "error": _message(exc)}]

    rows = await _persist_itunes(db, results)
    # 검색과 달리 빈 차트는 "결과 없음" 이 아니라 고장이다. 캐시하면 하루 동안 굳는다.
    if rows:
        await repository.put_cached_ids(
            db, TOP_KIND, name, country, limit, [t.id for t in rows]
        )
        await db.commit()
    return rows, []


async def search_albums(
    db: AsyncSession, q: str, source: str, limit: int
) -> tuple[list[Album], list[dict[str, str]]]:
    wanted = [s for s in resolve_sources(source) if s in ALBUM_SOURCES]
    if not wanted:
        return [], [{"source": source, "error": "앨범 검색을 지원하지 않는 소스"}]

    name = SourceType.ITUNES.value
    key = cache_key(q)
    cached = await repository.cached_ids(
        db, "album", name, key, limit, settings.search_cache_ttl
    )
    if cached is not None:
        return await repository.albums_by_ids(db, cached), []

    try:
        results = await itunes.search_albums(
            q, limit=limit, country=settings.itunes_country
        )
    except SOURCE_ERRORS as exc:
        return [], [{"source": name, "error": _message(exc)}]

    ids = await repository.upsert_albums(db, [itunes.to_album(r) for r in results])
    ordered = [
        ids[sid] for r in results if (sid := itunes.album_source_id(r)) and sid in ids
    ]
    await repository.put_cached_ids(db, "album", name, key, limit, ordered)
    await db.commit()

    return await repository.albums_by_ids(db, ordered), []

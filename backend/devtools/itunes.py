from datetime import UTC, date, datetime, timedelta
from typing import Any

import httpx
from fastapi.exceptions import HTTPException
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models import Album, SearchCache, SearchCacheItem, SourceType, Track

SEARCH_URL = "https://itunes.apple.com/search"
CACHE_TTL = timedelta(hours=24)
DEFAULT_COUNTRY = "KR"
MAX_LIMIT = 50

_client: httpx.AsyncClient | None = None


def set_client(client: httpx.AsyncClient | None) -> None:
    global _client
    _client = client


def _http() -> httpx.AsyncClient:
    if _client is None:
        raise RuntimeError("HTTP client 미초기화 — lifespan 이 실행되지 않았다")
    return _client


def normalize(query: str) -> str:
    return " ".join(query.split()).lower()


async def search_tracks(
    db: AsyncSession, query: str, limit: int, country: str = DEFAULT_COUNTRY
) -> tuple[list[Track], bool]:
    """(트랙 목록, 캐시 히트 여부)"""
    key = normalize(query)
    if not key:
        return [], False

    cache = await db.scalar(
        select(SearchCache).where(
            SearchCache.source == SourceType.ITUNES,
            SearchCache.search_type == "track",
            SearchCache.query == key,
        )
    )
    if cache and cache.fetched_at > datetime.now(UTC) - CACHE_TTL:
        return await _cached_tracks(db, cache.id, limit), True

    results = await _fetch(key, limit, country)
    tracks = await _upsert_tracks(db, results)
    await _store_cache(db, key, tracks)
    await db.commit()
    return tracks, False


async def _cached_tracks(db: AsyncSession, cache_id: int, limit: int) -> list[Track]:
    rows = await db.execute(
        select(Track)
        .join(SearchCacheItem, SearchCacheItem.track_id == Track.id)
        .where(SearchCacheItem.cache_id == cache_id)
        .order_by(SearchCacheItem.position)
        .limit(limit)
    )
    return list(rows.scalars())


async def _fetch(query: str, limit: int, country: str) -> list[dict[str, Any]]:
    params = {
        "term": query,
        "media": "music",
        "entity": "song",
        "limit": min(limit, MAX_LIMIT),
        "country": country,
    }
    try:
        res = await _http().get(SEARCH_URL, params=params)
    except httpx.HTTPError as exc:
        raise HTTPException(502, f"iTunes 호출 실패: {exc}") from exc

    if res.status_code == 403:
        raise HTTPException(429, "iTunes 요청 한도 초과 (IP 당 약 20회/분). 잠시 후 다시 시도하세요.")
    if res.status_code >= 400:
        raise HTTPException(502, f"iTunes {res.status_code}")

    try:
        body = res.json()
    except ValueError as exc:
        raise HTTPException(502, "iTunes 응답 파싱 실패") from exc

    return [r for r in body.get("results", []) if r.get("trackId") and r.get("trackName")]


async def _upsert_tracks(db: AsyncSession, results: list[dict[str, Any]]) -> list[Track]:
    album_ids = await _upsert_albums(db, results)

    tracks: list[Track] = []
    for item in results:
        stmt = (
            insert(Track)
            .values(
                source=SourceType.ITUNES.value,
                source_id=str(item["trackId"]),
                title=item["trackName"],
                artist=item.get("artistName") or "Unknown",
                album_id=album_ids.get(item.get("collectionId")),
                duration_ms=item.get("trackTimeMillis"),
                thumbnail_url=item.get("artworkUrl100"),
                play_url=item.get("previewUrl"),
            )
            .on_conflict_do_update(
                index_elements=[Track.source, Track.source_id],
                set_={
                    "title": item["trackName"],
                    "artist": item.get("artistName") or "Unknown",
                    "album_id": album_ids.get(item.get("collectionId")),
                    "duration_ms": item.get("trackTimeMillis"),
                    "thumbnail_url": item.get("artworkUrl100"),
                    "play_url": item.get("previewUrl"),
                },
            )
            .returning(Track)
        )
        track = (await db.execute(stmt)).scalar_one()
        tracks.append(track)
    return tracks


async def _upsert_albums(
    db: AsyncSession, results: list[dict[str, Any]]
) -> dict[int, int]:
    seen: dict[int, dict[str, Any]] = {}
    for item in results:
        collection_id = item.get("collectionId")
        if collection_id and collection_id not in seen:
            seen[collection_id] = item

    album_ids: dict[int, int] = {}
    for collection_id, item in seen.items():
        stmt = (
            insert(Album)
            .values(
                source=SourceType.ITUNES.value,
                source_id=str(collection_id),
                name=item.get("collectionName") or item["trackName"],
                artist=item.get("artistName") or "Unknown",
                release_date=_release_date(item.get("releaseDate")),
                total_tracks=item.get("trackCount"),
                thumbnail_url=item.get("artworkUrl100"),
            )
            .on_conflict_do_update(
                index_elements=[Album.source, Album.source_id],
                set_={
                    "name": item.get("collectionName") or item["trackName"],
                    "artist": item.get("artistName") or "Unknown",
                    "thumbnail_url": item.get("artworkUrl100"),
                },
            )
            .returning(Album.id)
        )
        album_ids[collection_id] = (await db.execute(stmt)).scalar_one()
    return album_ids


async def _store_cache(db: AsyncSession, key: str, tracks: list[Track]) -> None:
    cache_id = (
        await db.execute(
            insert(SearchCache)
            .values(
                source=SourceType.ITUNES.value,
                search_type="track",
                query=key,
                fetched_at=datetime.now(UTC),
            )
            .on_conflict_do_update(
                index_elements=[
                    SearchCache.source,
                    SearchCache.search_type,
                    SearchCache.query,
                ],
                set_={"fetched_at": datetime.now(UTC)},
            )
            .returning(SearchCache.id)
        )
    ).scalar_one()

    await db.execute(delete(SearchCacheItem).where(SearchCacheItem.cache_id == cache_id))
    if tracks:
        await db.execute(
            insert(SearchCacheItem),
            [
                {"cache_id": cache_id, "position": i, "track_id": t.id}
                for i, t in enumerate(tracks)
            ],
        )


def _release_date(raw: str | None) -> date | None:
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00")).date()
    except ValueError:
        return None

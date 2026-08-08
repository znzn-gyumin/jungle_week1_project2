from collections.abc import Callable
from typing import Any
from urllib.parse import urlencode

import httpx

from backend.models.enums import SourceType
from backend.sources import parse_date

BASE = "https://itunes.apple.com"
# 차트 피드는 검색 API 와 호스트가 다르다. rss.applemarketingtools.com 은
# 여기로 301 하니 처음부터 최종 주소를 쓴다.
RSS_BASE = "https://rss.marketingtools.apple.com"
ITUNES_MAX_LIMIT = 200
ARTWORK_SIZE = "600x600bb"

_client: httpx.AsyncClient | None = None


class ITunesError(Exception):
    def __init__(self, message: str, status: int):
        super().__init__(message)
        self.message = message
        self.status = status


def set_client(client: httpx.AsyncClient | None) -> None:
    global _client
    _client = client


def _http() -> httpx.AsyncClient:
    if _client is None:
        raise RuntimeError("HTTP client 미초기화 - lifespan 이 실행되지 않았다")
    return _client


async def _json(url: str) -> dict[str, Any]:
    res = await _http().get(url)
    if res.status_code == 429:
        raise ITunesError("iTunes 요청 한도 초과 (IP 당 약 20회/분)", 429)
    if res.status_code >= 400:
        raise ITunesError(f"iTunes {res.status_code}", res.status_code)
    try:
        return res.json()
    except ValueError:
        raise ITunesError("iTunes 응답을 JSON 으로 읽지 못했다", 502) from None


async def _get(path: str, params: dict[str, Any]) -> list[dict[str, Any]]:
    body = await _json(f"{BASE}{path}?{urlencode(params)}")
    return body.get("results", [])


async def search_tracks(
    term: str, limit: int = 25, country: str = "KR"
) -> list[dict[str, Any]]:
    results = await _get(
        "/search",
        {
            "term": term,
            "media": "music",
            "entity": "song",
            "limit": min(limit, ITUNES_MAX_LIMIT),
            "country": country,
        },
    )
    return [r for r in results if r.get("trackId")]


async def search_albums(
    term: str, limit: int = 25, country: str = "KR"
) -> list[dict[str, Any]]:
    results = await _get(
        "/search",
        {
            "term": term,
            "media": "music",
            "entity": "album",
            "limit": min(limit, ITUNES_MAX_LIMIT),
            "country": country,
        },
    )
    return [r for r in results if r.get("collectionId")]


async def _chart(
    feed_kind: str,
    entity: str,
    source_id: Callable[[dict[str, Any]], str | None],
    limit: int,
    country: str,
) -> list[dict[str, Any]]:
    """Apple Music 국가별 차트.

    RSS 피드는 순위와 ID 만 준다. 상세는 /lookup 이 ID 를 쉼표로 한 번에
    받으므로 항목 수와 무관하게 총 2회 호출이면 끝난다. 검색으로 항목을 되찾을
    필요가 없어서 제목이 엉뚱한 곡/앨범에 붙을 여지도 없다.
    """
    feed = await _json(
        f"{RSS_BASE}/api/v2/{country.lower()}/music/most-played/{limit}/{feed_kind}.json"
    )
    ids = [str(r["id"]) for r in feed.get("feed", {}).get("results", []) if r.get("id")]
    if not ids:
        return []

    results = await _get(
        "/lookup",
        {"id": ",".join(ids), "entity": entity, "country": country},
    )
    # lookup 응답 순서는 보장이 없다. 순위는 피드 순서가 원본이다.
    by_id = {sid: r for r in results if (sid := source_id(r))}
    return [by_id[i] for i in ids if i in by_id]


async def top_tracks(limit: int = 20, country: str = "KR") -> list[dict[str, Any]]:
    return await _chart("songs", "song", track_source_id, limit, country)


async def top_albums(limit: int = 20, country: str = "KR") -> list[dict[str, Any]]:
    return await _chart("albums", "album", album_source_id, limit, country)


async def lookup_album_tracks(
    collection_id: str, country: str = "KR"
) -> list[dict[str, Any]]:
    results = await _get(
        "/lookup",
        {"id": collection_id, "entity": "song", "country": country},
    )
    return [r for r in results if r.get("wrapperType") == "track" and r.get("trackId")]


async def search_album_tracks(
    collection_id: str,
    album_name: str,
    country: str = "KR",
) -> list[dict[str, Any]]:
    results = await search_tracks(album_name, limit=ITUNES_MAX_LIMIT, country=country)
    return [r for r in results if album_source_id(r) == collection_id]


def _artwork(url: str | None) -> str | None:
    return url.replace("100x100bb", ARTWORK_SIZE) if url else None


def _artist_id(result: dict[str, Any]) -> str | None:
    value = result.get("artistId")
    return str(value) if value else None


def to_track(result: dict[str, Any]) -> dict[str, Any]:
    return {
        "source": SourceType.ITUNES,
        "source_id": str(result["trackId"]),
        "title": result.get("trackName") or "",
        "artist": result.get("artistName") or "",
        "duration_ms": result.get("trackTimeMillis"),
        "thumbnail_url": _artwork(result.get("artworkUrl100")),
        "play_url": result.get("previewUrl"),
        "artist_source_id": _artist_id(result),
        "genre": result.get("primaryGenreName"),
        "release_date": parse_date(result.get("releaseDate")),
        "disc_number": result.get("discNumber"),
        "track_number": result.get("trackNumber"),
    }


def to_album(result: dict[str, Any]) -> dict[str, Any]:
    return {
        "source": SourceType.ITUNES,
        "source_id": str(result["collectionId"]),
        "name": result.get("collectionName") or "",
        "artist": result.get("artistName") or "",
        "release_date": parse_date(result.get("releaseDate")),
        "total_tracks": result.get("trackCount"),
        "thumbnail_url": _artwork(result.get("artworkUrl100")),
        "artist_source_id": _artist_id(result),
        "genre": result.get("primaryGenreName"),
    }


def album_source_id(result: dict[str, Any]) -> str | None:
    value = result.get("collectionId")
    return str(value) if value else None


def track_source_id(result: dict[str, Any]) -> str | None:
    value = result.get("trackId")
    return str(value) if value else None

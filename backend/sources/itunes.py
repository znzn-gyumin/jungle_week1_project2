from datetime import date, datetime
from typing import Any
from urllib.parse import urlencode

import httpx

from backend.models.enums import SourceType

BASE = "https://itunes.apple.com"
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


async def _get(path: str, params: dict[str, Any]) -> list[dict[str, Any]]:
    res = await _http().get(f"{BASE}{path}?{urlencode(params)}")
    if res.status_code == 429:
        raise ITunesError("iTunes 요청 한도 초과 (IP 당 약 20회/분)", 429)
    if res.status_code >= 400:
        raise ITunesError(f"iTunes {res.status_code}", res.status_code)
    try:
        body = res.json()
    except ValueError:
        raise ITunesError("iTunes 응답을 JSON 으로 읽지 못했다", 502) from None
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


def _release_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).date()
    except ValueError:
        return None


def _artwork(url: str | None) -> str | None:
    return url.replace("100x100bb", ARTWORK_SIZE) if url else None


def to_track(result: dict[str, Any]) -> dict[str, Any]:
    return {
        "source": SourceType.ITUNES,
        "source_id": str(result["trackId"]),
        "title": result.get("trackName") or "",
        "artist": result.get("artistName") or "",
        "duration_ms": result.get("trackTimeMillis"),
        "thumbnail_url": _artwork(result.get("artworkUrl100")),
        "play_url": result.get("previewUrl"),
    }


def to_album(result: dict[str, Any]) -> dict[str, Any]:
    return {
        "source": SourceType.ITUNES,
        "source_id": str(result["collectionId"]),
        "name": result.get("collectionName") or "",
        "artist": result.get("artistName") or "",
        "release_date": _release_date(result.get("releaseDate")),
        "total_tracks": result.get("trackCount"),
        "thumbnail_url": _artwork(result.get("artworkUrl100")),
    }


def album_source_id(result: dict[str, Any]) -> str | None:
    value = result.get("collectionId")
    return str(value) if value else None

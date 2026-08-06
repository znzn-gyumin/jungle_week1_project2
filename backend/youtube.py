import re
from typing import Any
from urllib.parse import urlencode

import httpx

from backend.config import get_settings
from backend.models.enums import SourceType

BASE = "https://www.googleapis.com/youtube/v3"
EMBED = "https://www.youtube.com/embed"
MUSIC_CATEGORY_ID = "10"
MAX_LIMIT = 50

_DURATION = re.compile(
    r"^P(?:(?P<days>\d+)D)?T(?:(?P<hours>\d+)H)?(?:(?P<minutes>\d+)M)?(?:(?P<seconds>\d+)S)?$"
)

settings = get_settings()
_client: httpx.AsyncClient | None = None


class YouTubeError(Exception):
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


def configured() -> bool:
    return bool(settings.youtube_api_key)


async def _get(path: str, params: dict[str, Any]) -> dict[str, Any]:
    if not configured():
        raise YouTubeError("YOUTUBE_API_KEY 가 설정되지 않았다", 503)
    res = await _http().get(
        f"{BASE}{path}?{urlencode({**params, 'key': settings.youtube_api_key})}"
    )
    body: Any = None
    if res.content:
        try:
            body = res.json()
        except ValueError:
            body = None
    if res.status_code >= 400:
        reason = ""
        if isinstance(body, dict):
            reason = (body.get("error") or {}).get("message", "")
        if res.status_code == 403 and "quota" in reason.lower():
            raise YouTubeError("YouTube 일일 할당량 소진 (search 1회 = 100 유닛)", 429)
        raise YouTubeError(reason or f"YouTube {res.status_code}", res.status_code)
    return body or {}


def parse_duration(value: str | None) -> int | None:
    if not value:
        return None
    m = _DURATION.match(value)
    if not m:
        return None
    parts = {k: int(v) for k, v in m.groupdict(default="0").items()}
    total = (
        parts["days"] * 86400
        + parts["hours"] * 3600
        + parts["minutes"] * 60
        + parts["seconds"]
    )
    return total * 1000


def _thumbnail(snippet: dict[str, Any]) -> str | None:
    thumbs = snippet.get("thumbnails") or {}
    for key in ("medium", "high", "default"):
        if key in thumbs and thumbs[key].get("url"):
            return thumbs[key]["url"]
    return None


async def search_videos(term: str, limit: int = 25) -> list[dict[str, Any]]:
    body = await _get(
        "/search",
        {
            "part": "snippet",
            "q": term,
            "type": "video",
            "videoCategoryId": MUSIC_CATEGORY_ID,
            "maxResults": min(limit, MAX_LIMIT),
        },
    )
    items = [i for i in body.get("items", []) if (i.get("id") or {}).get("videoId")]
    durations = await _durations([i["id"]["videoId"] for i in items])
    return [{**i, "_duration_ms": durations.get(i["id"]["videoId"])} for i in items]


async def _durations(video_ids: list[str]) -> dict[str, int | None]:
    if not video_ids:
        return {}
    body = await _get(
        "/videos", {"part": "contentDetails", "id": ",".join(video_ids[:MAX_LIMIT])}
    )
    return {
        i["id"]: parse_duration((i.get("contentDetails") or {}).get("duration"))
        for i in body.get("items", [])
    }


def to_track(item: dict[str, Any]) -> dict[str, Any]:
    video_id = item["id"]["videoId"]
    snippet = item.get("snippet") or {}
    return {
        "source": SourceType.YOUTUBE,
        "source_id": video_id,
        "title": snippet.get("title") or "",
        "artist": snippet.get("channelTitle") or "",
        "duration_ms": item.get("_duration_ms"),
        "thumbnail_url": _thumbnail(snippet),
        "play_url": f"{EMBED}/{video_id}",
    }

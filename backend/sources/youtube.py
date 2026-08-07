import html
import re
from typing import Any
from urllib.parse import urlencode

import httpx

from backend.config import get_settings
from backend.models.enums import SourceType

BASE = "https://www.googleapis.com/youtube/v3"
EMBED = "https://www.youtube.com/embed"
YOUTUBE_MAX_RESULTS = 50
MUSIC_CATEGORY_ID = "10"

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
    return bool(settings.youtube_key)


async def _get(path: str, params: dict[str, Any]) -> dict[str, Any]:
    if not configured():
        raise YouTubeError("YOUTUBE_API_KEY 가 설정되지 않았다", 503)
    res = await _http().get(
        f"{BASE}{path}?{urlencode({**params, 'key': settings.youtube_key})}"
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


async def search_videos(
    term: str, limit: int = 25, country: str = "KR"
) -> list[dict[str, Any]]:
    body = await _get(
        "/search",
        {
            "part": "snippet",
            "q": term,
            "type": "video",
            "videoCategoryId": MUSIC_CATEGORY_ID,
            "maxResults": min(limit, YOUTUBE_MAX_RESULTS),
        },
    )
    items = [i for i in body.get("items", []) if (i.get("id") or {}).get("videoId")]
    details = await _details([i["id"]["videoId"] for i in items])

    out = []
    for item in items:
        detail = details.get(item["id"]["videoId"], {})
        if not playable(detail, country):
            continue
        out.append({**item, "_duration_ms": detail.get("duration_ms")})
    return out


async def _details(video_ids: list[str]) -> dict[str, dict[str, Any]]:
    """재생 길이와 재생 가능 여부. part 를 몇 개 넣든 videos.list 는 1 유닛이다."""
    if not video_ids:
        return {}
    body = await _get(
        "/videos",
        {
            "part": "contentDetails,status",
            "id": ",".join(video_ids[:YOUTUBE_MAX_RESULTS]),
        },
    )
    out: dict[str, dict[str, Any]] = {}
    for i in body.get("items", []):
        content = i.get("contentDetails") or {}
        out[i["id"]] = {
            "duration_ms": parse_duration(content.get("duration")),
            "region": content.get("regionRestriction") or {},
            "embeddable": (i.get("status") or {}).get("embeddable", True),
        }
    return out


def playable(detail: dict[str, Any], country: str) -> bool:
    """embed 재생이 되는가.

    play_url 이 embed URL 이라 embeddable=false 면 어느 나라에서도 안 나온다.
    지역 제한은 allowed 가 있으면 화이트리스트, 없으면 blocked 가 블랙리스트다.

    ponytail: 단일 국가 가정 - 판정을 저장할 때 한 번만 한다. 국가별로 서비스하려면
    tracks 에 allowed/blocked regions 컬럼을 두고 조회 시 필터로 전환할 것.
    """
    if not detail.get("embeddable", True):
        return False
    region = detail.get("region") or {}
    allowed = region.get("allowed")
    if allowed is not None:
        return country in allowed
    return country not in (region.get("blocked") or ())


def to_track(item: dict[str, Any]) -> dict[str, Any]:
    video_id = item["id"]["videoId"]
    snippet = item.get("snippet") or {}
    return {
        "source": SourceType.YOUTUBE,
        "source_id": video_id,
        "title": html.unescape(snippet.get("title") or ""),
        "artist": html.unescape(snippet.get("channelTitle") or ""),
        "duration_ms": item.get("_duration_ms"),
        "thumbnail_url": _thumbnail(snippet),
        "play_url": f"{EMBED}/{video_id}",
        # 키를 빼면 upsert 의 excluded 가 기본값(NULL)을 집어넣어 기존 행을 덮는다.
        # YouTube 에 없는 값은 명시적으로 None 이어야 한다.
        "artist_source_id": snippet.get("channelId"),
        "genre": None,  # search.list 에 장르 없음. categoryId 는 전부 10(Music)
        # publishedAt 은 발매일이 아니라 업로드 날짜다. 재업로드·커버·공식 발매
        # 몇 년 뒤 업로드가 섞여서 정렬 기준으로 못 쓴다.
        "release_date": None,
        "disc_number": None,
        "track_number": None,
    }

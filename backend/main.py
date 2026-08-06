from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any
from urllib.parse import quote, urlencode

import httpx
from fastapi import Depends, FastAPI, Query, Request
from fastapi.exceptions import HTTPException, RequestValidationError
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import spotify
from .config import SPOTIFY_SCOPES, get_settings
from .sessions import (
    SESSION_COOKIE,
    STATE_COOKIE,
    create_session,
    destroy_session,
    get_session,
    new_id,
    set_session,
)
from .spotify import SpotifyError, authorize_url, exchange_code, spotify_fetch, valid_access_token

settings = get_settings()

COOKIE_OPTS: dict[str, Any] = {"httponly": True, "samesite": "lax", "path": "/"}

MAX_LIMIT = 10


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with httpx.AsyncClient(timeout=15.0) as client:
        spotify.set_client(client)
        missing = settings.missing_spotify_config()
        print(f"server  http://127.0.0.1:{settings.server_port}")
        print(f"client  {settings.client_origin}")
        print(f"redirect URI (Dashboard 에 등록 필요)  {settings.spotify_redirect_uri}")
        if missing:
            print(f".env 누락: {', '.join(missing)} - 로그인 불가")
        yield
        spotify.set_client(None)


app = FastAPI(title="Jungle Music API", lifespan=lifespan)


@app.exception_handler(HTTPException)
async def http_error(request: Request, exc: HTTPException) -> JSONResponse:
    detail = exc.detail
    payload = detail if isinstance(detail, dict) else {"error": detail}
    return JSONResponse(payload, status_code=exc.status_code, headers=exc.headers)


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
    first = exc.errors()[0]
    field = ".".join(str(p) for p in first["loc"][1:]) or "요청"
    return JSONResponse({"error": f"{field}: {first['msg']}"}, status_code=422)


@app.exception_handler(SpotifyError)
async def spotify_error(request: Request, exc: SpotifyError) -> JSONResponse:
    if exc.status == 401:
        destroy_session(request.cookies.get(SESSION_COOKIE))
    return JSONResponse({"error": exc.message, "detail": exc.body}, status_code=exc.status)


class Auth(BaseModel):
    sid: str
    token: str


async def require_auth(request: Request) -> Auth:
    """세션에서 유효한 access token 을 꺼낸다. 없으면 401."""
    sid = request.cookies.get(SESSION_COOKIE)
    session = get_session(sid)
    if not sid or not session:
        raise HTTPException(401, {"error": "로그인이 필요합니다", "loggedIn": False})
    return Auth(sid=sid, token=await valid_access_token(sid, session))


AuthDep = Depends(require_auth)


@app.get("/api/health")
async def health() -> dict[str, Any]:
    missing = settings.missing_spotify_config()
    return {"ok": True, "configured": not missing, "missing": missing}


@app.get("/api/auth/login")
async def login() -> RedirectResponse:
    missing = settings.missing_spotify_config()
    if missing:
        raise HTTPException(
            500, f".env 설정 누락: {', '.join(missing)}. .env.example 을 복사해서 채우세요."
        )
    state = new_id()
    res = RedirectResponse(authorize_url(state, SPOTIFY_SCOPES), status_code=302)
    res.set_cookie(STATE_COOKIE, state, max_age=600, **COOKIE_OPTS)
    return res


@app.get("/api/auth/callback")
async def callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
) -> RedirectResponse:
    def fail(reason: str) -> RedirectResponse:
        return RedirectResponse(f"{settings.client_origin}/?auth_error={quote(reason)}", 302)

    if error:
        return fail(error)
    if not code:
        return fail("missing_code")
    if not state or state != request.cookies.get(STATE_COOKIE):
        return fail("state_mismatch")

    try:
        tokens = await exchange_code(code)
    except SpotifyError as exc:
        return fail(exc.message)

    sid = create_session(tokens)
    res = RedirectResponse(settings.client_origin, 302)
    res.delete_cookie(STATE_COOKIE, path="/")
    res.set_cookie(SESSION_COOKIE, sid, max_age=30 * 24 * 3600, **COOKIE_OPTS)
    return res


@app.post("/api/auth/logout")
async def logout(request: Request) -> JSONResponse:
    destroy_session(request.cookies.get(SESSION_COOKIE))
    res = JSONResponse({"ok": True})
    res.delete_cookie(SESSION_COOKIE, path="/")
    return res


@app.get("/api/auth/me")
async def me(request: Request) -> dict[str, Any]:
    """로그인 유저 정보. product 가 'premium' 이 아니면 SDK 재생이 불가능하다."""
    sid = request.cookies.get(SESSION_COOKIE)
    session = get_session(sid)
    if not sid or not session:
        return {"loggedIn": False}

    token = await valid_access_token(sid, session)
    profile = await spotify_fetch(token, "/me")
    images = profile.get("images") or []
    return {
        "loggedIn": True,
        "id": profile.get("id"),
        "displayName": profile.get("display_name"),
        "product": profile.get("product"),
        "image": images[0]["url"] if images else None,
    }


@app.get("/api/auth/token")
async def token(auth: Auth = AuthDep) -> dict[str, str]:
    """Web Playback SDK 가 브라우저에서 직접 써야 하는 access token."""
    return {"accessToken": auth.token}


@app.get("/api/search")
async def search(
    q: str = "",
    type: str = "track",
    limit: int = Query(MAX_LIMIT, ge=1, le=MAX_LIMIT),
    auth: Auth = AuthDep,
) -> dict[str, Any]:
    q = q.strip()
    if not q:
        return {"tracks": [], "artists": []}
    if type not in ("track", "artist", "track,artist"):
        raise HTTPException(400, f"지원하지 않는 type: {type}")

    params = urlencode({"q": q, "type": type, "limit": limit, "market": await user_market(auth)})
    data = await spotify_fetch(auth.token, f"/search?{params}")

    return {
        "tracks": [to_track(t) for t in (data.get("tracks") or {}).get("items", [])],
        "artists": [to_artist(a) for a in (data.get("artists") or {}).get("items", [])],
    }


@app.get("/api/artists/{artist_id}/top-tracks")
async def artist_top_tracks(artist_id: str, auth: Auth = AuthDep) -> dict[str, Any]:
    market = await user_market(auth)
    try:
        data = await spotify_fetch(auth.token, f"/artists/{artist_id}/top-tracks?market={market}")
        tracks = data.get("tracks", [])
    except SpotifyError as exc:
        if exc.status not in (403, 404):
            raise
        tracks = await tracks_by_artist_search(auth, artist_id, market)
    return {"tracks": [to_track(t) for t in tracks]}


async def tracks_by_artist_search(
    auth: Auth, artist_id: str, market: str
) -> list[dict[str, Any]]:
    """
    top-tracks 는 Development Mode 앱에서 403 Forbidden 이 난다 (market 무관).
    아티스트 이름으로 트랙을 검색해 대체하고, 해당 아티스트 곡만 남긴다.
    Extended Quota 승인 후에는 이 경로를 타지 않는다.
    """
    artist = await spotify_fetch(auth.token, f"/artists/{artist_id}")
    params = urlencode(
        {
            "q": f'artist:"{artist.get("name", "")}"',
            "type": "track",
            "limit": MAX_LIMIT,
            "market": market,
        }
    )
    data = await spotify_fetch(auth.token, f"/search?{params}")
    items = (data.get("tracks") or {}).get("items", [])
    exact = [t for t in items if any(a.get("id") == artist_id for a in t.get("artists", []))]
    return exact or items


class TransferBody(BaseModel):
    deviceId: str


class PlayBody(BaseModel):
    deviceId: str
    uris: list[str] | None = None
    contextUri: str | None = None
    offset: dict[str, Any] | None = None
    positionMs: int | None = None


@app.put("/api/player/transfer")
async def transfer(body: TransferBody, auth: Auth = AuthDep) -> dict[str, bool]:
    """SDK 로 만든 브라우저 플레이어를 활성 디바이스로 넘긴다."""
    await spotify_fetch(
        auth.token, "/me/player", "PUT", {"device_ids": [body.deviceId], "play": False}
    )
    return {"ok": True}


@app.put("/api/player/play")
async def play(body: PlayBody, auth: Auth = AuthDep) -> dict[str, bool]:
    payload: dict[str, Any] = {}
    if body.contextUri:
        payload["context_uri"] = body.contextUri
    if body.uris:
        payload["uris"] = body.uris
    if body.offset is not None:
        payload["offset"] = body.offset
    if body.positionMs is not None:
        payload["position_ms"] = body.positionMs

    await spotify_fetch(
        auth.token, f"/me/player/play?device_id={quote(body.deviceId, safe='')}", "PUT", payload
    )
    return {"ok": True}


@app.get("/api/player/devices")
async def devices(auth: Auth = AuthDep) -> dict[str, Any]:
    """
    진단용. Spotify 가 인식 중인 기기 목록과 현재 재생 상태를 그대로 보여준다.
    브라우저에서 http://127.0.0.1:5173/api/player/devices 로 열면 된다.
    """
    device_list = await spotify_fetch(auth.token, "/me/player/devices")
    playback = await spotify_fetch(auth.token, "/me/player")
    item = (playback or {}).get("item") or {}
    return {
        "devices": [
            {
                "id": d.get("id"),
                "name": d.get("name"),
                "type": d.get("type"),
                "isActive": d.get("is_active"),
                "isRestricted": d.get("is_restricted"),
                "volumePercent": d.get("volume_percent"),
            }
            for d in (device_list or {}).get("devices", [])
        ],
        "playback": None
        if not playback
        else {
            "isPlaying": playback.get("is_playing"),
            "progressMs": playback.get("progress_ms"),
            "track": item.get("name"),
            "deviceName": (playback.get("device") or {}).get("name"),
            "deviceId": (playback.get("device") or {}).get("id"),
        },
    }


@app.put("/api/player/pause")
async def pause(deviceId: str = "", auth: Auth = AuthDep) -> dict[str, bool]:
    if not deviceId:
        raise HTTPException(400, "deviceId 필요")
    await spotify_fetch(auth.token, f"/me/player/pause?device_id={quote(deviceId, safe='')}", "PUT")
    return {"ok": True}


async def user_market(auth: Auth) -> str:
    """
    검색/top-tracks 는 market 이 있어야 재생 가능한 버전으로 relink 된다.
    `from_token` 대신 유저 국가를 한 번만 조회해 세션에 캐시한다.
    """
    session = get_session(auth.sid)
    if session and session.get("country"):
        return session["country"]
    profile = await spotify_fetch(auth.token, "/me")
    country = profile.get("country") or "US"
    if session:
        set_session(auth.sid, {**session, "country": country})
    return country


def to_track(t: dict[str, Any]) -> dict[str, Any]:
    album = t.get("album")
    return {
        "id": t.get("id"),
        "uri": t.get("uri"),
        "name": t.get("name"),
        "durationMs": t.get("duration_ms"),
        "explicit": t.get("explicit"),
        "album": album
        and {
            "id": album.get("id"),
            "name": album.get("name"),
            "image": pick_image(album.get("images")),
        },
        "artists": [{"id": a.get("id"), "name": a.get("name")} for a in t.get("artists", [])],
    }


def to_artist(a: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": a.get("id"),
        "uri": a.get("uri"),
        "name": a.get("name"),
        "followers": (a.get("followers") or {}).get("total", 0),
        "genres": a.get("genres", []),
        "image": pick_image(a.get("images")),
    }


def pick_image(images: list[dict[str, Any]] | None) -> str | None:
    if not images:
        return None
    small = next((i for i in images if i.get("width") and i["width"] <= 400), None)
    return (small or images[-1])["url"]


_dist = Path(__file__).resolve().parent.parent / "dist"
if _dist.is_dir():
    app.mount("/", StaticFiles(directory=_dist, html=True), name="static")

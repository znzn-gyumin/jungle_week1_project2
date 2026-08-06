import base64
import time
from typing import Any
from urllib.parse import urlencode

import httpx

from .config import get_settings
from .sessions import set_session

settings = get_settings()

ACCOUNTS = "https://accounts.spotify.com"
API = "https://api.spotify.com/v1"

_client: httpx.AsyncClient | None = None


class SpotifyError(Exception):
    """Spotify 응답 오류. status 를 그대로 클라이언트에 전달하기 위해 보존한다."""

    def __init__(self, message: str, status: int, body: Any = None):
        super().__init__(message)
        self.message = message
        self.status = status
        self.body = body


def set_client(client: httpx.AsyncClient | None) -> None:
    global _client
    _client = client


def _http() -> httpx.AsyncClient:
    if _client is None:
        raise RuntimeError("HTTP client 미초기화 — lifespan 이 실행되지 않았다")
    return _client


def _basic_auth() -> str:
    raw = f"{settings.spotify_client_id}:{settings.spotify_client_secret}".encode()
    return base64.b64encode(raw).decode()


def _to_tokens(body: dict[str, Any], fallback_refresh: str | None = None) -> dict[str, Any]:
    return {
        "access_token": body["access_token"],
        # 리프레시 응답에는 refresh_token 이 없을 수 있다. 그때는 기존 것을 유지한다.
        "refresh_token": body.get("refresh_token") or fallback_refresh,
        # 만료 60초 전을 만료로 취급해 경계 상황을 피한다.
        "expires_at": time.time() + body.get("expires_in", 3600) - 60,
    }


async def _token_request(form: dict[str, str]) -> dict[str, Any]:
    res = await _http().post(
        f"{ACCOUNTS}/api/token",
        data=form,
        headers={
            "Authorization": f"Basic {_basic_auth()}",
            "Content-Type": "application/x-www-form-urlencoded",
        },
    )
    body = res.json()
    if res.status_code >= 400:
        raise SpotifyError(body.get("error_description") or "token request failed", res.status_code, body)
    return body


async def exchange_code(code: str) -> dict[str, Any]:
    """Authorization Code 를 access/refresh 토큰으로 교환한다."""
    body = await _token_request(
        {
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": settings.spotify_redirect_uri,
        }
    )
    return _to_tokens(body)


async def refresh(refresh_token: str) -> dict[str, Any]:
    body = await _token_request({"grant_type": "refresh_token", "refresh_token": refresh_token})
    return _to_tokens(body, refresh_token)


async def valid_access_token(sid: str, session: dict[str, Any]) -> str:
    """세션의 access token 을 반환하고, 만료가 임박하면 먼저 갱신한다."""
    if time.time() < session["expires_at"]:
        return session["access_token"]
    tokens = await refresh(session["refresh_token"])
    set_session(sid, {**session, **tokens})
    return tokens["access_token"]


async def spotify_fetch(
    access_token: str,
    path: str,
    method: str = "GET",
    json: Any = None,
) -> Any:
    """Spotify Web API 호출 래퍼. 204/빈 본문도 안전하게 처리한다."""
    res = await _http().request(
        method,
        f"{API}{path}",
        json=json,
        headers={"Authorization": f"Bearer {access_token}"},
    )

    data: Any = None
    if res.content:
        try:
            data = res.json()
        except ValueError:
            data = {"raw": res.text}

    if res.status_code >= 400:
        message = "Spotify %d" % res.status_code
        if isinstance(data, dict):
            err = data.get("error")
            if isinstance(err, dict) and err.get("message"):
                message = err["message"]
            elif isinstance(err, str):
                message = data.get("error_description") or err
        raise SpotifyError(message, res.status_code, data)

    return data


def authorize_url(state: str, scope: str) -> str:
    params = urlencode(
        {
            "client_id": settings.spotify_client_id,
            "response_type": "code",
            "redirect_uri": settings.spotify_redirect_uri,
            "scope": scope,
            "state": state,
        }
    )
    return f"{ACCOUNTS}/authorize?{params}"

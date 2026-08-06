import secrets
from typing import Any

# MVP 용 인메모리 세션 저장소. 서버를 재시작하면 로그인도 사라진다.
# 실서비스로 가면 Redis 나 DB 로 교체할 자리.
_sessions: dict[str, dict[str, Any]] = {}

SESSION_COOKIE = "sid"
STATE_COOKIE = "oauth_state"


def new_id() -> str:
    return secrets.token_hex(24)


def create_session(data: dict[str, Any]) -> str:
    sid = new_id()
    _sessions[sid] = data
    return sid


def get_session(sid: str | None) -> dict[str, Any] | None:
    return _sessions.get(sid) if sid else None


def set_session(sid: str, data: dict[str, Any]) -> None:
    _sessions[sid] = data


def destroy_session(sid: str | None) -> None:
    if sid:
        _sessions.pop(sid, None)

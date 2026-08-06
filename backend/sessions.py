import secrets
from typing import Any

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

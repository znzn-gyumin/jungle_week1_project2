"""프로세스 메모리에 사는 세션 저장소. 재시작하면 전부 날아간다."""

import secrets
from typing import Any

_sessions: dict[str, dict[str, Any]] = {}


def new_id() -> str:
    return secrets.token_hex(24)


def create_session(data: dict[str, Any]) -> str:
    sid = new_id()
    _sessions[sid] = data
    return sid


def get_session(sid: str | None) -> dict[str, Any] | None:
    return _sessions.get(sid) if sid else None


def destroy_session(sid: str | None) -> None:
    if sid:
        _sessions.pop(sid, None)

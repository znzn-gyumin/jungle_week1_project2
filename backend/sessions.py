"""프로세스 메모리에 사는 세션 저장소. 재시작하면 전부 날아간다.

항목마다 만료 시각을 들고 있어서, 만료된 세션은 조회 시점에 사라지고
새 세션을 만들 때 남은 찌꺼기를 한 번씩 청소한다. 그래도 여전히
단일 워커 전용이다 - 멀티 워커나 영속 세션이 필요하면 Redis/DB 로 옮길 것.
"""

import secrets
import time
from typing import Any

# 쿠키 max_age 와 같은 수명. accounts.USER_COOKIE_OPTS 가 이 값을 그대로 쓴다.
SESSION_TTL = 30 * 24 * 3600

_sessions: dict[str, tuple[float, dict[str, Any]]] = {}


def new_id() -> str:
    return secrets.token_hex(24)


def _purge(now: float) -> None:
    for sid in [sid for sid, (expires_at, _) in _sessions.items() if expires_at <= now]:
        _sessions.pop(sid, None)


def create_session(data: dict[str, Any]) -> str:
    now = time.monotonic()
    _purge(now)
    sid = new_id()
    _sessions[sid] = (now + SESSION_TTL, data)
    return sid


def get_session(sid: str | None) -> dict[str, Any] | None:
    if not sid:
        return None
    entry = _sessions.get(sid)
    if entry is None:
        return None
    expires_at, data = entry
    if expires_at <= time.monotonic():
        _sessions.pop(sid, None)
        return None
    return data


def destroy_session(sid: str | None) -> None:
    if sid:
        _sessions.pop(sid, None)


def active_count() -> int:
    """살아 있는 세션 수. 운영 점검·테스트용."""
    _purge(time.monotonic())
    return len(_sessions)

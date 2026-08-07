"""프로세스 메모리에 사는 세션 저장소. 재시작하면 전부 날아간다.

항목마다 만료 시각을 들고 있어서, 만료된 세션은 조회 시점에 사라지고
새 세션을 만들 때 남은 찌꺼기를 한 번씩 청소한다. 유저별 색인도 같이 들고 있어서
비밀번호 변경·계정 삭제 때 그 유저의 세션을 한 번에 파기할 수 있다.

그래도 여전히 단일 워커 전용이다 - 멀티 워커나 영속 세션이 필요하면
Redis/DB 로 옮길 것.
"""

import secrets
import time
from typing import Any

# 쿠키 max_age 와 같은 수명. accounts.USER_COOKIE_OPTS 가 이 값을 그대로 쓴다.
SESSION_TTL = 30 * 24 * 3600

_sessions: dict[str, tuple[float, dict[str, Any]]] = {}
_by_user: dict[int, set[str]] = {}


def new_id() -> str:
    return secrets.token_hex(24)


def _unindex(sid: str, data: dict[str, Any]) -> None:
    user_id = data.get("userId")
    bucket = _by_user.get(user_id)
    if bucket is None:
        return
    bucket.discard(sid)
    if not bucket:
        _by_user.pop(user_id, None)


def _forget(sid: str) -> None:
    entry = _sessions.pop(sid, None)
    if entry is not None:
        _unindex(sid, entry[1])


def _purge(now: float) -> None:
    for sid in [sid for sid, (expires_at, _) in _sessions.items() if expires_at <= now]:
        _forget(sid)


def create_session(data: dict[str, Any]) -> str:
    now = time.monotonic()
    _purge(now)
    sid = new_id()
    _sessions[sid] = (now + SESSION_TTL, data)
    user_id = data.get("userId")
    if user_id is not None:
        _by_user.setdefault(user_id, set()).add(sid)
    return sid


def get_session(sid: str | None) -> dict[str, Any] | None:
    if not sid:
        return None
    entry = _sessions.get(sid)
    if entry is None:
        return None
    expires_at, data = entry
    if expires_at <= time.monotonic():
        _forget(sid)
        return None
    return data


def destroy_session(sid: str | None) -> None:
    if sid:
        _forget(sid)


def destroy_user_sessions(user_id: int, keep: str | None = None) -> int:
    """한 유저의 세션을 통째로 파기한다. keep 에 준 sid 하나만 남긴다.

    비밀번호를 바꾼 뒤 다른 기기·탈취된 쿠키가 계속 살아 있으면 안 되므로,
    비밀번호 변경과 계정 삭제가 이걸 부른다. 반환값은 파기한 세션 수.
    """
    doomed = [sid for sid in _by_user.get(user_id, set()) if sid != keep]
    for sid in doomed:
        _forget(sid)
    return len(doomed)


def active_count() -> int:
    """살아 있는 세션 수. 운영 점검·테스트용."""
    _purge(time.monotonic())
    return len(_sessions)

"""로그인 시도 제한. 세션 저장소와 같은 한계를 공유한다 - 프로세스 메모리, 단일 워커 전용.

고정 창(fixed window) 카운터다. 창 안에서 실패가 MAX_ATTEMPTS 에 닿으면
창이 끝날 때까지 비밀번호가 맞아도 거절한다(fail closed). 성공하면 카운터를 지운다.
"""

import time

LOGIN_MAX_ATTEMPTS = 10
LOGIN_WINDOW = 300.0  # 초

# key -> (창 시작 시각, 실패 횟수)
_failures: dict[tuple[str, str], tuple[float, int]] = {}


def _purge(now: float) -> None:
    for key in [k for k, (started, _) in _failures.items() if now - started >= LOGIN_WINDOW]:
        _failures.pop(key, None)


def retry_after(key: tuple[str, str]) -> float:
    """제한에 걸렸으면 남은 초, 아니면 0."""
    entry = _failures.get(key)
    if entry is None:
        return 0.0
    started, count = entry
    remaining = LOGIN_WINDOW - (time.monotonic() - started)
    if remaining <= 0:
        _failures.pop(key, None)
        return 0.0
    return remaining if count >= LOGIN_MAX_ATTEMPTS else 0.0


def record_failure(key: tuple[str, str]) -> int:
    now = time.monotonic()
    _purge(now)
    started, count = _failures.get(key, (now, 0))
    if now - started >= LOGIN_WINDOW:
        started, count = now, 0
    _failures[key] = (started, count + 1)
    return count + 1


def clear(key: tuple[str, str]) -> None:
    _failures.pop(key, None)


def reset_all() -> None:
    """테스트용."""
    _failures.clear()

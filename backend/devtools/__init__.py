"""
배포 전 삭제 대상.

지우는 방법은 두 가지다.

1. 코드를 남긴 채 끄기 — `.env` 에 `DEV_TOOLS=false`
2. 완전히 걷어내기 — 이 디렉터리(`backend/devtools/`)를 통째로 지우고,
   `backend/main.py` 에서 `install_devtools` 를 임포트하는 줄과 호출하는 줄을 지운다.
   `backend/config.py` 의 `dev_tools` 필드도 그때 같이 지운다.

이 패키지는 제품 코드를 **한 방향으로만** 참조한다. 여기 있는 것을 제품 코드가
임포트하는 곳은 없으므로 지워도 다른 모듈이 깨지지 않는다.

다만 `integration_test.py` 는 `backend/schema.sql` 을 검증하는 유일한 수단이다.
이 디렉터리를 지우기 전에 그 파일을 옮길 곳을 먼저 정할 것.
자세한 내용은 `docs/junho_dev/05-verification.md`.
"""

import httpx
from fastapi import FastAPI

from backend.config import get_settings
from backend.devtools import itunes
from backend.devtools.catalog import router as catalog_router


def install_devtools(app: FastAPI) -> None:
    if not get_settings().dev_tools:
        return
    client = httpx.AsyncClient(timeout=15.0)
    itunes.set_client(client)
    app.include_router(catalog_router)
    app.router.on_shutdown.append(client.aclose)

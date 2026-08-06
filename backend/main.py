import logging
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException

from backend.api import albums, health, search, tracks
from backend.config import get_settings
from backend.db.session import engine
from backend.routers import likes_router, playlists_router, users_router
from backend.sources import itunes, youtube

settings = get_settings()
log = logging.getLogger("uvicorn.error")


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            itunes.set_client(client)
            youtube.set_client(client)
            log.info("server  http://%s:%s", settings.server_host, settings.server_port)
            log.info("client  %s", ", ".join(settings.allowed_origins))
            if not youtube.configured():
                log.warning("YOUTUBE_API_KEY 없음 - YouTube 검색 비활성")
            yield
    finally:
        itunes.set_client(None)
        youtube.set_client(None)
        await engine.dispose()


app = FastAPI(title="Flowbee API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(HTTPException)
async def http_error(request: Request, exc: HTTPException) -> JSONResponse:
    detail = exc.detail
    payload = detail if isinstance(detail, dict) else {"error": detail}
    return JSONResponse(payload, status_code=exc.status_code, headers=exc.headers)


@app.exception_handler(RequestValidationError)
async def validation_error(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    first = exc.errors()[0]
    field = ".".join(str(p) for p in first["loc"][1:]) or "요청"
    return JSONResponse({"error": f"{field}: {first['msg']}"}, status_code=422)


@app.exception_handler(Exception)
async def unhandled_error(request: Request, exc: Exception) -> JSONResponse:
    """핸들되지 않은 예외도 {"error": ...} 계약을 지키게 한다.

    Starlette 는 이 핸들러의 응답을 보낸 뒤 예외를 다시 raise 하므로
    스택트레이스는 uvicorn 로그에 그대로 남는다.
    """
    log.exception("unhandled error: %s %s", request.method, request.url.path)
    return JSONResponse({"error": "서버 내부 오류가 발생했습니다"}, status_code=500)


app.include_router(health.router)
app.include_router(albums.router)
app.include_router(search.router)
app.include_router(tracks.router)
app.include_router(users_router)
app.include_router(playlists_router)
app.include_router(likes_router)

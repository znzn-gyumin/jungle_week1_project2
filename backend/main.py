from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Request
from fastapi.exceptions import HTTPException, RequestValidationError
from fastapi.responses import JSONResponse

from backend.api import albums, health, search, tracks
from backend.config import get_settings
from backend.db.session import engine
from backend.sources import itunes, youtube
from backend.sources.itunes import ITunesError
from backend.sources.youtube import YouTubeError

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with httpx.AsyncClient(timeout=15.0) as client:
        itunes.set_client(client)
        youtube.set_client(client)
        print(f"server  http://127.0.0.1:{settings.server_port}")
        print(f"client  {settings.client_origin}")
        if not youtube.configured():
            print("YOUTUBE_API_KEY 없음 - YouTube 검색 비활성")
        yield
        itunes.set_client(None)
        youtube.set_client(None)
    await engine.dispose()


app = FastAPI(title="Flowbee API", lifespan=lifespan)


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


@app.exception_handler(ITunesError)
async def itunes_error(request: Request, exc: ITunesError) -> JSONResponse:
    return JSONResponse({"error": exc.message}, status_code=exc.status)


@app.exception_handler(YouTubeError)
async def youtube_error(request: Request, exc: YouTubeError) -> JSONResponse:
    return JSONResponse({"error": exc.message}, status_code=exc.status)


app.include_router(health.router)
app.include_router(albums.router)
app.include_router(search.router)
app.include_router(tracks.router)

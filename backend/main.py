import asyncio
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import httpx
from fastapi import Depends, FastAPI, Query, Request
from fastapi.exceptions import HTTPException, RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from . import itunes, repository, youtube
from .config import get_settings
from .db.session import engine, get_db
from .itunes import ITunesError
from .models import Track
from .models.enums import SourceType
from .youtube import YouTubeError

settings = get_settings()

MAX_LIMIT = 50
SOURCES = ("itunes", "youtube", "all")


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
async def validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
    first = exc.errors()[0]
    field = ".".join(str(p) for p in first["loc"][1:]) or "요청"
    return JSONResponse({"error": f"{field}: {first['msg']}"}, status_code=422)


@app.exception_handler(ITunesError)
async def itunes_error(request: Request, exc: ITunesError) -> JSONResponse:
    return JSONResponse({"error": exc.message}, status_code=exc.status)


@app.exception_handler(YouTubeError)
async def youtube_error(request: Request, exc: YouTubeError) -> JSONResponse:
    return JSONResponse({"error": exc.message}, status_code=exc.status)


def serialize(track: Track) -> dict[str, Any]:
    return {
        "id": track.id,
        "source": track.source.value,
        "sourceId": track.source_id,
        "title": track.title,
        "artist": track.artist,
        "durationMs": track.duration_ms,
        "thumbnailUrl": track.thumbnail_url,
        "playUrl": track.play_url,
    }


@app.get("/api/health")
async def health() -> dict[str, Any]:
    return {"ok": True, "youtube": youtube.configured()}


@app.get("/api/health/db")
async def health_db(db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    tables = (
        await db.execute(
            text(
                "SELECT count(*) FROM information_schema.tables "
                "WHERE table_schema = 'public'"
            )
        )
    ).scalar()
    return {"ok": True, "tables": tables}


async def _itunes_tracks(db: AsyncSession, q: str, limit: int) -> list[Track]:
    results = await itunes.search_tracks(q, limit=limit, country=settings.itunes_country)
    if not results:
        return []

    albums = [itunes.to_album(r) for r in results if itunes.album_source_id(r)]
    album_ids = await repository.upsert_albums(db, albums)

    rows = []
    for r in results:
        row = itunes.to_track(r)
        row["album_id"] = album_ids.get(itunes.album_source_id(r) or "")
        rows.append(row)
    return await repository.upsert_tracks(db, rows)


async def _youtube_tracks(db: AsyncSession, q: str, limit: int) -> list[Track]:
    items = await youtube.search_videos(q, limit=limit)
    return await repository.upsert_tracks(db, [youtube.to_track(i) for i in items])


@app.get("/api/search")
async def search(
    q: str = "",
    source: str = "all",
    limit: int = Query(25, ge=1, le=MAX_LIMIT),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    q = q.strip()
    if not q:
        return {"tracks": [], "errors": []}
    if source not in SOURCES:
        raise HTTPException(400, f"지원하지 않는 source: {source}")

    wanted = ("itunes", "youtube") if source == "all" else (source,)
    tasks = []
    if "itunes" in wanted:
        tasks.append(("itunes", _itunes_tracks(db, q, limit)))
    if "youtube" in wanted and youtube.configured():
        tasks.append(("youtube", _youtube_tracks(db, q, limit)))

    done = await asyncio.gather(*(t for _, t in tasks), return_exceptions=True)

    tracks: list[Track] = []
    errors: list[dict[str, str]] = []
    for (name, _), result in zip(tasks, done):
        if isinstance(result, BaseException):
            message = getattr(result, "message", None) or str(result)
            errors.append({"source": name, "error": message})
        else:
            tracks.extend(result)

    if not tracks and errors:
        raise HTTPException(502, {"error": errors[0]["error"], "errors": errors})

    return {"tracks": [serialize(t) for t in tracks], "errors": errors}


@app.get("/api/tracks/{track_id}")
async def get_track(track_id: int, db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    track = await db.get(Track, track_id)
    if track is None:
        raise HTTPException(404, "곡을 찾을 수 없습니다")
    return serialize(track)


@app.get("/api/tracks")
async def list_tracks(
    q: str | None = None,
    source: str | None = None,
    limit: int = Query(25, ge=1, le=MAX_LIMIT),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    if source is not None and source not in ("itunes", "youtube"):
        raise HTTPException(400, f"지원하지 않는 source: {source}")
    rows = await repository.list_tracks(
        db,
        query=q,
        source=SourceType(source) if source else None,
        limit=limit,
    )
    return {"tracks": [serialize(t) for t in rows]}


_dist = Path(__file__).resolve().parent.parent / "dist"
if _dist.is_dir():
    app.mount("/", StaticFiles(directory=_dist, html=True), name="static")

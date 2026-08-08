from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api import DEFAULT_LIMIT, MAX_LIMIT
from backend.db import repository
from backend.db.session import get_db
from backend.schemas import AlbumDetailOut, AlbumListResponse, AlbumOut
from backend.services import albums as album_service
from backend.services import search as search_service
from backend.sources.itunes import ITunesError

router = APIRouter(prefix="/api/albums", tags=["albums"])


@router.get("", response_model=AlbumListResponse)
async def list_albums(
    q: str | None = None,
    limit: int = Query(DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    db: AsyncSession = Depends(get_db),
) -> AlbumListResponse:
    rows = await repository.list_albums(db, query=q, limit=limit)
    return AlbumListResponse(albums=[AlbumOut.model_validate(a) for a in rows])


# /{album_id} 보다 먼저 걸어야 한다. 아래에 두면 "top"/"latest" 가 int 로 파싱돼 422 가 난다.
@router.get("/top", response_model=AlbumListResponse)
async def top_albums(
    limit: int = Query(20, ge=1, le=MAX_LIMIT),
    db: AsyncSession = Depends(get_db),
) -> AlbumListResponse:
    albums, errors = await search_service.top_albums(db, limit)
    if not albums:
        error = errors[0]["error"] if errors else "인기 앨범을 불러오지 못했다"
        raise HTTPException(502, {"error": error, "errors": errors})
    return AlbumListResponse(albums=[AlbumOut.model_validate(a) for a in albums])


@router.get("/latest", response_model=AlbumListResponse)
async def latest_albums(
    q: str = Query(
        search_service.LATEST_QUERY,
        min_length=1,
        max_length=search_service.MAX_QUERY_LENGTH,
    ),
    limit: int = Query(DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    db: AsyncSession = Depends(get_db),
) -> AlbumListResponse:
    albums, errors = await search_service.latest_albums(db, q.strip(), limit)
    if not albums:
        error = errors[0]["error"] if errors else "최신 앨범을 불러오지 못했다"
        raise HTTPException(502, {"error": error, "errors": errors})
    return AlbumListResponse(albums=[AlbumOut.model_validate(a) for a in albums])


@router.get("/{album_id}", response_model=AlbumDetailOut)
async def get_album(album_id: int, db: AsyncSession = Depends(get_db)) -> AlbumDetailOut:
    try:
        album = await album_service.get_album_with_tracks(db, album_id)
    except ITunesError as exc:
        raise HTTPException(exc.status, exc.message) from exc
    if album is None:
        raise HTTPException(404, "앨범을 찾을 수 없습니다")
    return AlbumDetailOut.model_validate(album)

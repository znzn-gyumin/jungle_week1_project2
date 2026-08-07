from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api import DEFAULT_LIMIT, MAX_LIMIT
from backend.db import repository
from backend.db.session import get_db
from backend.schemas import AlbumDetailOut, AlbumListResponse, AlbumOut
from backend.services import albums as album_service
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


@router.get("/{album_id}", response_model=AlbumDetailOut)
async def get_album(album_id: int, db: AsyncSession = Depends(get_db)) -> AlbumDetailOut:
    try:
        album = await album_service.get_album_with_tracks(db, album_id)
    except ITunesError as exc:
        raise HTTPException(exc.status, exc.message) from exc
    if album is None:
        raise HTTPException(404, "앨범을 찾을 수 없습니다")
    return AlbumDetailOut.model_validate(album)

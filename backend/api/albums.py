from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api import DEFAULT_LIMIT, MAX_LIMIT
from backend.db import repository
from backend.db.session import get_db
from backend.schemas import album_out

router = APIRouter(prefix="/api/albums", tags=["albums"])


@router.get("")
async def list_albums(
    q: str | None = None,
    limit: int = Query(DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    rows = await repository.list_albums(db, query=q, limit=limit)
    return {"albums": [album_out(a) for a in rows]}


@router.get("/{album_id}")
async def get_album(
    album_id: int, db: AsyncSession = Depends(get_db)
) -> dict[str, Any]:
    album = await repository.get_album(db, album_id)
    if album is None:
        raise HTTPException(404, "앨범을 찾을 수 없습니다")
    return album_out(album)

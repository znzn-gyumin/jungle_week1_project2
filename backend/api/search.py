from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api import DEFAULT_LIMIT, MAX_LIMIT
from backend.db.session import get_db
from backend.schemas import AlbumOut, SearchResponse, TrackOut
from backend.services import search as search_service

router = APIRouter(prefix="/api/search", tags=["search"])

ALLOWED_SOURCES = ("all", *search_service.SOURCES)
ALLOWED_TYPES = ("track", "album")
MAX_QUERY_LENGTH = search_service.MAX_QUERY_LENGTH


@router.get("", response_model=SearchResponse)
async def search(
    # 상한은 search_cache.query 컬럼 크기와 맞춘다. 캐시 키가 검색어라서
    # 길이를 안 막으면 저장 단계에서 터진다.
    q: str = Query("", max_length=MAX_QUERY_LENGTH),
    source: str = "all",
    search_type: str = Query("track", alias="type"),
    limit: int = Query(DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    db: AsyncSession = Depends(get_db),
) -> SearchResponse:
    q = q.strip()
    if search_type not in ALLOWED_TYPES:
        raise HTTPException(400, f"지원하지 않는 type: {search_type}")
    if source not in ALLOWED_SOURCES:
        raise HTTPException(400, f"지원하지 않는 source: {source}")
    if not q:
        return SearchResponse()

    if search_type == "album":
        albums, errors = await search_service.search_albums(db, q, source, limit)
        if not albums and errors:
            raise HTTPException(502, {"error": errors[0]["error"], "errors": errors})
        return SearchResponse(
            albums=[AlbumOut.model_validate(a) for a in albums], errors=errors
        )

    tracks, errors = await search_service.search(db, q, source, limit)
    if not tracks and errors:
        raise HTTPException(502, {"error": errors[0]["error"], "errors": errors})
    return SearchResponse(
        tracks=[TrackOut.model_validate(t) for t in tracks], errors=errors
    )

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.session import get_db
from backend.schemas import DbHealthResponse, HealthResponse
from backend.sources import youtube

router = APIRouter(prefix="/api/health", tags=["health"])


@router.get("", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(ok=True, youtube=youtube.configured())


@router.get("/db", response_model=DbHealthResponse)
async def health_db(db: AsyncSession = Depends(get_db)) -> DbHealthResponse:
    tables = (
        await db.execute(
            text(
                "SELECT count(*) FROM information_schema.tables "
                "WHERE table_schema = 'public'"
            )
        )
    ).scalar_one()
    return DbHealthResponse(ok=True, tables=tables)

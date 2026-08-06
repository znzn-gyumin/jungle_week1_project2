from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.session import get_db
from backend.sources import youtube

router = APIRouter(prefix="/api/health", tags=["health"])


@router.get("")
async def health() -> dict[str, Any]:
    return {"ok": True, "youtube": youtube.configured()}


@router.get("/db")
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

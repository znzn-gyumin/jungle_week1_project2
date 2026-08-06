from typing import Any

from fastapi import Depends, Request
from fastapi.exceptions import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.session import get_db
from backend.models import User
from backend.sessions import create_session, destroy_session, get_session

USER_COOKIE = "uid"

USER_COOKIE_OPTS: dict[str, Any] = {
    "httponly": True,
    "samesite": "lax",
    "path": "/",
    "max_age": 30 * 24 * 3600,
}


def login_user(user_id: int) -> str:
    return create_session({"userId": user_id})


def logout_user(uid: str | None) -> None:
    destroy_session(uid)


async def optional_user(
    request: Request, db: AsyncSession = Depends(get_db)
) -> User | None:
    session = get_session(request.cookies.get(USER_COOKIE))
    if not session or "userId" not in session:
        return None
    return await db.scalar(select(User).where(User.id == session["userId"]))


async def current_user(user: User | None = Depends(optional_user)) -> User:
    if user is None:
        raise HTTPException(401, {"error": "로그인이 필요합니다", "loggedIn": False})
    return user


CurrentUser = Depends(current_user)
OptionalUser = Depends(optional_user)
DbSession = Depends(get_db)

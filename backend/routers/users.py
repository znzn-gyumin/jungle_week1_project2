from typing import Any

from fastapi import APIRouter, Request
from fastapi.exceptions import HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from backend.accounts import (
    USER_COOKIE,
    USER_COOKIE_OPTS,
    CurrentUser,
    DbSession,
    OptionalUser,
    login_user,
    logout_user,
)
from backend.models import Like, Playlist, User
from backend.security import hash_password, verify_password
from backend.serializers import user_out

router = APIRouter(prefix="/api/users", tags=["users"])

EMAIL_PATTERN = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"


class SignupBody(BaseModel):
    nickname: str = Field(min_length=1, max_length=30)
    email: str = Field(max_length=255, pattern=EMAIL_PATTERN)
    password: str = Field(min_length=8, max_length=128)


class LoginBody(BaseModel):
    email: str = Field(max_length=255)
    password: str = Field(max_length=128)


class UpdateBody(BaseModel):
    nickname: str | None = Field(default=None, min_length=1, max_length=30)
    email: str | None = Field(default=None, max_length=255, pattern=EMAIL_PATTERN)
    password: str | None = Field(default=None, min_length=8, max_length=128)


def _session_response(user: User, status: int = 200) -> JSONResponse:
    res = JSONResponse(
        {"loggedIn": True, **_jsonable(user_out(user))}, status_code=status
    )
    res.set_cookie(USER_COOKIE, login_user(user.id), **USER_COOKIE_OPTS)
    return res


def _jsonable(data: dict[str, Any]) -> dict[str, Any]:
    return {k: (v.isoformat() if hasattr(v, "isoformat") else v) for k, v in data.items()}


@router.post("/signup")
async def signup(body: SignupBody, db: AsyncSession = DbSession) -> JSONResponse:
    user = User(
        nickname=body.nickname.strip(),
        email=body.email.strip().lower(),
        password_hash=hash_password(body.password),
    )
    db.add(user)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        field = "이메일" if "email" in str(exc.orig) else "닉네임"
        raise HTTPException(409, f"이미 사용 중인 {field} 입니다") from exc
    await db.refresh(user)
    return _session_response(user, 201)


@router.post("/login")
async def login(body: LoginBody, db: AsyncSession = DbSession) -> JSONResponse:
    user = await db.scalar(select(User).where(User.email == body.email.strip().lower()))
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "이메일 또는 비밀번호가 올바르지 않습니다")
    return _session_response(user)


@router.post("/logout")
async def logout(request: Request) -> JSONResponse:
    logout_user(request.cookies.get(USER_COOKIE))
    res = JSONResponse({"ok": True})
    res.delete_cookie(USER_COOKIE, path="/")
    return res


@router.get("/me")
async def me(
    user: User | None = OptionalUser, db: AsyncSession = DbSession
) -> dict[str, Any]:
    if user is None:
        return {"loggedIn": False}

    playlists = await db.scalar(
        select(func.count()).select_from(Playlist).where(Playlist.user_id == user.id)
    )
    likes = await db.scalar(
        select(func.count()).select_from(Like).where(Like.user_id == user.id)
    )
    return {
        "loggedIn": True,
        **user_out(user),
        "counts": {"playlists": playlists or 0, "likes": likes or 0},
    }


@router.patch("/me")
async def update_me(
    body: UpdateBody, user: User = CurrentUser, db: AsyncSession = DbSession
) -> dict[str, Any]:
    if body.nickname is not None:
        user.nickname = body.nickname.strip()
    if body.email is not None:
        user.email = body.email.strip().lower()
    if body.password is not None:
        user.password_hash = hash_password(body.password)

    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        field = "이메일" if "email" in str(exc.orig) else "닉네임"
        raise HTTPException(409, f"이미 사용 중인 {field} 입니다") from exc
    await db.refresh(user)
    return user_out(user)


@router.delete("/me")
async def delete_me(
    request: Request, user: User = CurrentUser, db: AsyncSession = DbSession
) -> JSONResponse:
    await db.delete(user)
    await db.commit()
    logout_user(request.cookies.get(USER_COOKIE))
    res = JSONResponse({"ok": True})
    res.delete_cookie(USER_COOKIE, path="/")
    return res

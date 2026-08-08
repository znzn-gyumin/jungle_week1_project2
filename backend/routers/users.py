import secrets
from typing import Any

import certifi
import httpx
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
from backend.config import get_settings
from backend.models import Like, Playlist, User
from backend.ratelimit import clear as clear_failures
from backend.ratelimit import record_failure, retry_after
from backend.security import dummy_hash, hash_password, verify_password
from backend.serializers import user_out
from backend.sessions import destroy_user_sessions

router = APIRouter(prefix="/api/users", tags=["users"])

EMAIL_PATTERN = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"

# 제약조건 이름 -> 사용자에게 보여줄 필드명. 여기 없는 IntegrityError 는
# 중복이 아니라 다른 문제(FK · NOT NULL · CHECK)이므로 409 로 감추지 않는다.
UNIQUE_FIELDS = {
    "uq_users_email_lower": "이메일",
    "uq_users_nickname_lower": "닉네임",
}


def _conflict_field(exc: IntegrityError) -> str | None:
    orig = exc.orig
    name = getattr(orig, "constraint_name", None)
    if not name:
        # asyncpg 가 아닌 드라이버(psycopg 등) 대비 - 메시지에서 이름을 찾는다.
        text = str(orig)
        name = next((c for c in UNIQUE_FIELDS if c in text), None)
    return UNIQUE_FIELDS.get(name) if name else None


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
        field = _conflict_field(exc)
        if field is None:
            raise
        raise HTTPException(409, f"이미 사용 중인 {field} 입니다") from exc
    await db.refresh(user)
    return _session_response(user, 201)


@router.post("/login")
async def login(
    body: LoginBody, request: Request, db: AsyncSession = DbSession
) -> JSONResponse:
    email = body.email.strip().lower()
    key = (request.client.host if request.client else "-", email)

    remaining = retry_after(key)
    if remaining > 0:
        raise HTTPException(
            429,
            {"error": "로그인 시도가 너무 많습니다. 잠시 후 다시 시도하세요"},
            headers={"Retry-After": str(int(remaining) + 1)},
        )

    user = await db.scalar(select(User).where(User.email == email))
    # 유저가 없어도 같은 비용의 검증을 돌린다. 응답 시간으로 가입 여부를 알 수 없게.
    ok = verify_password(body.password, user.password_hash if user else dummy_hash())
    if not user or not ok:
        record_failure(key)
        raise HTTPException(401, "이메일 또는 비밀번호가 올바르지 않습니다")

    clear_failures(key)
    return _session_response(user)


GOOGLE_TOKENINFO = "https://oauth2.googleapis.com/tokeninfo"
GOOGLE_ISSUERS = {"accounts.google.com", "https://accounts.google.com"}


class GoogleBody(BaseModel):
    credential: str = Field(min_length=1, max_length=4096)


async def verify_google_token(credential: str) -> dict[str, Any]:
    """구글 ID 토큰을 검증하고 payload 를 돌려준다. 실패하면 빈 dict.

    JWKS 를 받아 서명을 직접 검증하는 대신 구글 tokeninfo 에 물어본다. 로그인
    때만 도는 왕복 한 번이라 값이 싸고, 서명·만료 판정을 구글에 맡길 수 있다.
    """
    # ponytail: 요청마다 클라이언트를 새로 연다. 로그인이 잦아지면 lifespan 의
    # 공용 AsyncClient 를 여기로도 넘길 것.
    async with httpx.AsyncClient(timeout=10.0, verify=certifi.where()) as http:
        res = await http.get(GOOGLE_TOKENINFO, params={"id_token": credential})
    return res.json() if res.status_code == 200 else {}


async def _create_google_user(db: AsyncSession, email: str, name: str) -> User:
    base = name.strip()[:30] or email.split("@")[0][:30]
    # 구글로만 들어오는 계정이라 아무도 모르는 비밀번호를 넣는다. NOT NULL 을
    # 채우기 위한 값이고, 이 해시와 맞는 비밀번호는 존재하지 않는다.
    password_hash = hash_password(secrets.token_urlsafe(32))

    # 구글 이름이 이미 쓰는 닉네임이면 짧은 꼬리를 붙여 다시 시도한다.
    for attempt in range(5):
        user = User(
            nickname=base if attempt == 0 else f"{base[:25]}{secrets.token_hex(2)}",
            email=email,
            password_hash=password_hash,
        )
        db.add(user)
        try:
            await db.commit()
        except IntegrityError as exc:
            await db.rollback()
            if _conflict_field(exc) != "닉네임":
                raise
            continue
        await db.refresh(user)
        return user
    raise HTTPException(409, "닉네임을 만들지 못했습니다. 잠시 후 다시 시도하세요")


@router.get("/google")
async def google_config() -> dict[str, str]:
    """프런트가 구글 버튼을 그릴 때 쓰는 공개 클라이언트 ID."""
    return {"clientId": get_settings().google_client_id}


@router.post("/google")
async def google_login(body: GoogleBody, db: AsyncSession = DbSession) -> JSONResponse:
    client_id = get_settings().google_client_id
    if not client_id:
        raise HTTPException(503, "구글 로그인이 설정되지 않았습니다")

    info = await verify_google_token(body.credential)
    # aud 를 확인하지 않으면 다른 구글 앱이 받은 토큰으로도 로그인이 된다.
    # email_verified 는 구글이 그 주소의 소유를 확인했다는 뜻이라, 이게 참일
    # 때만 같은 이메일의 기존 계정에 붙여도 안전하다.
    if (
        info.get("aud") != client_id
        or info.get("iss") not in GOOGLE_ISSUERS
        or str(info.get("email_verified")).lower() != "true"
        or not info.get("email")
    ):
        raise HTTPException(401, "구글 인증에 실패했습니다")

    email = info["email"].strip().lower()
    user = await db.scalar(select(User).where(User.email == email))
    if user is None:
        user = await _create_google_user(db, email, info.get("name") or "")
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
    body: UpdateBody,
    request: Request,
    user: User = CurrentUser,
    db: AsyncSession = DbSession,
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
        field = _conflict_field(exc)
        if field is None:
            raise
        raise HTTPException(409, f"이미 사용 중인 {field} 입니다") from exc
    await db.refresh(user)

    if body.password is not None:
        # 비밀번호를 바꿨으면 다른 기기·탈취된 쿠키의 세션은 즉시 끊는다.
        # 지금 요청을 보낸 세션 하나만 남긴다.
        destroy_user_sessions(user.id, keep=request.cookies.get(USER_COOKIE))
    return user_out(user)


@router.delete("/me")
async def delete_me(
    request: Request, user: User = CurrentUser, db: AsyncSession = DbSession
) -> JSONResponse:
    user_id = user.id
    await db.delete(user)
    await db.commit()
    # 현재 쿠키만이 아니라 이 계정의 모든 세션을 파기한다.
    destroy_user_sessions(user_id)
    logout_user(request.cookies.get(USER_COOKIE))
    res = JSONResponse({"ok": True})
    res.delete_cookie(USER_COOKIE, path="/")
    return res

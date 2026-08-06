"""
회귀 테스트. Dev-only — `backend/devtools/` 와 함께 지워진다.

integration_test.py 와 같은 방식(pgserver + 실제 ASGI 앱)으로 돌지만,
아래 네 가지 결함의 수정만 좁게 겨냥한다.

  1. 세션 메모리 무한 증가 (sessions.py TTL)
  2. add_track position 경쟁 + total_tracks lost update (routers/playlists.py)
  3. 핸들되지 않은 예외의 500 응답이 JSON 계약을 안 지킴 (main.py)
  4. 세션 쿠키에 Secure 플래그 없음 (config.py + accounts.py)

실행:

    uv venv --python 3.12 .venv-test
    VIRTUAL_ENV=.venv-test uv pip install pgserver -r requirements.txt
    .venv-test/bin/python backend/devtools/regression_test.py

모든 단언이 통과하면 exit code 0.
"""

import asyncio
import sys
import tempfile
import time
from pathlib import Path

import httpx
from sqlalchemy import text as sql_text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

try:
    import pgserver
except ModuleNotFoundError:
    sys.exit("pgserver 가 없다. 파일 상단 주석의 설치 명령을 따를 것.")

from backend import sessions  # noqa: E402
from backend.accounts import USER_COOKIE, USER_COOKIE_OPTS  # noqa: E402
from backend.db.session import get_db  # noqa: E402
from backend.main import app  # noqa: E402

PASS, FAIL = [], []


def check(name, cond, extra=""):
    (PASS if cond else FAIL).append(name)
    print(f"{'PASS' if cond else 'FAIL'}  {name}{'  ' + str(extra) if extra and not cond else ''}")


@app.get("/__boom")
async def boom() -> dict:
    """핸들되지 않은 예외 경로 확인용 테스트 전용 라우트."""
    raise RuntimeError("의도된 폭발")


async def main() -> int:
    pgdata = Path(tempfile.gettempdir()) / "jungle_music_pgdata"
    pgdata.mkdir(parents=True, exist_ok=True)
    server = pgserver.get_server(pgdata)
    print("postgres up:", server.get_uri())

    server.psql("DROP DATABASE IF EXISTS jungle_regression")
    server.psql("CREATE DATABASE jungle_regression")

    uri = server.get_uri(database="jungle_regression").replace(
        "postgresql://", "postgresql+asyncpg://"
    )
    engine = create_async_engine(uri)
    Session = async_sessionmaker(engine, expire_on_commit=False, autoflush=False)

    schema = (ROOT / "backend/schema.sql").read_text(encoding="utf-8")
    async with engine.connect() as conn:
        raw = await conn.get_raw_connection()
        await raw.driver_connection.execute(schema)
    print("schema loaded")

    async def override_db():
        async with Session() as session:
            try:
                yield session
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_db] = override_db

    # raise_app_exceptions=False: 수정 전 코드가 터질 때 러너가 죽지 않고
    # 500 응답으로 관찰되어 FAIL 로 기록된다.
    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as a:
        await test_sessions_ttl(a)
        await test_add_track_concurrency(a, Session)
        await test_unhandled_exception_contract()
        await test_cookie_secure(a)

    await engine.dispose()
    print(f"\n{len(PASS)} passed, {len(FAIL)} failed")
    if FAIL:
        print("failed:", FAIL)
    return 1 if FAIL else 0


# --- 1. 세션 TTL ---------------------------------------------------------
async def test_sessions_ttl(a: httpx.AsyncClient) -> None:
    print("\n[1] 세션 TTL")
    original_ttl = sessions.SESSION_TTL
    sessions._sessions.clear()

    r = await a.post(
        "/api/users/signup",
        json={"nickname": "ttl", "email": "ttl@ex.com", "password": "pw12345678"},
    )
    check("signup 201", r.status_code == 201, r.text)
    check("세션 1건 등록", sessions.active_count() == 1, sessions.active_count())

    r = await a.get("/api/users/me")
    check("만료 전에는 로그인 유지", r.json().get("loggedIn") is True, r.text)

    # 짧은 TTL 로 다시 로그인해서 만료를 관찰한다.
    sessions.SESSION_TTL = 0.3
    try:
        r = await a.post(
            "/api/users/login",
            json={"email": "ttl@ex.com", "password": "pw12345678"},
        )
        check("재로그인 200", r.status_code == 200, r.text)
        check("로그인 직후 유효", (await a.get("/api/users/me")).json()["loggedIn"] is True)

        await asyncio.sleep(0.4)
        r = await a.get("/api/users/me")
        check("TTL 지나면 세션 무효", r.json() == {"loggedIn": False}, r.text)
        check(
            "만료 세션은 조회 시점에 제거됨",
            len(sessions._sessions) == 1,  # 첫 signup 세션만 남는다
            len(sessions._sessions),
        )

        # 만료 항목이 쌓여도 새 세션 생성 시 청소된다.
        sessions.SESSION_TTL = 0
        for _ in range(50):
            sessions.create_session({"userId": 1})
        check("만료 항목만 있으면 0건", sessions.active_count() == 1, sessions.active_count())

        sessions.SESSION_TTL = original_ttl
        sessions.create_session({"userId": 1})
        check(
            "생성 시 purge 로 찌꺼기 정리",
            len(sessions._sessions) == 2,  # 첫 signup 세션 + 방금 만든 세션
            len(sessions._sessions),
        )
    finally:
        sessions.SESSION_TTL = original_ttl

    # 다음 테스트를 위해 정상 세션으로 복구
    r = await a.post(
        "/api/users/login", json={"email": "ttl@ex.com", "password": "pw12345678"}
    )
    check("복구 로그인", r.status_code == 200, r.text)


# --- 2. add_track 경쟁 ----------------------------------------------------
async def test_add_track_concurrency(a: httpx.AsyncClient, Session) -> None:
    print("\n[2] add_track 동시성")
    async with Session() as s:
        album_id = (
            await s.execute(
                sql_text(
                    "INSERT INTO albums (source, source_id, name, artist) "
                    "VALUES ('itunes', 'r500', 'Album R', 'R Artist') RETURNING id"
                )
            )
        ).scalar_one()
        track_ids = []
        for i in range(8):
            tid = (
                await s.execute(
                    sql_text(
                        "INSERT INTO tracks (source, source_id, title, artist, album_id, play_url) "
                        "VALUES ('itunes', :sid, :title, 'R Artist', :album, :url) RETURNING id"
                    ),
                    {"sid": f"r{i}", "title": f"R Song {i}", "album": album_id, "url": f"https://a/{i}.m4a"},
                )
            ).scalar_one()
            track_ids.append(tid)
        await s.commit()

    pid = (await a.post("/api/playlists", json={"name": "race"})).json()["id"]

    started = time.monotonic()
    results = await asyncio.gather(
        *[a.post(f"/api/playlists/{pid}/tracks", json={"trackId": t}) for t in track_ids]
    )
    elapsed = time.monotonic() - started

    codes = [r.status_code for r in results]
    check(f"동시 {len(track_ids)}건 전부 200", codes == [200] * len(track_ids), codes)

    bodies = [r.json() for r in results if r.status_code == 200]
    positions = sorted(b["position"] for b in bodies)
    check(
        "position 이 0..N-1 로 중복 없이 배정",
        positions == list(range(len(track_ids))),
        positions,
    )
    check(
        "응답 totalTracks 가 1..N 을 한 번씩",
        sorted(b["totalTracks"] for b in bodies) == list(range(1, len(track_ids) + 1)),
        sorted(b["totalTracks"] for b in bodies),
    )

    detail = (await a.get(f"/api/playlists/{pid}")).json()
    check(
        f"total_tracks 유실 없음 (={len(track_ids)})",
        detail["totalTracks"] == len(track_ids),
        detail["totalTracks"],
    )
    check(
        "items 개수 일치",
        len(detail["items"]) == len(track_ids),
        len(detail["items"]),
    )
    check(
        "저장된 position 도 0..N-1",
        [i["position"] for i in detail["items"]] == list(range(len(track_ids))),
        [i["position"] for i in detail["items"]],
    )
    print(f"      (동시 요청 {len(track_ids)}건 {elapsed * 1000:.0f}ms)")

    # 순차 경로도 그대로 동작하는지 - 회귀 방지
    item_ids = [i["itemId"] for i in detail["items"]]
    r = await a.delete(f"/api/playlists/{pid}/tracks/{item_ids[0]}")
    check(
        "곡 빼기 후 totalTracks 감소",
        r.status_code == 200 and r.json()["totalTracks"] == len(track_ids) - 1,
        r.text,
    )

    # remove_track 도 남은 행 전체의 position 을 다시 매기므로 같은 락이 필요하다.
    # 락이 없으면 서로 상대의 UPDATE 를 기다리다 deadlock 이 나고 카운터가 어긋난다.
    left = [i["itemId"] for i in (await a.get(f"/api/playlists/{pid}")).json()["items"]]
    res = await asyncio.gather(
        *[a.delete(f"/api/playlists/{pid}/tracks/{i}") for i in left[:3]]
    )
    check(
        "동시 곡 빼기 3건 전부 200",
        [r.status_code for r in res] == [200, 200, 200],
        [r.status_code for r in res],
    )
    detail = (await a.get(f"/api/playlists/{pid}")).json()
    expected = len(track_ids) - 4
    check(
        f"동시 빼기 후 totalTracks={expected}",
        detail["totalTracks"] == expected,
        detail["totalTracks"],
    )
    check(
        "동시 빼기 후 items 수 일치",
        len(detail["items"]) == expected,
        len(detail["items"]),
    )
    check(
        "동시 빼기 후 position 에 구멍 없음",
        [i["position"] for i in detail["items"]] == list(range(expected)),
        [i["position"] for i in detail["items"]],
    )

    # reorder 도 마찬가지 - 서로 다른 순열을 동시에 밀어도 결과가 온전해야 한다.
    left = [i["itemId"] for i in detail["items"]]
    perms = [left, list(reversed(left)), left[1:] + left[:1]]
    res = await asyncio.gather(
        *[
            a.put(f"/api/playlists/{pid}/tracks/order", json={"itemIds": p})
            for p in perms
        ]
    )
    check(
        "동시 순서변경 3건 전부 200",
        [r.status_code for r in res] == [200, 200, 200],
        [r.status_code for r in res],
    )
    detail = (await a.get(f"/api/playlists/{pid}")).json()
    check(
        "동시 순서변경 후 position 0..N-1",
        [i["position"] for i in detail["items"]] == list(range(expected)),
        [i["position"] for i in detail["items"]],
    )


# --- 3. 500 응답 JSON 계약 -------------------------------------------------
async def test_unhandled_exception_contract() -> None:
    print("\n[3] 핸들되지 않은 예외")
    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.get("/__boom")
        check("500 상태코드", r.status_code == 500, r.status_code)
        check(
            "content-type application/json",
            r.headers.get("content-type", "").startswith("application/json"),
            r.headers.get("content-type"),
        )
        try:
            body = r.json()
        except Exception:
            body = None
        check("본문이 {\"error\": ...} 계약을 지킴", isinstance(body, dict) and "error" in body, r.text)
        check(
            "평문 'Internal Server Error' 가 아님",
            r.text.strip() != "Internal Server Error",
            r.text,
        )

        # 기존 핸들러들이 깨지지 않았는지
        r = await c.get("/api/playlists/999999999")
        check("404 도 error 키 유지", r.status_code == 404 and "error" in r.json(), r.text)
        r = await c.post("/api/users/signup", json={"nickname": "n", "email": "bad", "password": "pw12345678"})
        check("422 도 error 키 유지", r.status_code == 422 and "error" in r.json(), r.text)


# --- 4. 쿠키 Secure ------------------------------------------------------
async def test_cookie_secure(a: httpx.AsyncClient) -> None:
    print("\n[4] 쿠키 Secure 플래그")
    from backend.config import Settings

    check(
        "설정 기본값 cookie_secure=False",
        Settings(_env_file=None).cookie_secure is False,
    )
    check(
        "COOKIE_SECURE 환경변수로 켤 수 있음",
        Settings(_env_file=None, cookie_secure=True).cookie_secure is True,
    )
    check("쿠키 옵션에 secure 키 존재", "secure" in USER_COOKIE_OPTS, USER_COOKIE_OPTS)
    check(
        "쿠키 max_age 가 세션 TTL 과 동일",
        USER_COOKIE_OPTS["max_age"] == sessions.SESSION_TTL,
        (USER_COOKIE_OPTS["max_age"], sessions.SESSION_TTL),
    )

    login = {"email": "ttl@ex.com", "password": "pw12345678"}
    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)

    async with httpx.AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.post("/api/users/login", json=login)
        cookie = r.headers.get("set-cookie", "")
        check("기본 설정에서는 Secure 없음", "Secure" not in cookie, cookie)
        check("HttpOnly 유지", "HttpOnly" in cookie, cookie)
        check("SameSite=lax 유지", "SameSite=lax" in cookie, cookie)
        check(f"쿠키 이름 {USER_COOKIE}", cookie.startswith(f"{USER_COOKIE}="), cookie)

    USER_COOKIE_OPTS["secure"] = True
    try:
        async with httpx.AsyncClient(transport=transport, base_url="http://t") as c:
            r = await c.post("/api/users/login", json=login)
            cookie = r.headers.get("set-cookie", "")
            check("secure=True 면 Set-Cookie 에 Secure", "Secure" in cookie, cookie)
            r = await c.post(
                "/api/users/signup",
                json={"nickname": "sec", "email": "sec@ex.com", "password": "pw12345678"},
            )
            check(
                "signup 쿠키에도 Secure",
                "Secure" in r.headers.get("set-cookie", ""),
                r.headers.get("set-cookie"),
            )
    finally:
        USER_COOKIE_OPTS["secure"] = False


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))

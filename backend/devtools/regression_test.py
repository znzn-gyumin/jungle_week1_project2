"""
회귀 테스트. Dev-only — `backend/devtools/` 와 함께 지워진다.

integration_test.py 와 같은 방식(pgserver + 실제 ASGI 앱)으로 돌지만,
아래 결함들의 수정만 좁게 겨냥한다.

  1. 세션 메모리 무한 증가 (sessions.py TTL)
  2. add_track position 경쟁 + total_tracks lost update (routers/playlists.py)
  3. 핸들되지 않은 예외의 500 응답이 JSON 계약을 안 지킴 (main.py)
  4. 세션 쿠키에 Secure 플래그 없음 (config.py + accounts.py)
  5. tracks.updated_at 인덱스 없음 - 전체 Seq Scan + 정렬 (schema.sql)
  6. 로그인 무제한 시도 + 응답 시간으로 이메일 존재 여부 노출 (ratelimit.py, security.py)
  7. IntegrityError 를 전부 409 로 오역 (routers/users.py)
  8. 비밀번호 변경·계정 삭제 후에도 다른 세션 유효 (sessions.py, routers/users.py)
  9. 목록 API 에 상한 없음 + /api/likes 페이로드 중복 (routers/likes.py, playlists.py)
 10. 구글 로그인 토큰 검증 · 계정 연결 (routers/users.py) - 결함 수정이 아니라 기능 회귀 방어

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

from sqlalchemy.exc import IntegrityError  # noqa: E402

from backend import ratelimit, sessions  # noqa: E402
from backend.accounts import USER_COOKIE, USER_COOKIE_OPTS  # noqa: E402
from backend.db.session import get_db  # noqa: E402
from backend.main import app  # noqa: E402
from backend.models import Track  # noqa: E402
from backend.config import get_settings  # noqa: E402
from backend.routers import users as users_router  # noqa: E402
from backend.routers.users import _conflict_field  # noqa: E402

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
        await test_tracks_updated_at_index(Session)
        await test_login_hardening(a)
        await test_integrity_error_mapping(a, Session)
        await test_session_invalidation(a, transport)
        await test_list_limits(a, Session)
        await test_google_login(transport)

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


# --- 5. tracks.updated_at 인덱스 -------------------------------------------
async def test_tracks_updated_at_index(Session) -> None:
    print("\n[5] tracks.updated_at 인덱스")
    check(
        "ORM 모델에도 인덱스가 선언됨",
        "ix_tracks_updated_at" in {i.name for i in Track.__table__.indexes},
        {i.name for i in Track.__table__.indexes},
    )

    async with Session() as s:
        present = await s.scalar(
            sql_text("SELECT 1 FROM pg_indexes WHERE indexname = 'ix_tracks_updated_at'")
        )
        check("schema.sql 이 인덱스를 만든다", present == 1, present)

        # 플래너가 인덱스를 고를 만큼 행을 채운다.
        await s.execute(
            sql_text(
                "INSERT INTO tracks (source, source_id, title, artist, updated_at) "
                "SELECT 'itunes', 'bulk' || g, 'T' || g, 'A', "
                "now() - (g || ' seconds')::interval "
                "FROM generate_series(1, 20000) g"
            )
        )
        await s.commit()
        await s.execute(sql_text("ANALYZE tracks"))

        plan = "\n".join(
            row[0]
            for row in (
                await s.execute(
                    sql_text(
                        "EXPLAIN SELECT * FROM tracks ORDER BY updated_at DESC LIMIT 25"
                    )
                )
            ).all()
        )
    check("ix_tracks_updated_at 를 탄다", "ix_tracks_updated_at" in plan, plan)
    check("tracks 전체 Seq Scan 이 아니다", "Seq Scan on tracks" not in plan, plan)
    check("정렬 노드가 사라졌다", "Sort" not in plan, plan)


# --- 6. 로그인 시도 제한 · 타이밍 -------------------------------------------
async def test_login_hardening(a: httpx.AsyncClient) -> None:
    print("\n[6] 로그인 시도 제한 · 응답 시간")
    ratelimit.reset_all()

    await a.post(
        "/api/users/signup",
        json={"nickname": "lock", "email": "lock@ex.com", "password": "pw12345678"},
    )

    async def timed(email: str, password: str) -> tuple[int, float]:
        started = time.monotonic()
        r = await a.post("/api/users/login", json={"email": email, "password": password})
        return r.status_code, time.monotonic() - started

    real, fake = [], []
    for _ in range(3):
        code, dt = await timed("lock@ex.com", "wrongwrong")
        check("존재하는 계정 + 틀린 비번 401", code == 401, code)
        real.append(dt)
        code, dt = await timed("nobody@ex.com", "wrongwrong")
        check("없는 계정 401", code == 401, code)
        fake.append(dt)
    ratelimit.reset_all()

    real_med, fake_med = sorted(real)[1], sorted(fake)[1]
    print(f"      (있는 계정 {real_med * 1000:.0f}ms · 없는 계정 {fake_med * 1000:.0f}ms)")
    check(
        "없는 계정도 같은 비용의 검증을 돈다 (응답 시간으로 가입 여부 구분 불가)",
        fake_med >= real_med * 0.5,
        f"real={real_med * 1000:.0f}ms fake={fake_med * 1000:.0f}ms",
    )

    check("기본 상한이 양수", ratelimit.LOGIN_MAX_ATTEMPTS > 0, ratelimit.LOGIN_MAX_ATTEMPTS)
    max_attempts, window = ratelimit.LOGIN_MAX_ATTEMPTS, ratelimit.LOGIN_WINDOW
    ratelimit.LOGIN_MAX_ATTEMPTS, ratelimit.LOGIN_WINDOW = 4, 0.5
    try:
        codes = []
        for _ in range(4):
            r = await a.post(
                "/api/users/login",
                json={"email": "lock@ex.com", "password": "wrongwrong"},
            )
            codes.append(r.status_code)
        check("상한까지는 401", codes == [401] * 4, codes)

        r = await a.post(
            "/api/users/login", json={"email": "lock@ex.com", "password": "wrongwrong"}
        )
        check("상한 넘으면 429", r.status_code == 429, r.status_code)
        check("Retry-After 헤더", r.headers.get("retry-after") is not None, dict(r.headers))
        check("429 도 error 키 유지", "error" in r.json(), r.text)

        r = await a.post(
            "/api/users/login", json={"email": "lock@ex.com", "password": "pw12345678"}
        )
        check("잠긴 동안은 맞는 비번도 429 (fail closed)", r.status_code == 429, r.status_code)

        await asyncio.sleep(0.6)
        r = await a.post(
            "/api/users/login", json={"email": "lock@ex.com", "password": "pw12345678"}
        )
        check("창이 지나면 다시 허용", r.status_code == 200, r.text)
    finally:
        ratelimit.LOGIN_MAX_ATTEMPTS, ratelimit.LOGIN_WINDOW = max_attempts, window
        ratelimit.reset_all()

    # 성공하면 카운터가 지워져서 다음 실패가 처음부터 센다
    ratelimit.LOGIN_MAX_ATTEMPTS = 2
    try:
        for _ in range(1):
            await a.post(
                "/api/users/login",
                json={"email": "lock@ex.com", "password": "wrongwrong"},
            )
        await a.post(
            "/api/users/login", json={"email": "lock@ex.com", "password": "pw12345678"}
        )
        r = await a.post(
            "/api/users/login", json={"email": "lock@ex.com", "password": "wrongwrong"}
        )
        check("성공하면 실패 카운터 초기화", r.status_code == 401, r.status_code)
    finally:
        ratelimit.LOGIN_MAX_ATTEMPTS = max_attempts
        ratelimit.reset_all()


# --- 7. IntegrityError 분기 ------------------------------------------------
class _FakeOrig(Exception):
    """asyncpg 예외 흉내. FK 위반이라 중복 메시지로 번역되면 안 된다."""

    constraint_name = "fk_playlists_user_id_users"


async def test_integrity_error_mapping(a: httpx.AsyncClient, Session) -> None:
    print("\n[7] IntegrityError 분기")

    check(
        "이메일 제약조건 -> 이메일",
        _conflict_field(IntegrityError("s", {}, _named("uq_users_email_lower"))) == "이메일",
    )
    check(
        "닉네임 제약조건 -> 닉네임",
        _conflict_field(IntegrityError("s", {}, _named("uq_users_nickname_lower")))
        == "닉네임",
    )
    check(
        "FK 위반 -> None (중복 아님)",
        _conflict_field(IntegrityError("s", {}, _FakeOrig("boom"))) is None,
    )
    check(
        "제약조건 이름이 없어도 오탐하지 않음",
        _conflict_field(IntegrityError("s", {}, Exception("null value in column"))) is None,
    )

    r = await a.post(
        "/api/users/signup",
        json={"nickname": "dup1", "email": "dup@ex.com", "password": "pw12345678"},
    )
    check("중복 실험용 계정 생성", r.status_code == 201, r.text)
    r = await a.post(
        "/api/users/signup",
        json={"nickname": "dup2", "email": "dup@ex.com", "password": "pw12345678"},
    )
    check("이메일 중복은 409 이메일", r.status_code == 409 and "이메일" in r.json()["error"], r.text)
    r = await a.post(
        "/api/users/signup",
        json={"nickname": "dup1", "email": "other@ex.com", "password": "pw12345678"},
    )
    check("닉네임 중복은 409 닉네임", r.status_code == 409 and "닉네임" in r.json()["error"], r.text)

    # 중복이 아닌 IntegrityError 를 주입한다. 409 닉네임 중복으로 둔갑하면 안 된다.
    original = app.dependency_overrides[get_db]

    async def exploding_db():
        async with Session() as session:
            yield _ExplodingSession(session)

    app.dependency_overrides[get_db] = exploding_db
    try:
        r = await a.post(
            "/api/users/signup",
            json={"nickname": "boom", "email": "boom@ex.com", "password": "pw12345678"},
        )
    finally:
        app.dependency_overrides[get_db] = original

    check("중복 아닌 IntegrityError 는 409 가 아님", r.status_code != 409, (r.status_code, r.text))
    check("500 으로 나가고 error 키 유지", r.status_code == 500 and "error" in r.json(), r.text)
    check(
        "'닉네임 중복' 으로 둔갑하지 않음",
        "닉네임" not in r.text,
        r.text,
    )


def _named(constraint: str) -> Exception:
    exc = Exception(f'duplicate key value violates unique constraint "{constraint}"')
    exc.constraint_name = constraint
    return exc


class _ExplodingSession:
    """commit 만 FK 위반 IntegrityError 로 바꿔치기하는 세션 프록시."""

    def __init__(self, real):
        self._real = real

    def __getattr__(self, name):
        return getattr(self._real, name)

    async def commit(self):
        raise IntegrityError("INSERT INTO users ...", {}, _FakeOrig("boom"))


# --- 8. 비밀번호 변경 · 계정 삭제 시 세션 파기 -------------------------------
async def test_session_invalidation(a: httpx.AsyncClient, transport) -> None:
    print("\n[8] 비밀번호 변경 · 계정 삭제 후 세션")
    ratelimit.reset_all()
    creds = {"email": "multi@ex.com", "password": "pw12345678"}

    async with (
        httpx.AsyncClient(transport=transport, base_url="http://t") as one,
        httpx.AsyncClient(transport=transport, base_url="http://t") as two,
    ):
        r = await one.post(
            "/api/users/signup",
            json={"nickname": "multi", **creds},
        )
        check("계정 생성", r.status_code == 201, r.text)
        user_id = r.json()["id"]
        r = await two.post("/api/users/login", json=creds)
        check("두 번째 기기 로그인", r.status_code == 200, r.text)
        check("두 기기 모두 유효", (await two.get("/api/users/me")).json()["loggedIn"] is True)

        r = await one.patch("/api/users/me", json={"password": "newpw12345678"})
        check("비밀번호 변경 200", r.status_code == 200, r.text)
        check(
            "바꾼 기기의 세션은 유지",
            (await one.get("/api/users/me")).json()["loggedIn"] is True,
        )
        check(
            "다른 기기 세션은 끊긴다",
            (await two.get("/api/users/me")).json() == {"loggedIn": False},
            (await two.get("/api/users/me")).text,
        )
        check(
            "그 유저의 세션 색인에 1건만 남음",
            len(sessions._by_user.get(user_id, ())) == 1,
            sessions._by_user.get(user_id),
        )
        check(
            "다른 기기의 보호 라우트도 401",
            (await two.get("/api/playlists")).status_code == 401,
        )

        r = await two.post("/api/users/login", json={**creds, "password": "newpw12345678"})
        check("새 비밀번호로는 다시 로그인", r.status_code == 200, r.text)

        # 계정 삭제도 모든 세션을 파기해야 한다
        r = await one.delete("/api/users/me")
        check("계정 삭제 200", r.status_code == 200, r.text)
        check(
            "삭제 후 다른 기기 세션도 죽음",
            (await two.get("/api/playlists")).status_code == 401,
        )
        check(
            "삭제한 유저의 세션 색인이 비었다",
            user_id not in sessions._by_user,
            sessions._by_user.get(user_id),
        )


# --- 9. 목록 상한 · 페이로드 -----------------------------------------------
async def test_list_limits(a: httpx.AsyncClient, Session) -> None:
    print("\n[9] 목록 상한 · 페이로드")
    ratelimit.reset_all()
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app, raise_app_exceptions=False),
        base_url="http://t",
    ) as c:
        await c.post(
            "/api/users/signup",
            json={"nickname": "lister", "email": "list@ex.com", "password": "pw12345678"},
        )
        for i in range(5):
            await c.post("/api/playlists", json={"name": f"pl{i}"})

        r = await c.get("/api/playlists")
        check("기본 limit 로 전부 보임", len(r.json()["playlists"]) == 5, r.text)
        check("응답이 적용된 limit 을 알려준다", r.json().get("limit") == 50, r.text)

        r = await c.get("/api/playlists?limit=2")
        check("limit=2 면 2건", len(r.json()["playlists"]) == 2, r.text)
        check("limit=2 가 응답에 반영", r.json().get("limit") == 2, r.text)
        check("limit=0 은 422", (await c.get("/api/playlists?limit=0")).status_code == 422)
        check(
            "limit 이 상한을 넘으면 422",
            (await c.get("/api/playlists?limit=100000")).status_code == 422,
        )

        # 좋아요: 앨범 6개를 만들어 전부 좋아요
        async with Session() as s:
            album_ids = [
                (
                    await s.execute(
                        sql_text(
                            "INSERT INTO albums (source, source_id, name, artist) "
                            "VALUES ('itunes', :sid, :name, 'A') RETURNING id"
                        ),
                        {"sid": f"lim{i}", "name": f"Album {i}"},
                    )
                ).scalar_one()
                for i in range(6)
            ]
            await s.commit()
        for album_id in album_ids:
            await c.put(f"/api/likes/albums/{album_id}")

        body = (await c.get("/api/likes")).json()
        check("좋아요 6건 전부 보임", len(body.get("albums", [])) == 6, body)
        check("중복 payload 제거 - likes 키 없음", "likes" not in body, list(body))
        check("albums / playlists 로만 나뉜다", set(body) == {"albums", "playlists", "limit"}, list(body))

        body = (await c.get("/api/likes?limit=2")).json()
        check(
            "likes limit=2 면 총 2건",
            len(body.get("albums", [])) + len(body.get("playlists", [])) == 2,
            list(body),
        )
        check("likes limit=0 은 422", (await c.get("/api/likes?limit=0")).status_code == 422)
        check(
            "likes limit 상한 초과는 422",
            (await c.get("/api/likes?limit=100000")).status_code == 422,
        )


# --- 10. 구글 로그인 -----------------------------------------------------
async def test_google_login(transport) -> None:
    """구글 ID 토큰 검증과 계정 연결.

    tokeninfo 왕복만 가짜로 바꾸고 나머지(라우터·DB·세션)는 진짜로 돌린다.
    """
    settings = get_settings()
    real_verify, real_client_id = users_router.verify_google_token, settings.google_client_id
    payload = {}

    async def fake_verify(credential: str) -> dict:
        return payload

    users_router.verify_google_token = fake_verify
    client = "test-client.apps.googleusercontent.com"

    def token(**over) -> dict:
        return {
            "aud": client,
            "iss": "https://accounts.google.com",
            "email_verified": "true",
            "email": "gu@ex.com",
            "name": "구글유저",
            **over,
        }

    async def post(body: dict) -> httpx.Response:
        nonlocal payload
        payload = body
        async with httpx.AsyncClient(transport=transport, base_url="http://t") as c:
            return await c.post("/api/users/google", json={"credential": "tok"})

    try:
        settings.google_client_id = ""
        check("클라이언트 ID 없으면 503", (await post(token())).status_code == 503)

        settings.google_client_id = client
        async with httpx.AsyncClient(transport=transport, base_url="http://t") as c:
            cfg = (await c.get("/api/users/google")).json()
        check("clientId 를 프런트에 내려준다", cfg == {"clientId": client}, cfg)

        check("aud 가 다르면 401", (await post(token(aud="other"))).status_code == 401)
        check("iss 가 구글이 아니면 401", (await post(token(iss="evil.com"))).status_code == 401)
        check(
            "email_verified 아니면 401",
            (await post(token(email="new@ex.com", email_verified="false"))).status_code == 401,
        )
        check("검증 실패(빈 payload)면 401", (await post({})).status_code == 401)

        async with httpx.AsyncClient(transport=transport, base_url="http://t") as c:
            payload = token()
            r = await c.post("/api/users/google", json={"credential": "tok"})
            body = r.json()
            check("최초 구글 로그인 성공", r.status_code == 200 and body["loggedIn"] is True, body)
            check("닉네임은 구글 이름", body.get("nickname") == "구글유저", body)
            first_id = body.get("id")
            check("세션 쿠키가 실제로 붙는다", (await c.get("/api/users/me")).json()["loggedIn"] is True)

            # 같은 이메일로 다시 들어오면 계정을 새로 만들지 않는다.
            r = await c.post("/api/users/google", json={"credential": "tok"})
            check("재로그인은 같은 계정", r.json().get("id") == first_id, r.json())

            # 닉네임이 겹치면 꼬리를 붙여서라도 가입시킨다.
            payload = token(email="gu2@ex.com")
            r = await c.post("/api/users/google", json={"credential": "tok"})
            body = r.json()
            check("닉네임 충돌해도 가입 성공", r.status_code == 200, body)
            check(
                "충돌한 닉네임은 꼬리가 붙는다",
                body.get("nickname", "").startswith("구글유저")
                and body.get("nickname") != "구글유저",
                body,
            )
            check("다른 이메일은 다른 계정", body.get("id") != first_id, body)

            # 구글로 만든 계정은 비밀번호 로그인이 불가능하다.
            r = await c.post(
                "/api/users/login", json={"email": "gu@ex.com", "password": "pw12345678"}
            )
            check("구글 계정은 비밀번호 로그인 불가", r.status_code == 401, r.text)
    finally:
        users_router.verify_google_token = real_verify
        settings.google_client_id = real_client_id


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))

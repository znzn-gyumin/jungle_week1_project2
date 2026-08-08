"""
Integration test. Dev-only — deleted with the rest of `backend/devtools/`.

Runs the real app over ASGI against a real PostgreSQL built from
`backend/schema.sql`, so it also guards that file (nothing else does).

`pgserver` ships PostgreSQL binaries in its wheel, so no Docker or local
install is needed. It has no cp313+ wheels, so it needs its own environment:

    uv venv --python 3.12 .venv-test
    VIRTUAL_ENV=.venv-test uv pip install pgserver -r requirements.txt
    .venv-test/bin/python backend/devtools/integration_test.py

Exit code is 0 when every assertion passes.
"""

import asyncio
import sys
import tempfile
from datetime import date
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

from backend.db.session import get_db  # noqa: E402
from backend.main import app  # noqa: E402
from backend.sources import itunes, youtube  # noqa: E402

PASS, FAIL = [], []


def check(name, cond, extra=""):
    (PASS if cond else FAIL).append(name)
    print(f"{'PASS' if cond else 'FAIL'}  {name}{'  ' + str(extra) if extra and not cond else ''}")


async def main() -> int:
    pgdata = Path(tempfile.gettempdir()) / "jungle_music_pgdata"
    pgdata.mkdir(parents=True, exist_ok=True)
    server = pgserver.get_server(pgdata)
    print("postgres up:", server.get_uri())

    server.psql("DROP DATABASE IF EXISTS jungle_test")
    server.psql("CREATE DATABASE jungle_test")

    uri = server.get_uri(database="jungle_test").replace(
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

    transport = httpx.ASGITransport(app=app)
    async with (
        httpx.AsyncClient(transport=transport, base_url="http://t") as a,
        httpx.AsyncClient(transport=transport, base_url="http://t") as b,
    ):
        await run_tests(a, b, Session)

    await engine.dispose()
    print(f"\n{len(PASS)} passed, {len(FAIL)} failed")
    if FAIL:
        print("failed:", FAIL)
    return 1 if FAIL else 0


async def run_tests(a: httpx.AsyncClient, b: httpx.AsyncClient, Session) -> None:
    # --- 유저 API ---
    r = await a.get("/api/users/me")
    check("me: 비로그인 loggedIn=False", r.status_code == 200 and r.json() == {"loggedIn": False}, r.text)

    r = await a.post("/api/users/signup", json={"nickname": "alice", "email": "A@Ex.com", "password": "pw12345678"})
    check("signup 201", r.status_code == 201, r.text)
    check("signup 이메일 소문자 저장", r.json().get("email") == "a@ex.com", r.text)
    check("signup 쿠키 발급", "uid" in a.cookies, dict(a.cookies))

    r = await a.post("/api/users/signup", json={"nickname": "x", "email": "a@ex.com", "password": "pw12345678"})
    check("signup 이메일 중복 409", r.status_code == 409, r.text)

    r = await a.post("/api/users/signup", json={"nickname": "alice", "email": "z@ex.com", "password": "pw12345678"})
    check("signup 닉네임 중복 409", r.status_code == 409, r.text)

    r = await a.post("/api/users/signup", json={"nickname": "n", "email": "bad", "password": "pw12345678"})
    check("signup 잘못된 이메일 422", r.status_code == 422, r.text)

    r = await a.post("/api/users/signup", json={"nickname": "n", "email": "n@ex.com", "password": "short"})
    check("signup 짧은 비밀번호 422", r.status_code == 422, r.text)

    r = await a.get("/api/users/me")
    body = r.json()
    check("me: 로그인 상태", body.get("loggedIn") is True and body["nickname"] == "alice", r.text)
    check("me: counts 0", body["counts"] == {"playlists": 0, "likes": 0}, r.text)
    alice_id = body["id"]

    r = await a.patch("/api/users/me", json={"nickname": "alice2"})
    check("PATCH me 닉네임 변경", r.status_code == 200 and r.json()["nickname"] == "alice2", r.text)

    # b 유저 가입
    r = await b.post("/api/users/signup", json={"nickname": "bob", "email": "b@ex.com", "password": "pw12345678"})
    check("두 번째 유저 가입", r.status_code == 201, r.text)

    r = await b.patch("/api/users/me", json={"email": "a@ex.com"})
    check("PATCH me 이메일 중복 409", r.status_code == 409, r.text)

    # 로그인/로그아웃
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c:
        r = await c.post("/api/users/login", json={"email": "a@ex.com", "password": "wrong"})
        check("login 틀린 비밀번호 401", r.status_code == 401, r.text)
        r = await c.post("/api/users/login", json={"email": "a@ex.com", "password": "pw12345678"})
        check("login 성공", r.status_code == 200 and r.json()["id"] == alice_id, r.text)
        r = await c.post("/api/users/logout")
        check("logout 200", r.status_code == 200, r.text)
        r = await c.get("/api/playlists")
        check("로그아웃 후 보호 라우트 401", r.status_code == 401, r.text)

    # --- 곡/앨범 시드 (제품 코드에 곡 공급 경로가 없으므로 SQL 로 직접 넣는다) ---
    async with Session() as s:
        album_id = (
            await s.execute(
                sql_text(
                    "INSERT INTO albums (source, source_id, name, artist) "
                    "VALUES ('itunes', 'c500', 'Album 0', 'Test Artist') RETURNING id"
                )
            )
        ).scalar_one()
        track_ids = []
        for i in range(3):
            tid = (
                await s.execute(
                    sql_text(
                        "INSERT INTO tracks "
                        "(source, source_id, title, artist, album_id, play_url, thumbnail_url) "
                        "VALUES ('itunes', :sid, :title, 'Test Artist', :album, :url, :thumb) "
                        "RETURNING id"
                    ),
                    {
                        "sid": f"t{i}",
                        "title": f"Song {i}",
                        "album": album_id,
                        "url": f"https://audio/{i}.m4a",
                        "thumb": f"https://img/{i}.jpg",
                    },
                )
            ).scalar_one()
            track_ids.append(tid)
        await s.commit()
    check("시드: 트랙 3곡 · 앨범 1개", len(track_ids) == 3 and album_id > 0, (track_ids, album_id))

    # --- 플레이리스트 API ---
    r = await a.post("/api/playlists", json={"name": "  내 리스트  "})
    check("플레이리스트 생성 200", r.status_code == 200, r.text)
    pl = r.json()
    check("이름 trim", pl["name"] == "내 리스트", pl)
    check("기본 비공개 / 0곡", pl["isPublic"] is False and pl["totalTracks"] == 0, pl)
    pid = pl["id"]

    for tid in track_ids:
        r = await a.post(f"/api/playlists/{pid}/tracks", json={"trackId": tid})
        check(f"곡 담기 track={tid}", r.status_code == 200, r.text)

    r = await a.post(f"/api/playlists/{pid}/tracks", json={"trackId": 999999})
    check("없는 곡 담기 404", r.status_code == 404, r.text)

    # 목록 응답이 첫 곡 표지를 같이 준다. 없으면 프런트가 리스트마다 상세를 또 부른다 (N+1).
    listed = (await a.get("/api/playlists")).json()["playlists"]
    check("목록에 coverUrl 포함", listed[0]["coverUrl"] == "https://img/0.jpg", listed)

    r = await a.get(f"/api/playlists/{pid}")
    detail = r.json()
    check("detail totalTracks=3", detail["totalTracks"] == 3, detail)
    check("position 0,1,2", [i["position"] for i in detail["items"]] == [0, 1, 2], detail)
    check("detail isOwner", detail["isOwner"] is True, detail)
    check("item.track 조인됨", detail["items"][0]["track"]["title"] == "Song 0", detail)
    item_ids = [i["itemId"] for i in detail["items"]]

    r = await a.put(f"/api/playlists/{pid}/tracks/order", json={"itemIds": list(reversed(item_ids))})
    check("순서 변경 200", r.status_code == 200, r.text)
    detail = (await a.get(f"/api/playlists/{pid}")).json()
    check("순서 뒤집힘", [i["itemId"] for i in detail["items"]] == list(reversed(item_ids)), detail)
    check("순서 변경 후 position 0,1,2", [i["position"] for i in detail["items"]] == [0, 1, 2], detail)

    r = await a.put(f"/api/playlists/{pid}/tracks/order", json={"itemIds": item_ids[:2]})
    check("불완전한 itemIds 400", r.status_code == 400, r.text)

    r = await a.delete(f"/api/playlists/{pid}/tracks/{item_ids[0]}")
    check("곡 빼기 200", r.status_code == 200 and r.json()["totalTracks"] == 2, r.text)
    detail = (await a.get(f"/api/playlists/{pid}")).json()
    check("빼기 후 position 재정렬 0,1", [i["position"] for i in detail["items"]] == [0, 1], detail)

    r = await a.delete(f"/api/playlists/{pid}/tracks/{item_ids[0]}")
    check("이미 뺀 항목 404", r.status_code == 404, r.text)

    # 접근 제어
    r = await b.get(f"/api/playlists/{pid}")
    check("남의 비공개 리스트 403", r.status_code == 403, r.text)
    r = await b.patch(f"/api/playlists/{pid}", json={"name": "hack"})
    check("남의 리스트 수정 403", r.status_code == 403, r.text)
    r = await b.delete(f"/api/playlists/{pid}")
    check("남의 리스트 삭제 403", r.status_code == 403, r.text)

    r = await a.patch(f"/api/playlists/{pid}", json={"isPublic": True})
    check("공개 전환", r.status_code == 200 and r.json()["isPublic"] is True, r.text)

    before = (await a.get(f"/api/playlists/{pid}")).json()["viewCount"]
    await b.get(f"/api/playlists/{pid}")
    after = (await a.get(f"/api/playlists/{pid}")).json()["viewCount"]
    check("타인 조회 시 view_count 증가", after == before + 1, (before, after))
    check("본인 조회는 view_count 그대로", before == 0, before)

    r = await b.get("/api/playlists/public")
    check("공개 목록에 노출", any(p["id"] == pid for p in r.json()["playlists"]), r.text)

    # --- 좋아요 API ---
    r = await a.put(f"/api/likes/albums/{album_id}")
    check("앨범 좋아요 created=True", r.status_code == 200 and r.json()["created"] is True, r.text)
    r = await a.put(f"/api/likes/albums/{album_id}")
    check("중복 좋아요 멱등 created=False", r.status_code == 200 and r.json()["created"] is False, r.text)
    r = await a.put("/api/likes/albums/999999")
    check("없는 앨범 좋아요 404", r.status_code == 404, r.text)

    r = await b.put(f"/api/likes/playlists/{pid}")
    check("공개 플레이리스트 좋아요", r.status_code == 200 and r.json()["created"] is True, r.text)

    r = await b.get("/api/likes")
    likes = r.json()
    check("likes 분류: playlist 1건", len(likes["playlists"]) == 1 and len(likes["albums"]) == 0, likes)
    check("likes 조인 payload", likes["playlists"][0]["playlist"]["id"] == pid, likes)

    r = await a.get("/api/likes")
    check("alice likes: album 1건", len(r.json()["albums"]) == 1, r.text)

    r = await a.get("/api/users/me")
    check("me counts 갱신", r.json()["counts"] == {"playlists": 1, "likes": 1}, r.text)

    await a.patch(f"/api/playlists/{pid}", json={"isPublic": False})
    r = await b.get("/api/likes")
    check("비공개로 바뀌어도 좋아요 행 유지", len(r.json()["playlists"]) == 1, r.text)
    check("좋아요 목록의 isPublic=False 노출", r.json()["playlists"][0]["playlist"]["isPublic"] is False, r.text)

    r = await b.put(f"/api/likes/playlists/{pid}")
    check("비공개 리스트 신규 좋아요 403", r.status_code == 403, r.text)

    r = await a.delete(f"/api/likes/albums/{album_id}")
    check("좋아요 취소 removed=True", r.json()["removed"] is True, r.text)
    r = await a.delete(f"/api/likes/albums/{album_id}")
    check("이미 취소된 좋아요 removed=False", r.json()["removed"] is False, r.text)

    # --- 최근 재생 API ---
    r = await a.get("/api/plays")
    check("최근 재생 초기 빈 목록", r.status_code == 200 and r.json()["tracks"] == [], r.text)

    r = await a.post(f"/api/plays/{track_ids[0]}")
    check("재생 기록 200", r.status_code == 200 and r.json()["saved"] is True, r.text)
    r = await a.post(f"/api/plays/{track_ids[1]}")
    check("두 번째 곡 기록", r.status_code == 200, r.text)
    r = await a.post(f"/api/plays/{track_ids[0]}")
    check("같은 곡 재기록도 200 (멱등)", r.status_code == 200, r.text)

    r = await a.post("/api/plays/999999")
    check("없는 곡 재생 기록 404", r.status_code == 404, r.text)

    played = (await a.get("/api/plays")).json()["tracks"]
    check("최근 재생은 곡당 한 행", len(played) == 2, played)
    check("가장 최근에 튼 곡이 맨 앞", played[0]["id"] == track_ids[0], played)
    check("앨범 조인 payload", played[0]["album"]["name"] == "Album 0", played)

    r = await b.get("/api/plays")
    check("남의 재생 기록은 안 보인다", r.json()["tracks"] == [], r.text)

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c:
        r = await c.post(f"/api/plays/{track_ids[0]}")
        check("비로그인 재생 기록 401", r.status_code == 401, r.text)
        r = await c.get("/api/plays")
        check("비로그인 최근 재생 401", r.status_code == 401, r.text)

    # --- 삭제 전파 ---
    r = await a.delete("/api/users/me")
    check("계정 삭제 200", r.status_code == 200, r.text)
    r = await b.get(f"/api/playlists/{pid}")
    check("유저 삭제 시 플레이리스트 CASCADE", r.status_code == 404, r.text)
    r = await b.get("/api/likes")
    body = r.json()
    check(
        "플레이리스트 좋아요도 CASCADE",
        len(body["albums"]) == 0 and len(body["playlists"]) == 0,
        r.text,
    )
    async with Session() as s:
        left = (await s.execute(sql_text("SELECT count(*) FROM tracks"))).scalar_one()
        plays_left = (await s.execute(sql_text("SELECT count(*) FROM plays"))).scalar_one()
    check("공용 캐시 tracks 는 남음", left == 3, left)
    check("유저 삭제 시 plays CASCADE", plays_left == 0, plays_left)

    await test_search_cache(a, Session)


ITUNES_RESULT = {
    "trackId": 90001,
    "trackName": "Cached Song",
    "artistName": "Cache Artist",
    "artistId": 777,
    "collectionId": 55501,
    "collectionName": "Cache Album",
    "trackTimeMillis": 210000,
    "artworkUrl100": "https://img/100x100bb.jpg",
    "previewUrl": "https://audio/preview.m4a",
    "releaseDate": "2024-05-24T12:00:00Z",
    "primaryGenreName": "K-Pop",
    "discNumber": 1,
    "trackNumber": 4,
    "trackCount": 10,
}


async def test_search_cache(a: httpx.AsyncClient, Session) -> None:
    """같은 검색어를 다시 물으면 iTunes 를 안 친다 (search_cache)."""
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(str(request.url))
        return httpx.Response(200, json={"results": [ITUNES_RESULT]})

    def youtube_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"items": []})

    itunes.set_client(httpx.AsyncClient(transport=httpx.MockTransport(handler)))
    youtube.set_client(httpx.AsyncClient(transport=httpx.MockTransport(youtube_handler)))
    try:
        r = await a.get("/api/search", params={"q": "Cached", "source": "itunes"})
        first = r.json()["tracks"]
        check("검색 1회차 200", r.status_code == 200 and len(first) == 1, r.text)
        check("검색 1회차는 iTunes 를 친다", len(calls) == 1, calls)
        check(
            "버리던 필드가 저장됨",
            first[0]["durationMs"] == 210000 and first[0]["album"]["name"] == "Cache Album",
            first,
        )

        r = await a.get("/api/search", params={"q": "Cached", "source": "itunes"})
        check("검색 2회차 캐시 적중 - 외부 호출 없음", len(calls) == 1, calls)
        check("캐시 결과가 1회차와 동일", r.json()["tracks"] == first, r.text)

        r = await a.get("/api/search", params={"q": "CACHED", "source": "itunes"})
        check("대소문자만 다른 검색어도 적중", len(calls) == 1, calls)

        # 캐시 키에 limit 이 없다. 있으면 화면마다 limit 이 다른 것만으로 같은
        # 검색어가 외부 API 를 다시 친다. 대신 풀 전체를 받아 두고 여기서 자른다.
        r = await a.get("/api/search", params={"q": "Cached", "source": "itunes", "limit": 5})
        check("limit 이 달라도 같은 캐시를 쓴다", len(calls) == 1, calls)
        check("limit 은 캐시에서 잘라 준다", r.json()["tracks"] == first[:5], r.text)
        # 풀은 api.MAX_LIMIT 과 같아야 한다. 작으면 limit=50 요청이 조용히 모자라고,
        # 크면 iTunes 가 행당 약 18ms 로 선형이라 캐시 미스가 그만큼 느려진다.
        check("외부 호출은 요청 limit 이 아니라 풀 크기로 나간다", "limit=50" in calls[0], calls)

        r = await a.get("/api/search", params={"q": "x" * 201})
        check("201자 검색어 422", r.status_code == 422, r.status_code)

        async with Session() as s:
            row = (
                await s.execute(
                    sql_text(
                        "SELECT genre, disc_number, track_number, release_date, "
                        "artist_source_id FROM tracks WHERE source_id = '90001'"
                    )
                )
            ).one()
        check(
            "새 컬럼이 채워짐",
            row == ("K-Pop", 1, 4, date(2024, 5, 24), "777"),
            row,
        )

        cached_calls = len(calls)
        await a.get("/api/search", params={"q": "Cached", "source": "all"})
        check("source=all 이어도 iTunes 몫은 재사용", len(calls) == cached_calls, calls)
    finally:
        itunes.set_client(None)
        youtube.set_client(None)


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))

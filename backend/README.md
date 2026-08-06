# jungle_music DB

Spotify / YouTube 통합 음악 플랫폼의 데이터베이스. PostgreSQL 17 기준.

DB 스키마 문서다. 서버 설치·실행은 **루트 README.md** 를 본다.
DB 코드에는 주석이 없으므로, 설계 근거와 주의사항은 전부 이 문서에 있다.

**모든 명령은 저장소 루트에서 실행한다.** `.env` 와 `requirements.txt` 도 루트에 하나씩만 있다.

---

## 빠른 시작

DB 컨테이너를 먼저 띄운다.

```bash
docker compose -f backend/docker-compose.yml up -d
```

그다음 둘 중 **하나**를 고른다.

### A. SQL 파일 직접 실행 — 파이썬 불필요

```bash
psql -U jungle -d jungle_music -f backend/schema.sql
```

### B. Alembic — 이후 스키마 변경을 버전 관리하려면

```bash
alembic -c backend/alembic.ini upgrade head
```

`-c` 로 ini 위치를 지정해야 한다. `alembic.ini` 안의 `script_location` 은
루트 기준(`backend/migrations`)이라 다른 디렉터리에서 실행하면 경로를 못 찾는다.

두 경로는 **완전히 동일한 구조**를 만든다 (pg_dump 로 비교 검증함).
A 로 만든 DB에 나중에 Alembic 을 붙이려면
`alembic -c backend/alembic.ini stamp head` 로 현재 리비전을 기록시킨다.

---

## 파일

모두 `backend/` 아래이며, 파이썬 패키지 이름은 `backend` 하나다.

| 경로 | 역할 |
|---|---|
| `schema.sql` | 순수 SQL 생성 스크립트. 스택 무관 |
| `models/*.py` | SQLAlchemy 모델 (`from backend.models import Track`) |
| `migrations/versions/0001_initial_schema.py` | Alembic 초기 마이그레이션 |
| `db/base.py` | `Base`, 제약조건 네이밍 규칙, 공통 mixin |
| `config.py` | `.env` 를 읽어 DB 접속 문자열 + Spotify 설정 조립 |
| `docker-compose.yml` | 로컬 개발용 postgres 17 |

`config.py` 는 DB 와 Spotify 설정을 **한 곳에서** 관리한다. `main.py`, `spotify.py`
도 같은 `get_settings()` 를 쓴다.

---

## 테이블

```
users ──< playlists ──< playlist_tracks >── tracks >── albums
  │           │                                          │
  └──< likes ────────────────────────────────────────────┘
```

`source_type` = ENUM(`'spotify'`, `'youtube'`)

### users — 계정

`id` · `nickname`(30, uniq) · `email`(255, uniq) · `password_hash`(255) ·
`created_at` · `updated_at`

### albums — 외부 플랫폼 앨범 캐시

`id` · `source` · `source_id`(128) · `name` · `artist` · `release_date` ·
`total_tracks` · `thumbnail_url` · `external_url` · `created_at` · `updated_at`

UNIQUE `(source, source_id)`

YouTube 에는 앨범 개념이 없어 실질적으로 대부분 Spotify 레코드다.

### tracks — Spotify 트랙 / YouTube 영상 캐시

`id` · `source` · `source_id`(128) · `title` · `artist` · `album_id` ·
`duration_ms` · `isrc`(12) · `thumbnail_url` · `external_url` ·
`created_at` · `updated_at`

UNIQUE `(source, source_id)` · INDEX `isrc`, `album_id`, `lower(title)`
`album_id` → `albums` **ON DELETE SET NULL** (YouTube 곡은 NULL)

### playlists — 사용자 플레이리스트

`id` · `user_id` · `name`(100) · `description` · `is_public`(기본 false) ·
`view_count`(기본 0, CHECK ≥ 0) · `created_at` · `updated_at`

`user_id` → `users` **CASCADE** · INDEX `user_id`, `(view_count DESC) WHERE is_public`

### playlist_tracks — 플레이리스트 ↔ 트랙 + 재생 순서

`id` · `playlist_id` · `track_id` · `position`(CHECK ≥ 0) · `added_at`

UNIQUE `(playlist_id, position)` **DEFERRABLE INITIALLY DEFERRED**
두 FK 모두 **CASCADE**

### likes — 플레이리스트/앨범 좋아요 (마이페이지 목록의 원본)

`id` · `user_id` · `playlist_id` · `album_id` · `created_at`

CHECK `num_nonnulls(playlist_id, album_id) = 1`
UNIQUE `(user_id, playlist_id)` · UNIQUE `(user_id, album_id)`
세 FK 모두 **CASCADE** · INDEX `(user_id, created_at DESC)`, `playlist_id`, `album_id`

### 삭제 전파

유저를 지우면 그 사람의 `playlists` / `playlist_tracks` / `likes` 가 함께 사라지고,
공용 캐시인 `tracks` / `albums` 는 남는다.
앨범을 지우면 그 앨범의 트랙은 `album_id` 만 NULL 이 되고 트랙 자체는 유지된다.

---

## 자주 쓸 쿼리

**검색 결과 캐싱** — 매번 upsert 하면 플레이리스트가 외부 API 응답에 의존하지 않고
FK 로 곡을 참조할 수 있다.

```sql
INSERT INTO tracks (source, source_id, title, artist, ...)
VALUES (...)
ON CONFLICT (source, source_id) DO UPDATE SET title = EXCLUDED.title
RETURNING id;
```

**좋아요 토글** — 중복 체크는 애플리케이션이 아니라 DB 에 맡긴다.

```sql
INSERT INTO likes (user_id, album_id) VALUES (?, ?)
ON CONFLICT (user_id, album_id) DO NOTHING;

DELETE FROM likes WHERE user_id = ? AND album_id = ?;
```

**마이페이지** — `ix_likes_user_id_created_at` 를 탄다.

```sql
SELECT * FROM likes WHERE user_id = ? ORDER BY created_at DESC;
```

**플레이리스트 순서 변경** — 한 트랜잭션 안에서 한꺼번에 갱신하면 된다.
`position` UNIQUE 가 DEFERRABLE 이라 중간 충돌이 나지 않는다.

```sql
BEGIN;
UPDATE playlist_tracks SET position = ... WHERE playlist_id = ?;
COMMIT;
```

---

## 설계 메모

**`tracks` / `albums` 분리**
초안의 `music&album` 단일 테이블(+`type` 컬럼)로는 "플레이리스트 항목은 곡만",
"`likes.album_id` 는 앨범만" 을 FK 로 강제할 수 없다. 대신 `(source, source_id)`
라는 외부 식별자 패턴은 두 테이블이 동일하게 쓴다.

**`tracks.isrc`**
Spotify 가 내려주는 국제 표준 녹음 코드. 같은 곡의 Spotify 버전과 YouTube 버전을
묶을 때 쓴다. YouTube 는 ISRC 를 주지 않으므로 그쪽은 `lower(title)` + `artist`
휴리스틱 매칭이 필요하다 (인덱스는 걸어뒀다).

**`likes` 의 UNIQUE 두 개가 서로 방해하지 않는 이유**
PostgreSQL 은 NULL 을 서로 다른 값으로 취급한다. 앨범 좋아요 행은 `playlist_id` 가
전부 NULL 이지만 `uq_likes_user_id_playlist_id` 에 걸리지 않는다.
한눈에 틀려 보이지만 의도된 구조다 — **지우지 말 것.**

**`playlist_tracks` 의 중복 허용**
같은 곡을 한 플레이리스트에 두 번 담는 것은 막지 않았다. 막으려면
`(playlist_id, track_id)` UNIQUE 를 추가한다.

**`playlists.view_count`**
트래픽이 늘면 매 조회마다 `UPDATE ... SET view_count = view_count + 1` 이 행 잠금
경합을 만든다. 나중에 Redis 카운터 + 주기적 flush 로 옮기는 걸 권장.

**비공개로 바뀐 플레이리스트**
좋아요를 누른 뒤 주인이 `is_public` 을 false 로 바꿔도 좋아요 행은 남는다.
마이페이지에서 `is_public` 확인은 애플리케이션 쪽에서 해야 한다.

---

## 백엔드 붙일 때

**드라이버**: SQLAlchemy async 엔진은 `postgresql+asyncpg` 를 쓸 것.
psycopg3 의 async 모드는 Windows 기본 이벤트 루프(ProactorEventLoop)에서 동작하지
않는다. Alembic 은 동기 연결이라 psycopg 를 쓴다.
접속 문자열은 `backend/config.py` 의 `async_database_url` 참고.

**모델 재사용**: `from backend.models import User, Album, Track, Playlist, PlaylistTrack, Like`
세션/엔진 생성 코드는 백엔드 쪽에서 만들면 된다.

**추가 후보 테이블**: `follows`, `play_history`

---

## 스키마를 수정할 때

```bash
alembic -c backend/alembic.ini revision --autogenerate -m "message"
alembic -c backend/alembic.ini upgrade head
alembic -c backend/alembic.ini check     # 모델과 DB 스키마 drift 확인
```

**세 곳을 함께 고쳐야 한다** — `backend/models/*.py`, `migrations/versions/*.py`,
`schema.sql`. 앞의 둘이 어긋나면 `alembic check` 가 잡아주지만, `schema.sql` 은
아무도 안 잡아주므로 직접 챙긴다.

### 밟기 쉬운 함정

**`alembic.ini` 에 비 ASCII 문자 금지**
configparser 가 로케일 인코딩(한국어 Windows 는 cp949)으로 읽어서
`UnicodeDecodeError` 로 alembic 이 죽는다. 한글 주석을 넣지 말 것.

**`CheckConstraint(name=...)` 에는 접두사 없는 이름**
`backend/db/base.py` 의 `NAMING_CONVENTION` 이 `ck_<table>_` 를 붙인다.
`name="ck_playlists_foo"` 라고 쓰면 `ck_playlists_ck_playlists_foo` 가 된다.
`name="foo"` 로 줄 것. (`UniqueConstraint` 는 규칙이 이름을 참조하지 않아 무관.)

**`source_enum()` 의 `values_callable` 을 지우지 말 것**
지우면 SQLAlchemy 가 멤버 값(`'spotify'`)이 아니라 이름(`'SPOTIFY'`)을 보낸다.
PG enum 라벨이 소문자라 insert 시 `invalid input value for enum source_type` 로
실패한다.

---

## 아직 안 정한 것

**같은 곡이 플랫폼별로 별개 행이다.**
Spotify 의 "Bohemian Rhapsody" 와 YouTube 의 같은 곡은 `source` 가 달라 완전히
별개의 `tracks` 행이다. 검색 결과에 같은 곡이 두 번 뜨고, 플레이리스트에도 따로
담긴다. `isrc` 로 묶으려 했지만 YouTube 는 ISRC 를 주지 않는다.

"Spotify 에서 찾은 곡을 YouTube 로 재생" 같은 걸 하려면 곡의 정체성을 나타내는
상위 테이블(예: `songs`)을 두고 `tracks` 가 그 아래 플랫폼별 재생 소스로 붙는
구조가 필요하다. **"동시에 검색" 의 핵심이라 언젠가는 결정해야 한다.**

**`artist` 가 단순 텍스트다.**
아티스트 테이블이 없어서 플랫폼 간 동일 아티스트를 식별할 수 없다.

**DB 세션이 아직 FastAPI 에 연결되지 않았다.**
모델과 마이그레이션은 있지만 async 엔진 / `get_db` 의존성이 없어서, `main.py` 의
어떤 라우터도 아직 DB 를 읽거나 쓰지 않는다.

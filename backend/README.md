# Jungle Music

여러 플랫폼의 음악을 한 곳에서 검색하고 재생하는 서비스.
저장소의 유일한 문서다 (루트 README 없음).

- 프론트: React 19 + Vite (`client/`)
- 백엔드: FastAPI (`backend/`)
- DB: PostgreSQL 17
- 코드에는 주석이 거의 없으므로, 설계 근거와 주의사항은 전부 이 문서에 있다.

**모든 명령은 저장소 루트에서 실행한다.** `.env` 와 `requirements.txt` 도 루트에
하나씩만 있다.

---

## 설치와 실행

### 1. 환경변수

```bash
cp .env.example .env
```

`POSTGRES_*` 는 `backend/docker-compose.yml` 기본값이라 그대로 두면 된다.
Spotify 키는 아래 "현재 상태" 참고.

### 2. 데이터베이스

```bash
docker compose -f backend/docker-compose.yml up -d
alembic -c backend/alembic.ini upgrade head
```

파이썬 없이 만들려면 대신 `psql -U jungle -d jungle_music -f backend/schema.sql`.
두 경로는 **완전히 동일한 구조**를 만든다 (pg_dump 로 비교 검증함).
SQL 로 만든 DB에 나중에 Alembic 을 붙이려면
`alembic -c backend/alembic.ini stamp head` 로 현재 리비전을 기록시킨다.

`-c` 로 ini 위치를 지정해야 한다. `alembic.ini` 의 `script_location` 이
루트 기준(`backend/migrations`)이라 다른 디렉터리에서 실행하면 경로를 못 찾는다.

### 3. 의존성

```bash
# .venv 위치를 바꾸지 말 것 — package.json 의 dev:api 가 직접 참조한다
python -m venv .venv
.venv/Scripts/activate          # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt

npm install
```

### 4. 실행

```bash
npm run dev     # uvicorn(:8000) + vite(:5173) 동시 실행
```

브라우저에서 **<http://127.0.0.1:5173>**. `localhost` 로 열면 쿠키 도메인이 달라져
로그인이 유지되지 않는다. API 문서는 <http://127.0.0.1:8000/docs>.

백엔드만 따로:

```bash
.venv/Scripts/uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

> **Windows 주의** — `npm run dev` 의 `dev:api` 는 `.venv/bin/uvicorn` 을 참조한다.
> Windows 는 `.venv/Scripts/` 라 그대로는 실패한다. 위 명령으로 따로 띄우거나
> `package.json` 을 고쳐야 한다.

---

## 현재 상태

**재생 방식을 iTunes Search API 로 바꾸는 중이다.** 아직 코드는 Spotify 기준이다.

- DB 는 `source_type` ENUM 에 `'itunes'` 와 `tracks.audio_url` 을 이미 갖고 있다
- `backend/main.py`, `backend/spotify.py` 는 아직 Spotify OAuth 기반이다

지금 코드를 그대로 돌리려면 Spotify Developer 앱과 **Premium 계정**이 필요하다
(Web Playback SDK 는 Premium 전용). <https://developer.spotify.com/dashboard> 에서
앱을 만들고 Redirect URI 에 `http://127.0.0.1:8000/api/auth/callback` 을 정확히
등록한다 — Spotify 는 `http://localhost` 를 거부한다. `.env` 의
`SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` 를 채우면 된다.

iTunes 로 넘어가면 이 준비물이 전부 사라진다. 인증이 없고, 로그인도 필요 없고,
`previewUrl` 30초 미리듣기를 누구나 동시에 재생할 수 있다. 대신 **전체 재생은
불가능**하다. IP 당 약 20회/분 제한이 있어 캐싱이 필요하다.

참고: Spotify 는 2024년 11월부터 신규 앱에 `audio_url` 을 `null` 로 내려준다.
현재 코드가 SDK 경로를 쓰는 이유다.

---

## API

전부 세션 쿠키(`sid`) 기반. 로그인 안 하면 `401`.
실패 응답은 FastAPI 기본 `detail` 대신 `{"error": "..."}` 로 통일되어 있고,
프론트 `client/src/api.js` 가 이 키를 읽는다.

| Method | Path | 설명 |
|---|---|---|
| GET | `/api/health` | 서버 상태 + `.env` 설정 여부 |
| GET | `/api/auth/login` | Spotify 인증 페이지로 리다이렉트 |
| GET | `/api/auth/callback` | 코드 → 토큰 교환 후 세션 발급 |
| GET | `/api/auth/me` | 로그인 유저 (`product` 로 Premium 판별) |
| GET | `/api/auth/token` | SDK 용 access token (자동 갱신) |
| POST | `/api/auth/logout` | 세션 파기 |
| GET | `/api/search?q=&type=track\|artist` | 곡 / 아티스트 검색 |
| GET | `/api/artists/:id/top-tracks` | 아티스트 인기 트랙 |
| PUT | `/api/player/transfer` | 브라우저 플레이어를 활성 기기로 전환 |
| PUT | `/api/player/play` | `{ deviceId, uris }` — uris 생략 시 이어재생 |
| PUT | `/api/player/pause?deviceId=` | 일시정지 |

iTunes 전환 시 `/api/auth/*` 와 `/api/player/*` 는 전부 사라진다.
재생은 iTunes 가 `<audio src={audio_url}>`, YouTube 가 IFrame 임베드로 끝난다.

---

## 파일

파이썬 패키지는 `backend` 하나다.

| 경로 | 역할 |
|---|---|
| `backend/main.py` | 라우트 + 응답 정규화 + 예외 핸들러 |
| `backend/spotify.py` | 토큰 교환/갱신, Spotify API 래퍼 |
| `backend/sessions.py` | 인메모리 세션 (서버 재시작하면 로그아웃) |
| `backend/config.py` | `.env` → DB 접속 문자열 + Spotify 설정 (단일 `get_settings()`) |
| `backend/models/*.py` | SQLAlchemy 모델 (`from backend.models import Track`) |
| `backend/db/base.py` | `Base`, 제약조건 네이밍 규칙, 공통 mixin |
| `backend/migrations/` | Alembic |
| `backend/schema.sql` | 순수 SQL 생성 스크립트. 스택 무관 |
| `backend/docker-compose.yml` | 로컬 개발용 postgres 17 |
| `client/src/App.jsx` | 화면 전체 |
| `client/src/usePlayer.js` | Web Playback SDK 연결 훅 |
| `client/src/api.js` | 백엔드 호출 |

---

## 테이블

```
users ──< playlists ──< playlist_tracks >── tracks >── albums
  │           │                              │  │         │
  └──< likes ─┴──────────────────────────────┘  │         │
                                                │         │
       search_cache ──< search_cache_items >────┴─────────┘
```

`likes` 는 곡·플레이리스트·앨범 중 하나를 가리키고,
`search_cache_items` 는 곡 또는 앨범을 가리킨다.

`source_type` = ENUM(`'itunes'`, `'youtube'`)

### users — 계정

`id` · `nickname`(30, uniq) · `email`(255, uniq) · `password_hash`(255) ·
`created_at` · `updated_at`

### albums — 외부 플랫폼 앨범 캐시

`id` · `source` · `source_id`(128) · `name` · `artist` · `release_date` ·
`total_tracks` · `thumbnail_url` · `created_at` · `updated_at`

UNIQUE `(source, source_id)`

YouTube 에는 앨범 개념이 없어 실질적으로 전부 iTunes(`collection`) 레코드다.

### tracks — 외부 플랫폼 곡 캐시 (iTunes 곡 / YouTube 영상)

`id` · `source` · `source_id`(128) · `title` · `artist` · `album_id` ·
`duration_ms` · `thumbnail_url` · `audio_url` · `created_at` · `updated_at`

UNIQUE `(source, source_id)` · INDEX `album_id`, `lower(title)`
`album_id` → `albums` **ON DELETE SET NULL** (YouTube 곡은 NULL)

**재생 방식이 소스마다 다르다.**

| | `source_id` | `audio_url` | 재생 |
|---|---|---|---|
| iTunes | `trackId` | **30초** 오디오 URL | `<audio src={audio_url}>` |
| YouTube | video id | **항상 NULL** | IFrame 임베드에 `source_id` 전달 |

YouTube Data API 는 재생 가능한 파일 URL 을 주지 않는다. IFrame 플레이어에
video id 를 넘기는 방식뿐이고, 스트림 URL 을 직접 추출하는 것은 약관 위반이다.
따라서 `audio_url` 이 YouTube 에서 NULL 인 것은 누락이 아니라 구조적 결과다.

`source_id` 는 플랫폼의 원본 식별자다 — iTunes 는 `trackId`(숫자 문자열),
YouTube 는 video id(11자). `(source, source_id)` UNIQUE 가 중복 저장을 막고,
YouTube 재생은 이 값을 `youtube.com/embed/{source_id}` 로 조립해서 쓴다.

**웹페이지 링크(`external_url`)는 두지 않는다.** 재생에 필요 없고, 필요해지면
`source_id` 에서 파생할 수 있다 (`youtube.com/watch?v={source_id}`,
`music.apple.com/album/{collectionId}?i={source_id}`).
다만 Apple 은 API 의 미리듣기·아트워크를 "스토어 콘텐츠 홍보 목적"으로만 쓰고
사운드 샘플은 스토어 배지 근처에 두라고 안내한다. 외부 공개 서비스로 확장한다면
그때 다시 볼 지점이다.

iTunes 필드 매핑: `trackId`→`source_id`, `trackName`→`title`, `artistName`→`artist`,
`collectionId`→앨범 조회, `trackTimeMillis`→`duration_ms`, `artworkUrl100`→`thumbnail_url`,
`previewUrl`→`audio_url`. (`trackViewUrl` 은 저장하지 않는다)

### playlists — 사용자 플레이리스트

`id` · `user_id` · `name`(100) · `description` · `total_tracks`(기본 0, CHECK ≥ 0) ·
`is_public`(기본 false) · `view_count`(기본 0, CHECK ≥ 0) · `created_at` · `updated_at`

`total_tracks` 는 `playlist_tracks` 개수의 **비정규화 사본**이다. 곡을 담거나 뺄 때
애플리케이션이 함께 갱신해야 하며, 안 하면 실제 개수와 어긋난다. 목록 화면에서
플레이리스트마다 `COUNT(*)` 를 돌리지 않으려는 것이 목적이다.

`user_id` → `users` **CASCADE** · INDEX `user_id`, `(view_count DESC) WHERE is_public`

### playlist_tracks — 플레이리스트 ↔ 트랙 + 재생 순서

`id` · `playlist_id` · `track_id` · `position`(CHECK ≥ 0) · `added_at`

UNIQUE `(playlist_id, position)` **DEFERRABLE INITIALLY DEFERRED**
두 FK 모두 **CASCADE**

### likes — 앨범/플레이리스트 좋아요 (마이페이지 목록의 원본)

`id` · `user_id` · `album_id` · `playlist_id` · `created_at`

CHECK `num_nonnulls(album_id, playlist_id) = 1`
UNIQUE `(user_id, album_id)` · `(user_id, playlist_id)`
세 FK 모두 **CASCADE** · INDEX `(user_id, created_at DESC)`, `album_id`, `playlist_id`

**곡 단위 좋아요는 없다.** 앨범과 플레이리스트만 담는다.

### search_cache / search_cache_items — 검색어 캐시

```
search_cache        id · source · search_type · query · fetched_at
                    UNIQUE (source, search_type, query) · INDEX fetched_at

search_cache_items  cache_id · position · track_id · album_id
                    PK (cache_id, position)
                    CHECK num_nonnulls(track_id, album_id) = 1
                    세 FK 모두 CASCADE
```

`query` 는 정규화(소문자·trim)해서 넣는다. `search_type` 은 `'track'` / `'album'`.
`fetched_at` 으로 TTL 을 판정하고, 만료된 행은 지우면 `items` 가 CASCADE 로 따라간다.

**왜 필요한가** — iTunes 는 IP 당 약 20회/분(초과 시 429), YouTube 는 하루 100회다.
둘 다 **개발자 크레덴셜 하나를 전체 사용자가 공유**하므로 사용자가 늘수록 빨리
소진된다. 검색어 단위 캐시 없이는 시연 중에 막힐 수 있다.

결과를 배열(`bigint[]`)이 아니라 별도 테이블에 둔 이유는 FK 로 무결성을 걸기
위해서다. 배열에는 FK 를 못 걸어 삭제된 곡의 id 가 남는다.

### 삭제 전파

유저를 지우면 그 사람의 `playlists` / `playlist_tracks` / `likes` 가 함께 사라지고,
공용 캐시인 `tracks` / `albums` / `search_cache` 는 남는다.
앨범을 지우면 그 앨범의 트랙은 `album_id` 만 NULL 이 되고 트랙 자체는 유지된다.
곡을 지우면 그 곡을 가리키던 `playlist_tracks` · `search_cache_items` 가
CASCADE 로 사라진다.

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

**검색 캐시 조회** — TTL 안이면 DB, 아니면 API 호출 후 갱신.

```sql
SELECT t.*
FROM search_cache sc
JOIN search_cache_items i ON i.cache_id = sc.id
JOIN tracks t             ON t.id = i.track_id
WHERE sc.source = ? AND sc.search_type = 'track' AND sc.query = ?
  AND sc.fetched_at > now() - interval '24 hours'
ORDER BY i.position;
```

두 소스를 동시에 검색하려면 `sc.source` 조건을 빼고 `ORDER BY sc.source, i.position`.

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

**ISRC 컬럼은 없앴다**
국제 표준 녹음 코드로 플랫폼 간 동일 곡을 묶으려 했으나, 이걸 내려주는 소스가
Spotify 뿐이었다. Spotify 를 빼면 iTunes 도 YouTube 도 ISRC 를 주지 않아 영원히
NULL 인 컬럼이 된다. 지금 플랫폼 간 매칭 수단은 `lower(title)` + `artist` 휴리스틱
뿐이다 (인덱스는 걸어뒀다).

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
지우면 SQLAlchemy 가 멤버 값(`'itunes'`)이 아니라 이름(`'ITUNES'`)을 보낸다.
PG enum 라벨이 소문자라 insert 시 `invalid input value for enum source_type` 로
실패한다.

---

## 아직 안 정한 것

**같은 곡이 플랫폼별로 별개 행이다.**
iTunes 의 "Bohemian Rhapsody" 와 YouTube 의 같은 곡은 `source` 가 달라 완전히
별개의 `tracks` 행이다. 검색 결과에 같은 곡이 두 번 뜨고, 플레이리스트에도 따로
담긴다. ISRC 같은 공용 식별자가 없어 제목·아티스트 휴리스틱 말고는 방법이 없다.

"iTunes 로 찾은 곡을 YouTube 로 전체 재생" 같은 걸 하려면 곡의 정체성을 나타내는
상위 테이블(예: `songs`)을 두고 `tracks` 가 그 아래 플랫폼별 재생 소스로 붙는
구조가 필요하다. iTunes 는 30초, YouTube 는 전체 재생이라 **이 둘을 잇는 게
곧 제품의 핵심 가치**가 된다. 언젠가는 결정해야 한다.

**`artist` 가 단순 텍스트다.**
아티스트 테이블이 없어서 플랫폼 간 동일 아티스트를 식별할 수 없다.

**DB 세션이 아직 FastAPI 에 연결되지 않았다.**
모델과 마이그레이션은 있지만 async 엔진 / `get_db` 의존성이 없어서, `main.py` 의
어떤 라우터도 아직 DB 를 읽거나 쓰지 않는다.

---

## 현재 Spotify 코드의 알려진 제약

iTunes 로 넘어가면 대부분 사라진다. 그전까지 유효한 내용이다.

### Development Mode 앱 제약

Extended Quota 승인 전 앱은 Spotify 가 조용히 기능을 깎는다. 실측으로 확인한 내용:

| 항목 | 실제 동작 | 대응 |
|---|---|---|
| `search` 의 `limit` | **11 이상이면 400 `Invalid limit`**. 값과 무관 | `MAX_LIMIT = 10` 고정 (`backend/main.py`) |
| `search` 결과 개수 | `limit=10` 을 보내도 보통 **5개**만 옴 | 그대로 표시 |
| `/artists/{id}/top-tracks` | **403 Forbidden**. `market` 무관하게 항상 실패 | `artist:"이름"` 필터 검색으로 자동 대체 |
| `/artists/{id}`, `/albums` | 정상 | — |

### 재생은 실제 스트리밍이다

**이 앱의 재생은 로그인한 계정의 실제 스트리밍이다.** 최근 재생 기록에 남고
Daily Mix / Discover Weekly / Wrapped / 상위 아티스트에 반영된다. Spotify 에는
재생 기록 삭제 기능이 없고, 앱의 Private session 은 SDK 기기에 적용되지 않는다.

우측 상단 `개발 모드` 토글을 켜면 재생 10초 뒤 자동 일시정지한다
(`client/src/App.jsx` 의 `DEV_STOP_MS`, 설정은 `localStorage` 에 저장). 다만
30초 집계는 피해도 **짧은 재생이 스킵 신호로 잡힐 수 있어** 완전한 보호는 아니다.
오염을 아예 피하려면 평소 듣는 곡으로 테스트하거나 `/api/player/devices` 로
재생 없이 연결만 확인한다.

### 기능 범위

- 세션이 **인메모리**라 서버 재시작 시 재로그인 (실서비스는 Redis/DB)
- 단일 사용자 기준. 동시 사용자 테스트 안 함
- 다음곡/이전곡/셔플/볼륨/시크 미구현 (재생·일시정지만)
- 플레이리스트, 앨범 상세, 좋아요 미구현 — DB 스키마만 준비된 상태
- 브라우저는 EME(DRM) 필요. 일부 브라우저·시크릿 모드에서 SDK 연결 실패

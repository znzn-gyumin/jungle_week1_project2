# Flowbee

여러 플랫폼의 음악을 한 곳에서 검색하고 재생하는 서비스의 **백엔드**.

- FastAPI + PostgreSQL 17
- 외부 소스: iTunes Search API, YouTube Data API
- **코드에 주석을 두지 않는다.** 설계 근거와 주의사항은 전부 이 문서에 있다.

프론트엔드는 이 저장소에 없다. `users` / `playlists` / `likes` 관리도 여기에 없다
(아래 "담당 구분" 참고).

**모든 명령은 저장소 루트에서 실행한다.** `.env` 와 `requirements.txt` 도 루트에
하나씩만 있다.

---

## 설치와 실행

### 1. 환경변수

```bash
cp .env.example .env
```

`POSTGRES_*` 는 `backend/docker-compose.yml` 기본값이라 그대로 두면 된다.
`YOUTUBE_API_KEY` 를 비워두면 iTunes 만으로 동작한다.

### 2. 데이터베이스

```bash
docker compose up -d
alembic -c backend/alembic.ini upgrade head
```

파이썬 없이 만들려면 대신 `psql -U jungle -d flowbee -f backend/schema.sql`.
두 경로는 **완전히 동일한 구조**를 만든다 (pg_dump 로 비교 검증함).
SQL 로 만든 DB에 나중에 Alembic 을 붙이려면
`alembic -c backend/alembic.ini stamp head` 로 현재 리비전을 기록시킨다.

**`docker-compose.yml` 은 루트에 있어야 한다.** Compose 는 compose 파일이 있는
디렉터리의 `.env` 를 읽는다. `backend/` 에 두면 루트 `.env` 의 `POSTGRES_PORT` 등이
무시되고 기본값으로 뜬다. 또 Compose 프로젝트 이름이 디렉터리명에서 오므로 위치를
옮기면 볼륨 이름도 바뀌어 **기존 데이터가 딸린 다른 볼륨에 남는다.**

`-c` 로 ini 위치를 지정해야 한다. `alembic.ini` 의 `script_location` 이
루트 기준(`backend/migrations`)이라 다른 디렉터리에서 실행하면 경로를 못 찾는다.

### 3. 의존성

```bash
python -m venv .venv
.venv/Scripts/activate          # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
```

### 4. 실행

```bash
python -m backend
```

`.env` 의 `SERVER_HOST` / `SERVER_PORT` / `RELOAD` 을 읽는다.
API 문서는 <http://127.0.0.1:8000/docs>.

uvicorn 을 직접 부르면 `.env` 의 포트 설정을 무시하고 인자를 따른다.

```bash
uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

### CORS

`CLIENT_ORIGINS` 에 적힌 오리진만 허용한다. **쉼표로 여러 개**를 넣을 수 있고
기본값에 `127.0.0.1:5173` 과 `localhost:5173` 이 둘 다 들어 있다 —
브라우저는 이 둘을 **다른 오리진**으로 취급하므로 하나만 넣으면 다른 쪽에서 막힌다.

`allow_credentials=True` 라서 `allow_origins` 에 `"*"` 를 쓸 수 없다.
와일드카드와 자격증명을 함께 쓰면 브라우저가 거부한다.

---

## 소스와 재생

**Spotify 는 제거했다.** 사용자 로그인 없이 개발자 크레덴셜만으로는 Web Playback SDK
가 동작하지 않아(Client Credentials 미지원 + Premium 필요) 이 제품 구조와 맞지 않았다.

| | 인증 | 검색 | 재생 | 요청 한도 |
|---|---|---|---|---|
| **iTunes** | 없음 | `/search?entity=song\|album` | `previewUrl` 30초 오디오 | IP 당 약 20회/분 (429) |
| **YouTube** | API 키 | `search.list` (100 유닛) | IFrame 임베드 | 하루 10,000 유닛 = **검색 100회** |

`.env` 의 `YOUTUBE_API_KEY` 가 비어 있으면 YouTube 검색은 자동으로 건너뛴다
(`/api/health` 의 `youtube: false`). iTunes 만으로도 동작한다.

YouTube 는 `search.list` 로 영상을 찾은 뒤 `videos.list` 로 길이를 한 번 더 받는다.
`videos.list` 는 1 유닛이라 비용은 사실상 검색값과 같다.

**검색 캐시는 DB 에 두지 않는다.** 서버를 재시작하면 버려도 되는 값이라 테이블로
만들 이유가 없다. 필요해지면 인메모리 dict + TTL 로 충분하다. `tracks` / `albums` 는
검색 결과를 upsert 해두는 곳이지 검색어 캐시가 아니다.

---

## API

인증 없음. 실패 응답은 FastAPI 기본 `detail` 대신 `{"error": "..."}` 로 통일되어
있다. 클라이언트는 이 키를 읽으면 된다.

| Method | Path | 설명 |
|---|---|---|
| GET | `/api/health` | 서버 상태 + YouTube 키 설정 여부 |
| GET | `/api/health/db` | DB 연결 + public 스키마 테이블 수 |
| GET | `/api/search?q=&source=all\|itunes\|youtube&type=track\|album&limit=` | 검색 후 결과를 DB 에 upsert 하고 반환 |
| GET | `/api/tracks?q=&source=&limit=` | DB 에 쌓인 곡. 외부 API 를 부르지 않는다 |
| GET | `/api/tracks/{id}` | 곡 하나 |
| GET | `/api/albums?q=&limit=` | DB 에 쌓인 앨범 |
| GET | `/api/albums/{id}` | 앨범 하나 |

`type=album` 은 iTunes 만 지원한다. YouTube 에는 앨범 개념이 없어
`source=youtube&type=album` 은 502 를 준다.

곡 응답에는 앨범이 중첩된다. YouTube 곡은 `album: null` 이다.

```json
{ "id": 51, "source": "itunes", "title": "Viva La Vida", "artist": "Coldplay",
  "durationMs": 242373, "playUrl": "https://audio-ssl.itunes.apple.com/....m4a",
  "album": { "id": 22, "name": "Viva La Vida (Prospekt's March Edition)",
             "releaseDate": "2008-06-12", "totalTracks": 10 } }
```

**중첩 앨범은 `selectinload` 로 미리 읽는다.** async SQLAlchemy 는 암묵적 lazy load
를 허용하지 않아서, 직렬화 시점에 `track.album` 을 건드리면 `MissingGreenlet` 으로
터진다. 곡을 반환하는 모든 조회(`upsert_tracks`, `list_tracks`, `get_track`)에
`options(selectinload(Track.album))` 이 붙어 있다. 새 조회를 추가할 때도 필요하다.

`/api/search` 는 두 소스를 `asyncio.gather` 로 동시에 호출한다. 한쪽이 실패해도
나머지 결과를 반환하고 실패는 `errors` 배열에 담는다. 둘 다 실패하면 502.

```json
{
  "tracks": [
    { "id": 1, "source": "itunes", "sourceId": "1440650711",
      "title": "...", "artist": "...", "durationMs": 355145,
      "thumbnailUrl": "...", "playUrl": "https://audio-ssl.itunes.apple.com/....m4a" }
  ],
  "errors": [{ "source": "youtube", "error": "YouTube 일일 할당량 소진" }]
}
```

---

## 디렉터리 구조

```
.env  .env.example  requirements.txt  docker-compose.yml
│
└── backend/                 파이썬 패키지는 backend 하나
    ├── main.py              앱 생성 · lifespan · 예외 핸들러 · 라우터 등록
    ├── config.py            .env -> 접속 문자열 + API 키
    ├── schemas.py           DB 모델 -> JSON 응답 변환 (track_out · album_out)
    │
    ├── api/                 HTTP 계층. 라우터만. 비즈니스 로직 없음
    │   ├── health.py        /api/health
    │   ├── search.py        /api/search
    │   ├── tracks.py        /api/tracks
    │   └── albums.py        /api/albums
    │
    ├── services/            여러 계층을 엮는 곳
    │   └── search.py        소스 동시 호출 + 부분 실패 수집 + upsert 호출
    │
    ├── sources/             외부 플랫폼 클라이언트. DB 를 모른다
    │   ├── itunes.py        Search API 호출 + 응답 -> 컬럼 매핑
    │   └── youtube.py       Data API 호출 + ISO8601 길이 파싱
    │
    ├── db/                  DB 접근 계층. HTTP 를 모른다
    │   ├── base.py          Base · 제약조건 네이밍 규칙 · 공통 mixin
    │   ├── session.py       asyncpg 엔진 + get_db 의존성
    │   └── repository.py    ON CONFLICT upsert · 조회
    │
    ├── models/              SQLAlchemy 모델 (from backend.models import Track)
    ├── migrations/          Alembic
    ├── schema.sql           순수 SQL 생성 스크립트. 스택 무관
    └── README.md            이 문서
```

### 계층 규칙

```
api  ->  services  ->  sources (외부 API)
                  ->  db (Postgres)
```

- **`api/`** 는 요청을 받아 검증하고 `services` 를 부른 뒤 응답으로 바꾼다.
  외부 API 나 SQL 을 직접 부르지 않는다.
- **`sources/`** 는 외부 API 만 안다. `AsyncSession` 을 받지 않고, 반환값은
  DB 컬럼 이름에 맞춘 평범한 dict 다. 그래서 DB 없이 단위 테스트가 된다.
- **`db/repository.py`** 는 SQL 만 안다. 어느 플랫폼에서 온 데이터인지 모른다.
- **`services/search.py`** 가 둘을 잇는다. 두 소스를 `asyncio.gather` 로 동시에
  호출하고, 한쪽이 실패해도 나머지를 반환하며 실패를 `errors` 로 모은다.

새 소스(예: SoundCloud)를 붙이려면 `sources/` 에 파일 하나를 더하고
`services/search.py` 의 `_FETCHERS` 에 등록하면 된다. `api/` 는 건드리지 않는다.

### 담당 구분

이 저장소의 `gyumin_dev` 는 **외부 API 검색·재생**을 맡는다.
`users` / `playlists` / `likes` 관리는 `junho_dev` 에서 진행한다.
세 테이블은 스키마에 이미 있지만 이 브랜치에는 해당 라우터가 없다.
붙일 때는 `api/` 에 라우터를 추가하고 `db/repository.py` 에 조회를 더하면 된다.

---

## 테이블

```
users ──< playlists ──< playlist_tracks >── tracks >── albums
  │           │                                          │
  └──< likes ─┴──────────────────────────────────────────┘
```

`likes` 는 앨범 또는 플레이리스트 중 하나를 가리킨다.

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
`duration_ms` · `thumbnail_url` · `play_url` · `created_at` · `updated_at`

UNIQUE `(source, source_id)` · INDEX `album_id`, `lower(title)`
`album_id` → `albums` **ON DELETE SET NULL** (YouTube 곡은 NULL)

**재생 방식이 소스마다 다르다.**

| | `source_id` | `play_url` | 렌더링 |
|---|---|---|---|
| iTunes | `trackId` (숫자) | `previewUrl` — **30초** 오디오 파일 | `<audio src={play_url}>` |
| YouTube | video id (11자) | `youtube.com/embed/{source_id}` | `<iframe src={play_url}>` |

**`play_url` 이 채워져 있어도 프론트는 `source` 로 분기해야 한다.** 두 값은 종류가
다르다 — iTunes 는 오디오 파일, YouTube 는 임베드 페이지다. `<audio>` 는 임베드
URL 을 재생하지 못하고 `<iframe>` 은 m4a 를 플레이어로 그리지 못한다.

```jsx
track.source === 'itunes'
  ? <audio src={track.play_url} controls />
  : <iframe src={track.play_url} allow="autoplay" />
```

YouTube Data API 는 재생 가능한 오디오 파일 URL 을 주지 않는다. video 리소스의
`player` 파트가 주는 것은 `<iframe>` 태그 문자열이고, 리소스 어디에도 미디어
스트림 URL 이 없다. 그래서 YouTube 의 `play_url` 은 `source_id` 로 조립한
임베드 URL 이다 — API 응답을 그대로 담은 값이 아니라 **파생값**이다.

googlevideo 스트림 URL 추출은 쓰지 않는다. 약관 위반이고, 그 URL 들은 만료 시각이
박혀 있어 DB 에 저장하면 몇 시간 뒤 죽는다.

**웹페이지 링크(`external_url`)는 두지 않는다.** 재생에 필요 없고, 필요해지면
`source_id` 에서 파생할 수 있다 (`youtube.com/watch?v={source_id}`,
`music.apple.com/album/{collectionId}?i={source_id}`).
다만 Apple 은 API 의 미리듣기·아트워크를 "스토어 콘텐츠 홍보 목적"으로만 쓰고
사운드 샘플은 스토어 배지 근처에 두라고 안내한다. 외부 공개 서비스로 확장한다면
그때 다시 볼 지점이다.

iTunes 필드 매핑: `trackId`→`source_id`, `trackName`→`title`, `artistName`→`artist`,
`collectionId`→앨범 조회, `trackTimeMillis`→`duration_ms`, `artworkUrl100`→`thumbnail_url`,
`previewUrl`→`play_url`. (`trackViewUrl` 은 저장하지 않는다)

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

### 삭제 전파

유저를 지우면 그 사람의 `playlists` / `playlist_tracks` / `likes` 가 함께 사라지고,
공용 캐시인 `tracks` / `albums` 는 남는다.
앨범을 지우면 그 앨범의 트랙은 `album_id` 만 NULL 이 되고 트랙 자체는 유지된다.
곡을 지우면 그 곡을 가리키던 `playlist_tracks` 가 CASCADE 로 사라진다.

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

## 아직 없는 것

**자체 로그인** — `users` 테이블은 있지만 회원가입/로그인 경로가 없다. 따라서
`playlists` / `likes` 도 아직 API 가 없다. 붙일 때는 비밀번호 해시(argon2 등)와
세션 저장소가 필요하다. 인메모리 dict 는 서버 재시작 시 로그아웃되므로 실제
운영에서는 Redis 나 DB 로 간다.

**플랫폼 간 같은 곡 병합** — iTunes 의 "Bohemian Rhapsody" 와 YouTube 의 같은 곡은
`source` 가 달라 별개의 `tracks` 행이다. 검색 결과에 두 번 뜬다. ISRC 같은 공용
식별자가 없어 제목·아티스트 휴리스틱 말고는 방법이 없고, 라이브/리마스터/커버가
섞이는 위험이 있어 도입하지 않았다.

**`artist` 가 단순 텍스트** — 아티스트 테이블이 없어 플랫폼 간 동일 아티스트를
식별할 수 없다. YouTube 는 `channelTitle` 이 들어가므로 iTunes 의 아티스트명과
표기가 다를 수 있다.

**`playlists.total_tracks` 자동 갱신** — 비정규화 사본이라 곡을 담고 뺄 때
애플리케이션이 함께 갱신해야 한다. 트리거는 걸지 않았다.

# Flowbee

여러 플랫폼의 음악을 한 곳에서 검색하고 재생하는 서비스의 **백엔드**.

- FastAPI + PostgreSQL 17
- 외부 소스: iTunes Search API, YouTube Data API
- **코드에 주석을 두지 않는다.** 설계 근거와 주의사항은 전부 이 문서에 있다.

## 이 저장소의 범위

두 갈래가 합쳐져 있다.

- **검색·카탈로그** — iTunes / YouTube 를 병렬로 부르고 결과를 `tracks` ·
  `albums` 에 upsert 한다. `api/` → `services/` → `sources/` · `db/` 계층.
- **회원·플레이리스트·좋아요** — 자체 계정, 세션 쿠키, 플레이리스트 CRUD.
  `routers/` + `accounts.py` · `security.py` · `serializers.py` · `sessions.py`.

두 갈래는 계층 구조가 다르다. 새 코드를 어디에 둘지는
[계층 규칙](#계층-규칙) 을 볼 것.

프론트엔드는 `client/` 에 있고, 제품 화면이 아니라 **API 를 눌러보는 개발 도구**
하나뿐이다 ([API Lab](#api-lab)).

**모든 명령은 저장소 루트에서 실행한다.** `.env` 와 `requirements.txt`,
`docker-compose.yml` 은 루트에 하나씩만 있다.

---

## 빠른 시작

```bash
cp .env.example .env                              # 1. 환경변수
docker compose up -d                              # 2. DB 컨테이너
alembic -c backend/alembic.ini upgrade head       #    스키마 적용

python -m venv .venv                              # 3. 의존성
.venv/Scripts/activate                            #    macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt

python -m backend                                 # 4. 실행
```

API 문서는 <http://127.0.0.1:8000/docs>.

### Docker 없이 DB 띄우기

`docker` 그룹 권한이 없거나 데몬을 못 쓰면 `scripts/db.sh` 를 쓴다. `pgserver`
패키지가 들고 오는 PostgreSQL 바이너리를 루트 권한 없이 `.pgdata/` 에 띄운다.

```bash
uv venv --python 3.12 .venv-pg                    # 1. 서버 전용 venv (앱 venv 와 별개)
uv pip install --python .venv-pg/bin/python pgserver

npm run db                                        # 2. initdb + 기동 + flowbee DB 생성
alembic -c backend/alembic.ini upgrade head       # 3. 스키마 적용
```

`pgserver` 는 `cp39`~`cp312` 휠만 있다. 앱 venv 가 3.13 이상이면 위처럼 3.12
전용 venv 를 따로 판다. 접속 정보는 `.env` 의 `POSTGRES_*` 를 그대로 읽으므로
Compose 경로와 동일하다.

| 명령 | 하는 일 |
|---|---|
| `npm run db` | 없으면 initdb, 이미 떠 있으면 그대로 둔다 |
| `npm run db:stop` | fast shutdown |
| `npm run db:reset` | `.pgdata/` 삭제 후 재생성 + 마이그레이션 |
| `./scripts/db.sh psql` | `flowbee` 에 psql 접속 |

`npm run dev` 는 `predev` 로 `npm run db` 를 먼저 부른다. Compose 로 이미 5432 를
띄운 상태면 `db.sh` 가 그걸 감지하고 손대지 않고 빠진다.

`.pgdata/` 와 `.venv-pg/` 는 `.gitignore` 에 있다.

### 환경변수

| 키 | 기본값 | 설명 |
|---|---|---|
| `YOUTUBE_API_KEY` | (없음) | 비우면 YouTube 검색을 건너뛰고 iTunes 만 쓴다 |
| `ITUNES_COUNTRY` | `KR` | iTunes 는 국가별로 카탈로그가 다르다 |
| `CLIENT_ORIGINS` | `127.0.0.1:5173,localhost:5173` | CORS 허용 오리진. 쉼표로 여러 개 |
| `SERVER_HOST` / `SERVER_PORT` / `SERVER_RELOAD` | `127.0.0.1` / `8000` / `false` | `python -m backend` 가 읽는다 |
| `COOKIE_SECURE` | `false` | HTTPS 배포에서 `true`. 세션 쿠키에 `Secure` 가 붙는다 |
| `POSTGRES_*` | `jungle` / `flowbee` | `docker-compose.yml` 기본값과 맞춰져 있다 |

`YOUTUBE_API_KEY` 는 **`.env` 에만** 둔다. `config.py` 의 기본값 자리에 넣으면
git 에 커밋된다.

### DB 를 만드는 두 가지 방법

Alembic 대신 순수 SQL 로도 만들 수 있다.

```bash
psql -U jungle -d flowbee -f backend/schema.sql
```

두 경로는 **완전히 동일한 구조**를 만든다 (pg_dump 로 비교 검증함).
SQL 로 만든 DB 에 나중에 Alembic 을 붙이려면
`alembic -c backend/alembic.ini stamp head` 로 현재 리비전을 기록시킨다.

### uvicorn 을 직접 부를 때

```bash
uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

이때는 `.env` 의 `SERVER_*` 대신 명령행 인자를 따른다.

---

## API Lab

`client/` 는 제품 화면이 아니라 **API 를 손으로 눌러보는 개발 도구**다. 패널마다
엔드포인트 목록·요청 본문 형태·응답 키 설명이 붙어 있고, 오른쪽에 요청 로그가
쌓인다.

```bash
npm install
npm run dev          # API(8000) + 페이지(3001) + Vite(5173) 동시 실행
npm run dev:devlab   # Vite 만 따로 띄울 때
```

<http://127.0.0.1:5173> 로 연다. Vite 가 `/api` 를 8000 으로 프록시하므로 쿠키가
same-origin 으로 붙는다. **8000 을 직접 열면 로그인 쿠키가 다르게 동작하니
5173 으로 볼 것.**

패널은 상단 `확인할 API` 셀렉트로 고른다. 기본값이 `유저 정보 API` 라, 검색을
눌러보려면 `곡 · 앨범` 로 바꿔야 한다. `곡 · 앨범` 과 `유저 정보 API` 는
비로그인 상태에서도 열린다 — `/api/search` · `/api/tracks` · `/api/albums` 는
인증이 필요 없다. 나머지 세 패널만 로그인을 요구한다.

헤더의 배지 세 개는 `/api/health` 와 `/api/health/db` 를 부른 결과다.

| 배지 | 뜻 |
|---|---|
| `api` | 서버가 떠 있는지 |
| `db` | `public` 스키마 테이블 수. `0 tables` 면 마이그레이션이 안 됐다 |
| `youtube` | `YOUTUBE_API_KEY` 로드 여부. `off` 면 iTunes 만 검색된다 |

`youtube off` 는 대개 서버가 낡은 `.env` 를 물고 있다는 뜻이다. `get_settings()`
가 `lru_cache` 라 `.env` 를 고쳐도 프로세스를 다시 띄우기 전에는 안 바뀐다.

배포 대상이 아니다. 지울 때는 `client/` 와 `vite.config.js` 를 지우고
`package.json` 에서 `react` · `react-dom` · `@vitejs/plugin-react` · `vite` 와
`dev:devlab` · `build` · `preview` 스크립트를 빼면 된다. `package.json` 자체는
`app.js` 가 쓰는 `express` 때문에 남겨야 한다.

---

## 아키텍처

```
.env  .env.example  requirements.txt  docker-compose.yml
package.json  vite.config.js
│
├── backend/                 파이썬 패키지는 backend 하나
│   ├── __main__.py          python -m backend 진입점
│   ├── main.py              앱 생성 · lifespan · 예외 핸들러 · 라우터 등록
│   ├── config.py            .env -> 접속 문자열 + API 키
│   ├── schemas.py           Pydantic 응답 모델 (TrackOut · AlbumOut · ...)
│   │
│   ├── api/                 검색·카탈로그 HTTP 계층. 라우터만
│   │   ├── health.py  search.py  tracks.py  albums.py
│   │   └── __init__.py      DEFAULT_LIMIT · MAX_LIMIT
│   │
│   ├── services/            여러 계층을 엮는 곳
│   │   └── search.py        소스 병렬 호출 · 부분 실패 수집 · upsert 호출
│   │
│   ├── sources/             외부 플랫폼 클라이언트. DB 를 모른다
│   │   ├── itunes.py        Search API 호출 + 응답 -> 컬럼 매핑
│   │   └── youtube.py       Data API 호출 + ISO8601 길이 파싱
│   │
│   ├── routers/             회원·플레이리스트·좋아요 HTTP 계층
│   │   └── users.py  playlists.py  likes.py
│   ├── accounts.py          로그인 의존성 (CurrentUser · OptionalUser · DbSession)
│   ├── security.py          비밀번호 해시 · 검증
│   ├── sessions.py          인메모리 세션 저장소 (TTL · 유저별 색인)
│   ├── ratelimit.py         로그인 실패 카운터 (인메모리, 고정 창)
│   ├── serializers.py       위 라우터들의 dict 응답 (camelCase 수기 변환)
│   │
│   ├── db/                  DB 접근 계층. HTTP 를 모른다
│   │   ├── base.py          Base · 제약조건 네이밍 규칙 · 공통 mixin
│   │   ├── session.py       asyncpg 엔진 + get_db 의존성
│   │   └── repository.py    ON CONFLICT upsert · 조회
│   │
│   ├── models/              SQLAlchemy 모델 (from backend.models import Track)
│   ├── migrations/          Alembic
│   ├── schema.sql           순수 SQL 생성 스크립트. 스택 무관
│   ├── devtools/            배포 전 삭제 대상. integration_test.py · regression_test.py
│   └── README.md            이 문서
│
└── client/                  API Lab. Vite + React
    ├── index.html
    └── src/
        ├── main.jsx  api.js  styles.css
        └── devlab/          패널 · 요청 로그 · 엔드포인트 레퍼런스
```

### 계층 규칙

검색·카탈로그 쪽:

```
api  ->  services  ->  sources (외부 API)
                  ->  db (Postgres)
```

- **`api/`** 는 요청을 검증하고 `services` 나 `repository` 를 부른 뒤 응답으로
  바꾼다. 외부 API 나 SQL 을 직접 부르지 않는다.
- **`sources/`** 는 외부 API 만 안다. `AsyncSession` 을 받지 않고 반환값은
  DB 컬럼 이름에 맞춘 dict 다. 그래서 DB 없이 단위 테스트가 된다.
- **`db/repository.py`** 는 SQL 만 안다. 어느 플랫폼에서 온 데이터인지 모른다.
- **`services/search.py`** 가 둘을 잇는다.

외부 API 를 부르는 라우트는 `/api/search` 하나뿐이다. `/api/tracks` 와
`/api/albums` 는 DB 만 읽는다.

회원·플레이리스트·좋아요 쪽:

```
routers  ->  db (Postgres)
```

`services` / `repository` 를 거치지 않고 `routers/*.py` 가 SQLAlchemy 를 직접
쓴다. 외부 API 호출이 없어서 끼울 것이 없기 때문이다. **두 갈래가 아직 하나로
정리되지 않았다는 뜻이므로**, 응답 형태도 아래처럼 갈라져 있다.

| | 응답 생성 | camelCase 변환 |
|---|---|---|
| `api/` | `schemas.py` 의 Pydantic 모델 | `alias_generator=to_camel` |
| `routers/` | `serializers.py` 의 dict 반환 | 수기 |

바깥에서 보는 JSON 은 같은 모양이지만 (`track` 객체는 양쪽 다 `album` 을 중첩
한다), **한쪽을 고치면 다른 쪽도 같이 고쳐야 한다.** 합칠 때는 `serializers.py`
를 `schemas.py` 로 흡수시키는 방향이다.

### 새 소스를 붙이려면

1. `sources/` 에 파일 하나 (`fetch` 용 함수 + `to_track` 매퍼)
2. `models/enums.py` 의 `SourceType` 에 값 추가
3. `services/search.py` 의 `_FETCHERS` 에 `Fetcher(fetch, persist)` 등록
4. 마이그레이션으로 PG enum 에 값 추가

`api/` 는 건드리지 않는다. 2번만 하고 3번을 빠뜨리면 **import 시점에
`RuntimeError` 로 즉시 알려준다.**

---

## API

**모든 실패 응답이 `{"error": "..."}` 형태다.** 404·405 처럼 라우트에 닿지 못한
경우까지 포함하므로 클라이언트는 `error` 키만 읽으면 된다.

### 검색 · 카탈로그 — 인증 없음

| Method | Path | 설명 |
|---|---|---|
| GET | `/api/health` | 서버 상태 + YouTube 키 설정 여부 |
| GET | `/api/health/db` | DB 연결 + public 스키마 테이블 수 |
| GET | `/api/search?q=&source=all\|itunes\|youtube&type=track\|album&limit=` | 외부 검색 후 DB 에 upsert 하고 반환 |
| GET | `/api/tracks?q=&source=&limit=` | DB 에 쌓인 곡. 외부 API 를 부르지 않는다 |
| GET | `/api/tracks/{id}` | 곡 하나 |
| GET | `/api/albums?q=&limit=` | DB 에 쌓인 앨범 |
| GET | `/api/albums/{id}` | 앨범 하나 |

`limit` 은 기본 25, 최대 50 (`api/__init__.py`).
`type=album` 은 iTunes 만 지원해서 `source=youtube&type=album` 은 502 다.

응답 스키마는 `/openapi.json` 에 전부 정의되어 있다. 필드는 camelCase 다.

### 계정

| Method | Path | 본문 | 설명 |
|---|---|---|---|
| POST | `/api/users/signup` | `{nickname, email, password}` | 가입 즉시 로그인. 201 |
| POST | `/api/users/login` | `{email, password}` | 틀리면 401. 실패가 쌓이면 429 |
| POST | `/api/users/logout` | | 세션 파기 |
| GET | `/api/users/me` | | 비로그인이면 **401 이 아니라** `{"loggedIn": false}` |
| PATCH | `/api/users/me` | `{nickname?, email?, password?}` | 보낸 필드만 바뀐다 |
| DELETE | `/api/users/me` | | 플레이리스트·좋아요 CASCADE |

로그인은 계정이 없어도 더미 해시로 같은 비용의 scrypt 검증을 돌린다. 응답 시간으로
가입 여부를 알아내지 못하게 하려는 것이다. 실패는 (클라이언트 IP, 이메일) 별로
세어서 `ratelimit.LOGIN_MAX_ATTEMPTS` 회에 닿으면 창이 끝날 때까지 429 (`Retry-After`
헤더 포함) — 그 동안은 **비밀번호가 맞아도 거절**한다. 카운터는 세션과 마찬가지로
프로세스 메모리라 단일 워커 전제다.

비밀번호를 바꾸면 그 계정의 **다른 세션은 전부 끊긴다** (요청을 보낸 세션만 남는다).
계정 삭제도 현재 쿠키가 아니라 그 계정의 모든 세션을 파기한다.

닉네임·이메일 중복은 409. 어느 쪽인지는 제약조건 이름(`uq_users_email_lower` ·
`uq_users_nickname_lower`)으로 가른다. 그 밖의 `IntegrityError` 는 409 로 감추지
않고 그대로 올려보낸다 — FK·NOT NULL 위반이 "닉네임 중복"으로 둔갑하면 안 된다.
유일성은 `lower(nickname)` · `lower(email)` 함수 인덱스
라서 **대소문자를 무시한다** — `Alice` 와 `alice` 는 같은 닉네임이다. 이메일은
추가로 소문자 정규화해서 저장하지만, 닉네임은 입력한 표기 그대로 남는다.

### 플레이리스트 — 로그인 필요

| Method | Path | 본문 | 설명 |
|---|---|---|---|
| POST | `/api/playlists` | `{name, description?, isPublic?}` | 기본 비공개 |
| GET | `/api/playlists?limit=` | | 내 것만. 기본 50, 최대 200 |
| GET | `/api/playlists/public` | | `view_count` 내림차순 |
| GET | `/api/playlists/{id}` | | 수록곡 포함. 타인이 열면 `view_count` +1 |
| PATCH | `/api/playlists/{id}` | `{name?, description?, isPublic?}` | |
| DELETE | `/api/playlists/{id}` | | |
| POST | `/api/playlists/{id}/tracks` | `{trackId}` | 맨 뒤에 추가 + `totalTracks` +1 |
| DELETE | `/api/playlists/{id}/tracks/{itemId}` | | `position` 재정렬 + `totalTracks` −1 |
| PUT | `/api/playlists/{id}/tracks/order` | `{itemIds: [...]}` | 모든 항목을 한 번씩 담아야 200, 아니면 400 |

남의 것은 비공개면 403, 수정·삭제는 공개 여부와 무관하게 403.
`{itemId}` 는 `tracks.id` 가 아니라 `playlist_tracks.id` 다 — 같은 곡을 두 번
담을 수 있으므로 곡 id 로는 어느 항목인지 특정할 수 없다.

### 좋아요 — 로그인 필요

| Method | Path | 설명 |
|---|---|---|
| GET | `/api/likes?limit=` | `albums` / `playlists` 로 나눠서. 기본 50, 최대 200 |
| PUT | `/api/likes/albums/{id}` | 멱등. 이미 있으면 `created: false` |
| DELETE | `/api/likes/albums/{id}` | 없어도 200, `removed: false` |
| PUT | `/api/likes/playlists/{id}` | 비공개 남의 것이면 403 |
| DELETE | `/api/likes/playlists/{id}` | |

### 인증

로그인하면 `uid` 쿠키(HttpOnly · SameSite=Lax · 30일 · `COOKIE_SECURE=true` 면
Secure)가 나가고, 세션 본문은 **서버 프로세스 메모리**(`sessions.py`)에 있다.
서버를 재시작하면 전원 로그아웃 된다. 워커를 여러 개 띄우면 요청마다 다른 프로세스에
붙어 로그인이 오락가락하므로, 지금 구조에서는 **단일 워커로만 돌려야 한다.**
Redis 나 DB 로 옮기는 것이 다음 단계다.

서버 쪽 세션에도 쿠키와 같은 수명(`sessions.SESSION_TTL`)이 붙어 있다. 만료된
세션은 조회 시점에 사라지고, 새 세션을 만들 때 남은 항목을 한 번씩 청소한다.
로그아웃 없이 재로그인만 반복해도 dict 가 무한히 자라지 않는다.

`/api/users/me` 만 비로그인을 정상 응답으로 취급한다. 나머지 보호 라우트는
`{"error": "로그인이 필요합니다", "loggedIn": false}` 와 함께 401 이다.

### `/api/search` 응답

한쪽 소스가 실패해도 나머지를 반환하고 실패는 `errors` 에 담는다.
**둘 다 실패해야 502** 다.

```json
{
  "tracks": [
    { "id": 51, "source": "itunes", "sourceId": "1128141246",
      "title": "Viva La Vida", "artist": "Coldplay",
      "album": { "id": 22, "name": "Viva La Vida (Prospekt's March Edition)",
                 "releaseDate": "2008-06-12", "totalTracks": 10 },
      "durationMs": 242373,
      "thumbnailUrl": "https://is1-ssl.mzstatic.com/....jpg",
      "playUrl": "https://audio-ssl.itunes.apple.com/....m4a" }
  ],
  "albums": [],
  "errors": [{ "source": "youtube", "error": "YouTube 일일 할당량 소진" }]
}
```

곡 응답에는 앨범이 중첩된다. YouTube 곡은 `album: null` 이다.

---

## 데이터 모델

```
users ──< playlists ──< playlist_tracks >── tracks >── albums
  │           │                                          │
  └──< likes ─┴──────────────────────────────────────────┘
```

`likes` 는 앨범 또는 플레이리스트 중 하나를 가리킨다.
`source_type` = ENUM(`'itunes'`, `'youtube'`)

### users — 계정

`id` · `nickname`(30) · `email`(255) · `password_hash`(255) ·
`created_at` · `updated_at`

UNIQUE INDEX `lower(nickname)` · `lower(email)`

유일성을 **대소문자 무시**로 건다. 평범한 UNIQUE 는 대소문자를 구분해서
`Gyumin` 과 `gyumin`, `A@x.com` 과 `a@x.com` 이 서로 다른 계정이 된다.
조회할 때도 `lower(email) = lower(?)` 로 해야 인덱스를 탄다.

### albums — 외부 플랫폼 앨범 캐시

`id` · `source` · `source_id`(128) · `name` · `artist` · `release_date` ·
`total_tracks` · `thumbnail_url` · `created_at` · `updated_at`

UNIQUE `(source, source_id)`

YouTube 에는 앨범 개념이 없어 실질적으로 전부 iTunes(`collection`) 레코드다.

### tracks — 곡 캐시 (iTunes 곡 / YouTube 영상)

`id` · `source` · `source_id`(128) · `title` · `artist` · `album_id` ·
`duration_ms` · `thumbnail_url` · `play_url` · `created_at` · `updated_at`

UNIQUE `(source, source_id)` · INDEX `album_id`
`album_id` → `albums` **ON DELETE SET NULL** (YouTube 곡은 NULL)

**재생 방식이 소스마다 다르다.**

| | `source_id` | `play_url` | 렌더링 |
|---|---|---|---|
| iTunes | `trackId` (숫자) | `previewUrl` — **30초** 오디오 파일 | `<audio src={playUrl}>` |
| YouTube | video id (11자) | `youtube.com/embed/{source_id}` | `<iframe src={playUrl}>` |

**`play_url` 이 채워져 있어도 프론트는 `source` 로 분기해야 한다.** 두 값은 종류가
다르다 — iTunes 는 오디오 파일, YouTube 는 임베드 페이지다. `<audio>` 는 임베드
URL 을 재생하지 못하고 `<iframe>` 은 m4a 를 플레이어로 그리지 못한다.

YouTube 의 `play_url` 은 API 응답이 아니라 `source_id` 로 조립한 **파생값**이다.
Data API 는 재생 가능한 파일 URL 을 주지 않는다. googlevideo 스트림 URL 추출은
약관 위반이고, 그 URL 들은 만료 시각이 박혀 있어 DB 에 저장하면 몇 시간 뒤 죽는다.

**웹페이지 링크는 저장하지 않는다.** 재생에 필요 없고 `source_id` 에서 파생할 수
있다 (`youtube.com/watch?v=...`, `music.apple.com/album/{collectionId}?i=...`).
다만 Apple 은 API 의 미리듣기·아트워크를 "스토어 콘텐츠 홍보 목적"으로만 쓰고
사운드 샘플을 스토어 배지 근처에 두라고 안내한다. 외부 공개 서비스로 확장하면
그때 다시 볼 지점이다.

### playlists — 사용자 플레이리스트

`id` · `user_id` · `name`(100) · `description` · `total_tracks`(기본 0, CHECK ≥ 0) ·
`is_public`(기본 false) · `view_count`(기본 0, CHECK ≥ 0) · `created_at` · `updated_at`

`user_id` → `users` **CASCADE** · INDEX `user_id`, `(view_count DESC) WHERE is_public`

`total_tracks` 는 `playlist_tracks` 개수의 **비정규화 사본**이다. 곡을 담거나 뺄 때
애플리케이션이 함께 갱신해야 하며, 안 하면 실제 개수와 어긋난다.

### playlist_tracks — 플레이리스트 ↔ 트랙 + 재생 순서

`id` · `playlist_id` · `track_id` · `position`(CHECK ≥ 0) · `added_at`

UNIQUE `(playlist_id, position)` **DEFERRABLE INITIALLY DEFERRED** · 두 FK 모두 CASCADE

DEFERRABLE 이라 한 트랜잭션 안에서 여러 행의 `position` 을 한꺼번에 갱신하는
재정렬이 중간 충돌 없이 된다. 같은 곡을 두 번 담는 건 허용한다.

### likes — 앨범/플레이리스트 좋아요

`id` · `user_id` · `album_id` · `playlist_id` · `created_at`

CHECK `num_nonnulls(album_id, playlist_id) = 1`
UNIQUE `(user_id, album_id)` · `(user_id, playlist_id)`
세 FK 모두 CASCADE · INDEX `(user_id, created_at DESC)`, `album_id`, `playlist_id`

**곡 단위 좋아요는 없다.**

### 삭제 전파

유저를 지우면 그 사람의 `playlists` / `playlist_tracks` / `likes` 가 함께 사라지고,
공용 캐시인 `tracks` / `albums` 는 남는다.
앨범을 지우면 그 앨범의 트랙은 `album_id` 만 NULL 이 되고 트랙 자체는 유지된다.
곡을 지우면 그 곡을 가리키던 `playlist_tracks` 가 CASCADE 로 사라진다.

### 자주 쓸 쿼리

```sql
-- 검색 결과 캐싱 (repository.upsert_tracks 가 하는 일)
INSERT INTO tracks (source, source_id, title, artist, ...)
VALUES (...)
ON CONFLICT (source, source_id) DO UPDATE
  SET title = EXCLUDED.title, updated_at = now()
RETURNING id;

-- 좋아요 토글. 중복 체크는 DB 에 맡긴다
INSERT INTO likes (user_id, album_id) VALUES (?, ?)
ON CONFLICT (user_id, album_id) DO NOTHING;

-- 마이페이지 (ix_likes_user_id_created_at 사용)
SELECT * FROM likes WHERE user_id = ? ORDER BY created_at DESC;

-- 플레이리스트 순서 변경. DEFERRABLE 이라 한 트랜잭션에서 한꺼번에
BEGIN;
UPDATE playlist_tracks SET position = ... WHERE playlist_id = ?;
COMMIT;
```

---

## 외부 소스

**Spotify 는 제거했다.** 사용자 로그인 없이 개발자 크레덴셜만으로는 Web Playback
SDK 가 동작하지 않아(Client Credentials 미지원 + Premium 필요) 이 구조와 맞지 않았다.

| | 인증 | 검색 | 재생 | 요청 한도 |
|---|---|---|---|---|
| **iTunes** | 없음 | `/search?entity=song\|album` | `previewUrl` 30초 오디오 | IP 당 약 20회/분 (429) |
| **YouTube** | API 키 | `search.list` (100 유닛) | IFrame 임베드 | 하루 10,000 유닛 = **검색 100회** |

YouTube 는 `search.list` 로 영상을 찾은 뒤 `videos.list` 로 길이를 한 번 더 받는다.
`videos.list` 는 1 유닛이라 비용은 사실상 검색값과 같다.

### YouTube 카테고리 필터

검색에 `videoCategoryId=10`(Music) 을 건다. 카테고리는 **업로더가 직접 고르는
값**(`assignable=true`)이라 음악 영상이 다른 카테고리에 있을 수 있다. 실측상
커버·라이브는 필터가 있어도 대부분 나왔고, 오히려 리액션·강의가 섞이는 쪽이 더
거슬렸다. 다만 `limit` 대비 결과가 몇 건 적게 오기도 한다.

끄려면 `sources/youtube.py` 의 `search_videos` 에서 `videoCategoryId` 한 줄을
지운다. 카테고리 목록은 `videoCategories.list` 로 확인한다 (1 유닛).

임베드 불가 영상 필터(`status.embeddable`)는 넣지 않았다. 실측 74건 중 0건이라
지금은 문제가 되지 않는다. 재생 실패가 잦아지면 `videos.list` 의 `part` 에
`status` 를 더해 걸러낼 수 있다 (추가 비용 없음).

### 검색 캐시는 DB 에 두지 않는다

서버를 재시작하면 버려도 되는 값이라 테이블로 만들 이유가 없다. 필요해지면
인메모리 dict + TTL 로 충분하다. `tracks` / `albums` 는 검색 **결과**를 upsert 해두는
곳이지 검색어 캐시가 아니다.

---

## 스키마를 수정할 때

```bash
alembic -c backend/alembic.ini revision --autogenerate -m "message"
alembic -c backend/alembic.ini upgrade head
alembic -c backend/alembic.ini check     # 모델과 DB 스키마 drift 확인
```

**세 곳을 함께 고쳐야 한다** — `backend/models/*.py`,
`backend/migrations/versions/*.py`, `backend/schema.sql`.
앞의 둘이 어긋나면 `alembic check` 가, `schema.sql` 은 **통합 테스트**가 잡는다
(테스트가 `schema.sql` 로 DB 를 만들기 때문이다). 둘 다 돌려야 세 곳이 맞는지 안다.

`-c` 로 ini 위치만 지정하면 **어느 디렉터리에서 실행해도 된다.**
`script_location` 은 `%(here)s/migrations`(ini 파일 기준)이고 `sys.path` 는
`env.py` 가 `Path(__file__)` 로 저장소 루트를 잡는다.

---

## 통합 테스트

`backend/devtools/integration_test.py` 는 실제 앱을 ASGI 로 띄우고 실제
PostgreSQL 을 상대로 계정·플레이리스트·좋아요 전 흐름을 검증한다. DB 는
**`schema.sql` 로 만들기 때문에 그 파일의 유일한 검증 수단**이기도 하다.

`pgserver` 가 PostgreSQL 바이너리를 함께 배포해서 Docker 도 로컬 설치도 필요 없다.
다만 **cp313+ 휠이 없어 Python 3.12 전용 환경**이 따로 필요하다.

```bash
uv venv --python 3.12 .venv-test
uv pip install --python .venv-test/Scripts/python.exe pgserver -r requirements.txt
.venv-test/Scripts/python.exe backend/devtools/integration_test.py
```

macOS/Linux 는 `.venv-test/bin/python`. 모든 단언이 통과하면 종료 코드 0 이다.

같은 환경에서 도는 `backend/devtools/regression_test.py` 는 좁게 네 가지만 본다 —
세션 TTL 만료·정리, `add_track` 동시 요청의 position/`total_tracks` 무결성,
핸들되지 않은 예외의 `{"error": ...}` 500 응답, 쿠키 `Secure` 플래그.

```bash
.venv-test/bin/python backend/devtools/regression_test.py
```

`uv` 가 없으면 `pip install uv` 로 넣는다. `uv venv` 가
`Missing expected target directory for Python minor version link` 로 실패하면
`%APPDATA%/uv/python/` (macOS/Linux 는 `~/.local/share/uv/python/`) 아래
`cpython-3.12-...` **링크 디렉터리**가 깨진 것이다. 그 링크만 지우고 다시 실행하면
된다 — 옆의 `cpython-3.12.13-...` 실제 설치본은 건드리지 않는다.

---

## 밟기 쉬운 함정

### 설정과 실행

**`.env` 경로는 `config.py` 기준으로 고정한다**
`env_file` 을 `".env"` 같은 상대 경로로 두면 **실행 위치(CWD)** 기준이 되어,
저장소 루트가 아닌 곳에서 실행하면 `.env` 를 못 찾고 **에러 없이 전부 기본값**으로
떨어진다. 다른 DB 에 붙고 YouTube 가 조용히 비활성화된다.

**비밀값은 `SecretStr` 이라 그대로 쓰면 안 된다**
`postgres_password` 와 `youtube_api_key` 는 `SecretStr` 이라 `repr` 에
`'**********'` 로 찍힌다. 대신 **문자열이 필요한 자리에 그대로 넣으면 마스킹된
값이 나간다** — `urlencode({'key': secret})` 은 `key=%2A%2A...` 를 만들어 API
호출이 조용히 실패한다. `settings.youtube_key` 처럼 `.get_secret_value()` 를
거친 값을 쓸 것.

**`docker-compose.yml` 은 루트에 있어야 한다**
Compose 는 compose 파일이 있는 디렉터리의 `.env` 를 읽는다. `backend/` 에 두면
루트 `.env` 의 `POSTGRES_PORT` 등이 무시된다. 또 Compose 프로젝트 이름이
디렉터리명에서 오므로 위치를 옮기면 **볼륨 이름도 바뀌어 기존 데이터가 딸린
다른 볼륨에 남는다.**

**기동 로그는 `uvicorn.error` 로거로 찍는다**
`logging.getLogger("backend")` 처럼 새 로거를 만들면 uvicorn 이 핸들러를 붙이지
않아 **메시지가 조용히 버려진다.** `print` 는 잘 나오지만 한국어 Windows
콘솔(cp949)에서 인코딩 불가 문자를 만나면 `UnicodeEncodeError` 로 startup 이
죽는다 (실제로 em-dash 때문에 한 번 겪었다).

**CORS 는 `127.0.0.1` 과 `localhost` 를 둘 다 넣는다**
브라우저는 이 둘을 **다른 오리진**으로 취급한다. `allow_credentials=True` 라서
`allow_origins` 에 `"*"` 는 쓸 수 없다.

### 비동기 SQLAlchemy

**`AsyncSession` 은 동시에 쓸 수 없다**
`asyncio.gather` 로 여러 코루틴을 돌리면서 **같은 세션**에 쓰면
`InvalidRequestError: concurrent operations are not permitted` 가 난다.
그래서 `services/search.py` 는 소스마다 `fetch`(HTTP)와 `persist`(DB)를 분리해
**HTTP 만 병렬로 돌리고 DB 쓰기는 순차로** 처리한다. 병렬로 얻을 이득은
네트워크 지연이지 DB 가 아니다.

**중첩 관계는 `selectinload` 로 미리 읽는다**
async SQLAlchemy 는 암묵적 lazy load 를 허용하지 않아, 직렬화 시점에
`track.album` 을 건드리면 `MissingGreenlet` 으로 터진다. 곡을 반환하는 모든
조회(`upsert_tracks`, `list_tracks`, `get_track`)에 `options(selectinload(Track.album))`
이 붙어 있다. 새 조회를 추가할 때도 필요하다.

**트랜잭션 경계는 서비스가 쥔다**
`repository` 는 `flush` 만 하고 `commit` 하지 않는다. 검색 한 번이 트랜잭션
하나이며 도중에 실패하면 아무것도 남지 않는다.

**`ondelete` 를 걸었으면 관계에도 `passive_deletes` 를 준다**
`Album.tracks` 는 FK 가 `ON DELETE SET NULL` 인데 설정이 없으면 ORM 이 곡을 전부
로드해 **한 곡씩 UPDATE** 한다 (수록곡 30개면 UPDATE 30번). `passive_deletes="all"`
을 주면 DB 가 한 번에 처리한다. `CASCADE` 쪽 관계들은 `passive_deletes=True` 다.

**`updated_at` 은 upsert 에서 자동 갱신되지 않는다**
`TimestampMixin` 의 `onupdate=func.now()` 는 ORM UPDATE 에서만 동작한다.
`insert().on_conflict_do_update()` 는 Core 구문이라 발동하지 않아 `set_` 에
`"updated_at": func.now()` 를 직접 넣어야 한다. `list_tracks` 가 `updated_at DESC`
로 정렬하므로 빠뜨리면 "최근" 순서가 최초 저장 순서에 고정된다.

**벌크 upsert 전에 중복을 제거한다**
한 배치에 같은 `(source, source_id)` 가 두 번 들어가면 PostgreSQL 이
`ON CONFLICT DO UPDATE command cannot affect row a second time` 로 실패한다.
여러 곡이 같은 앨범을 공유하는 건 흔하다 (실측: 25곡 → 앨범 6개).
`repository._dedupe()` 가 처리한다.

### 스키마와 마이그레이션

**`CheckConstraint(name=...)` 에는 접두사 없는 이름**
`db/base.py` 의 `NAMING_CONVENTION` 이 `ck_<table>_` 를 붙인다.
`name="ck_playlists_foo"` 라고 쓰면 `ck_playlists_ck_playlists_foo` 가 된다.
`name="foo"` 로 줄 것. (`UniqueConstraint` 는 규칙이 이름을 참조하지 않아 무관.)

**`alembic.ini` 에 DB URL 을 넣지 않는다**
`config.set_main_option("sqlalchemy.url", ...)` 은 ConfigParser 를 거치는데 `%` 를
보간 문법으로 해석한다. 비밀번호에 `%` 가 있으면
`ValueError: invalid interpolation syntax` 로 마이그레이션이 죽는다.
`env.py` 는 `settings.sync_database_url` 을 `create_engine` 에 직접 넘긴다.

**`alembic.ini` 에 비 ASCII 문자 금지**
configparser 가 로케일 인코딩(한국어 Windows 는 cp949)으로 읽어
`UnicodeDecodeError` 로 alembic 이 죽는다.

**`env.py` 는 import 순서가 의도적이다**
`sys.path` 에 저장소 루트를 넣은 **뒤에야** `backend.*` 를 import 할 수 있다.
린터를 붙이면 E402 가 뜨는데 `sys.path` 조작을 위로 올릴 수 없으므로 그 규칙을
끄거나 이 파일만 예외 처리한다.

**`source_enum()` 의 `values_callable` 을 지우지 말 것**
지우면 SQLAlchemy 가 멤버 값(`'itunes'`)이 아니라 이름(`'ITUNES'`)을 보낸다.
PG enum 라벨이 소문자라 insert 시 `invalid input value for enum source_type` 로
실패한다.

**`SourceType` 은 `enum.StrEnum` 이다**
`class X(str, Enum)` 은 Python 3.11 부터 `str(...)` 과 f-string 이
`"SourceType.ITUNES"` 를 돌려준다. `__repr__` 이나 로그에 그대로 새는 값이다.
`== "itunes"` 비교와 `.value` 는 양쪽 다 동작한다.

### 검색과 인덱스

**부분검색은 인덱스를 못 탄다**
`title ILIKE '%queen%'` 처럼 앞에 `%` 가 붙으면 btree 인덱스가 무용지물이다.
정렬된 목차로는 "중간에 들어간 값"을 찾을 수 없다. 실측(30만 건):

| | 실행 계획 | 시간 |
|---|---|---|
| 인덱스 없음 | Seq Scan | 65 ms |
| btree on `lower(title)` | Seq Scan (인덱스 무시) | 51 ms |
| pg_trgm GIN | Bitmap Index Scan | **0.45 ms** |

그래서 쓰이지 않던 `ix_tracks_title_lower` 를 지웠다 (`idx_scan` 0회). 데이터가
수만 건을 넘어 검색이 느려지면 `CREATE EXTENSION pg_trgm` 후
`CREATE INDEX ... USING gin (title gin_trgm_ops)` 로 되살린다.

이 DB 로케일(`en_US.utf8`)에서는 `LIKE 'prefix%'` 조차 btree 를 못 쓴다.
`text_pattern_ops` 로 만들어야 한다.

**정렬만 하는 목록도 인덱스가 필요하다**
`repository.list_tracks` 는 `ORDER BY updated_at DESC LIMIT n` 이다. 검색어가
없어도 인덱스가 없으면 전체를 읽고 정렬한다 — 2만 건 실측 `Seq Scan` + `Sort`
(cost 971). `ix_tracks_updated_at` 을 두면 정렬 노드 자체가 사라진다.

**검색어의 `%` `_` 는 이스케이프한다**
LIKE 에서 `%` 는 "아무 글자 0개 이상", `_` 는 "아무 글자 1개"다. 사용자가 `100%`
를 검색하면 의도와 다른 매칭이 된다 (`%` 하나만 넣으면 전곡이 나왔다).
`repository._like()` 가 이스케이프하고 `ilike(..., escape=LIKE_ESCAPE)` 로 넘긴다.
SQL 인젝션은 아니고(파라미터 바인딩은 됨) 검색 의미가 틀어지는 문제다.

### 응답과 오류

**예외 핸들러는 `starlette.exceptions.HTTPException` 에 등록한다**
`fastapi.HTTPException` 은 그 하위 클래스라 함께 잡히지만, **반대로 등록하면
경로를 못 찾았을 때(Starlette 가 던지는 기본 예외) 안 잡혀서** FastAPI 기본
형식인 `{"detail": ...}` 이 그대로 나간다.

**소스 오류만 `errors` 로 삼킨다**
`SOURCE_ERRORS`(ITunesError · YouTubeError · httpx.HTTPError) 만 `errors` 배열에
담고 그 외 예외는 올려보내 500 으로 드러낸다. `except Exception` 으로 전부 잡으면
우리 코드의 버그가 "iTunes 오류"로 둔갑해 조용히 묻힌다.

**응답은 Pydantic 모델로 돌려준다**
`-> dict[str, Any]` 로 두면 `/docs` 와 `/openapi.json` 에 응답 스키마가 비어
프론트가 계약을 볼 수 없다. `schemas.py` 의 모델을 `response_model` 로 지정한다.
필드는 snake_case 로 쓰고 `alias_generator=to_camel` 이 JSON 에서 camelCase 로 바꾼다.

### 외부 API 응답

**YouTube 는 제목을 HTML 이스케이프해서 준다**
`snippet.title` 과 `channelTitle` 에 `&#39;` `&quot;` `&amp;` 가 그대로 들어온다.
`html.unescape()` 를 거치지 않으면 화면에 `Don&#39;t` 이 보인다.

**iTunes 아트워크는 URL 로 크기를 바꾼다**
API 는 `artworkUrl100`(100x100) 만 준다. URL 의 `100x100bb` 를 `600x600bb` 로
바꾸면 큰 이미지가 나온다. **추가 API 호출이 없다.** 크기는
`sources/itunes.py` 의 `ARTWORK_SIZE` 로 조절한다.

---

## 설계 메모

**`tracks` / `albums` 분리**
초안의 `music&album` 단일 테이블(+`type` 컬럼)로는 "플레이리스트 항목은 곡만",
"`likes.album_id` 는 앨범만" 을 FK 로 강제할 수 없다. 대신 `(source, source_id)`
라는 외부 식별자 패턴은 두 테이블이 동일하게 쓴다.

**ISRC 컬럼은 없앴다**
국제 표준 녹음 코드로 플랫폼 간 동일 곡을 묶으려 했으나 이걸 내려주는 소스가
Spotify 뿐이었다. iTunes 도 YouTube 도 주지 않아 영원히 NULL 인 컬럼이 된다.

**`likes` 의 UNIQUE 두 개가 서로 방해하지 않는 이유**
PostgreSQL 은 NULL 을 서로 다른 값으로 취급한다. 앨범 좋아요 행은 `playlist_id` 가
전부 NULL 이지만 `uq_likes_user_id_playlist_id` 에 걸리지 않는다.
한눈에 틀려 보이지만 의도된 구조다 — **지우지 말 것.**

**`playlists.view_count`**
트래픽이 늘면 매 조회마다 `UPDATE ... SET view_count = view_count + 1` 이 행 잠금
경합을 만든다. 나중에 Redis 카운터 + 주기적 flush 로 옮기는 걸 권장.

**비공개로 바뀐 플레이리스트**
좋아요를 누른 뒤 주인이 `is_public` 을 false 로 바꿔도 좋아요 행은 남는다.
마이페이지에서 `is_public` 확인은 애플리케이션 쪽에서 해야 한다.

**드라이버가 두 개인 이유**
앱은 `postgresql+asyncpg`, Alembic 은 `postgresql+psycopg`(동기)를 쓴다.
psycopg3 의 async 모드는 Windows 기본 이벤트 루프(ProactorEventLoop)에서 동작하지
않는다.

---

## 아직 없는 것

**세션 영속화** — `sessions.py` 는 인메모리 dict 다. 재시작하면 전원 로그아웃,
멀티 워커 불가. Redis 나 DB 로 옮겨야 한다.

**응답 계층 통일** — `api/` 는 Pydantic, `routers/` 는 수기 dict 다
([계층 규칙](#계층-규칙)).

**플랫폼 간 같은 곡 병합** — iTunes 의 "Bohemian Rhapsody" 와 YouTube 의 같은 곡은
`source` 가 달라 별개의 `tracks` 행이다. 검색 결과에 두 번 뜬다. ISRC 같은 공용
식별자가 없어 제목·아티스트 휴리스틱 말고는 방법이 없고, 라이브/리마스터/커버가
섞이는 위험이 있어 도입하지 않았다.

**`artist` 가 단순 텍스트** — 아티스트 테이블이 없어 플랫폼 간 동일 아티스트를
식별할 수 없다. YouTube 는 `channelTitle` 이 들어가므로 iTunes 의 아티스트명과
표기가 다를 수 있다.

**페이지네이션** — `limit` 만 있고 `offset` 이 없다.

**추가 후보 테이블** — `follows`, `play_history`

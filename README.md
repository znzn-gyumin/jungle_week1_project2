# Flowbee

여러 플랫폼의 음악을 한 곳에서 검색하고 재생하는 서비스.
제품 소개는 최종 완성 시점에 쓴다. 지금은 실행법과 현재 상태만.

## 구성

| 프로세스 | 포트 | 역할 |
|---|---|---|
| `node app.js` | 3001 | 페이지(`templates/`) + 정적 파일(`static/`) + `/api` 프록시 |
| `uvicorn backend.main:app` | 8000 | API |
| `vite` | 5173 | API Lab (개발 도구, 배포 대상 아님) |

`app.js` 가 `/api` 요청을 8000 으로 넘긴다. 브라우저 입장에서 same-origin 이라
CORS 설정도 `credentials: 'include'` 도 필요 없다.

프록시는 `X-Forwarded-For` 를 원 IP 로 **덮어쓰고**, uvicorn 은
`--forwarded-allow-ips=127.0.0.1` 로 그 프록시만 믿는다. 로그인 시도 제한이 IP 를
구분하려면 둘 다 필요하다 — 자세한 건 [backend/README.md](backend/README.md) 의 계정 절.

API 를 컨테이너로 띄우면 이 값이 `127.0.0.1` 이 아니라 도커 브리지 게이트웨이
(`172.28.0.1`) 다. `docker-compose.yml` 이 `TRUSTED_PROXIES` 로 넣어 준다.

## 실행

두 갈래다. **윈도우면 도커 쪽으로 간다** — `scripts/db.sh` 도 `.venv/bin/uvicorn` 도
POSIX 경로라 아래 네이티브 경로는 윈도우에서 안 돈다.

### 도커 (윈도우 권장)

Docker Desktop(WSL2 백엔드) 과 Node 만 있으면 된다. 파이썬·`uv` 설치 없음.

```powershell
npm install
copy .env.example .env      # YOUTUBE_API_KEY 채우기 + 아래 DB 선택
npm run dev:docker          # postgres + API(8000) 컨테이너 + 페이지(3001) + API Lab(5173)
```

`POSTGRES_HOST=localhost` 로 두면 compose 의 postgres 를 쓰고 마이그레이션까지 자동으로
붙는다. 공유 개발 DB 주소를 그대로 두면 거기에 붙고 마이그레이션은 건너뛴다.

| 명령 | 하는 일 |
|---|---|
| `npm run docker:up` | 이미지 빌드 + `postgres`·`api` 기동 |
| `npm run docker:down` | 정지 |
| `npm run docker:logs` | API 로그 |
| `npm run docker:migrate` | 마이그레이션 수동 실행 |

컨테이너 동작·환경변수·윈도우 함정은
[backend/README.md](backend/README.md#백엔드까지-docker-로-띄우기-윈도우-권장) 참고.

### 네이티브 (macOS · Linux)

```bash
npm install
uv venv --python 3.12 .venv && uv pip install -r requirements.txt
cp .env.example .env                              # YOUTUBE_API_KEY 채우기
```

그다음 DB 를 어디에 붙일지 정한다. `.env.example` 의 기본값은 **공유 개발 DB** 다.

| | `.env` | 준비 |
|---|---|---|
| 공유 개발 DB (기본값) | `POSTGRES_HOST=64.110.116.62` · `POSTGRES_PORT=55432` · 비밀번호는 팀 채널 | 없음. 스키마는 이미 올라가 있다 |
| 로컬 DB | `POSTGRES_HOST=localhost` · `POSTGRES_PORT=5432` | 아래 두 명령 |

로컬 DB 를 쓸 때만:

```bash
uv venv --python 3.12 .venv-pg                          # pgserver 전용 venv
uv pip install --python .venv-pg/bin/python pgserver

npm run db                                              # initdb + 기동 + flowbee 생성
.venv/bin/alembic -c backend/alembic.ini upgrade head   # 스키마 적용
```

이제 띄운다.

```bash
npm run dev        # DB + API(8000) + 페이지(3001) + API Lab(5173)
```

`predev` 의 로컬 DB 기동은 `.env` 의 `POSTGRES_HOST` 가 원격이면 건너뛴다.
Windows 는 `bash` 가 필요한 `scripts/db.sh` 를 못 부르므로 역시 건너뛴다.

<http://localhost:3001> 로 연다.

`predev` 가 `npm run db` 를 먼저 부르지만, `POSTGRES_HOST` 가 원격이면
`scripts/db.sh` 가 로컬 postgres 를 건드리지 않고 그냥 빠진다.

DB 세팅·환경변수·API 스펙 전체는 [backend/README.md](backend/README.md),
공유 DB 접속(TLS 필수)은
[docs/junho_dev/07-shared-dev-db.md](docs/junho_dev/07-shared-dev-db.md) 참고.

## 페이지

SPA 가 아니다. `app.js` 가 `templates/` 의 HTML 을 경로별로 그대로 내려준다.

| 경로 | 파일 | 화면 |
|---|---|---|
| `/` | `index.html` | 메인 (사이드바 + 카드 그리드) |
| `/home` | `home.html` | 랜딩 |
| `/login` | `login.html` | 로그인 |
| `/signup` | `signup.html` | 회원가입 |
| `/forgot-password` | `forgot-password.html` | 비밀번호 재설정 |
| `/album` · `/album.html` | `album.html` | 앨범 상세 |
| `/playlist` · `/playlist.html` | `playlist.html` | 플레이리스트 상세 |

CSS 는 `static/css/pages/`, 스크립트는 `static/js/pages/` 에 페이지별로 하나씩.
`templates/components/` 의 header · sidebar · player · footer 는 **전부 빈 파일**이고
어디서도 include 되지 않는다 — 정적 HTML 이라 include 문법 자체가 없어서, 각 페이지가
공통 영역을 직접 복사해 들고 있다. 조각을 살리려면 템플릿 엔진을 붙이거나 JS 로
주입해야 한다.

## 프론트에서 API 부르기

상대 경로로 부른다. 절대 URL 을 쓰면 쿠키가 안 붙는다.

```js
const res = await fetch('/api/users/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
});
const data = await res.json();
if (!res.ok) throw new Error(data.error);
```

실패 응답은 404 · 405 까지 전부 `{"error": "..."}` 라 `error` 키만 읽으면 된다.
엔드포인트 목록과 요청·응답 형태는 5173 의 API Lab 에서 직접 눌러볼 수 있다.

## 지금 상태

백엔드는 계정 · 검색 · 플레이리스트 · 좋아요가 전부 동작한다.
**화면은 아직 하나도 붙지 않았다 — `static/` 전체에서 `fetch` 호출이 0 건이다.**

| 화면 | 지금 하는 일 |
|---|---|
| login | 빈 값만 검사하고 `/` 로 이동 |
| signup | 비밀번호 8자 · 일치 · 약관 동의만 검사하고 `/login` 으로 이동 |
| forgot-password | 발송 없이 완료 화면만 보여줌 |
| main | 재생 아이콘 토글, 섹션 더보기 / 접기 |
| album · playlist | 좋아요 · 재생 버튼 클래스 토글. 곡 목록은 HTML 하드코딩 |

login · signup · forgot-password 에는 `TODO` 주석이 API 를 꽂을 자리로 남아 있다.
`static/js/common.js` 와 `static/js/player.js` 는 빈 파일이다.

`album.html`(17줄) · `playlist.html`(19줄) 은 아직 뼈대만 있는 상태다.

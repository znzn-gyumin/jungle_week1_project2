# 실행 방법

루트 `README.md` 는 리눅스/macOS + uv 기준 한 갈래만 적혀 있다. 실제로는 **DB 경로 3개
× OS 2개** 조합이라, 여기에 전부 모은다.

**모든 명령은 저장소 루트에서 실행한다.**

## 프로세스 구성

| 프로세스 | 포트 | 역할 |
|---|---|---|
| `node app.js` | 3001 | 페이지(`templates/`) + 정적 파일(`static/`) |
| `uvicorn backend.main:app` | 8000 | API |
| `vite` | 5173 | API Lab (개발 도구, 배포 대상 아님) |

`app.js` 가 `/api` 를 8000 으로 프록시한다. 브라우저에선 same-origin이라 CORS도
`credentials: 'include'` 도 필요 없다. 사람이 여는 주소는 항상 <http://localhost:3001>.

## DB 경로 고르기

| 경로 | 언제 | 리눅스/macOS | 윈도우 |
|---|---|---|---|
| **공유 원격** | 팀원과 데이터 공유. 설치 부담 0 | O | O |
| **Docker** | 로컬 격리, 데이터 마음대로 날려도 됨 | O | O (Docker Desktop) |
| **pgserver** (`.pgdata`) | docker 권한/데몬 없음 | O | X — [윈도우](#윈도우-네이티브) 참고 |

세 경로 모두 `.env` 의 `POSTGRES_*` 만 다르다. 앱 코드는 구분하지 않는다
(`backend/config.py`).

### 공유 원격

`.env.example` 의 기본값이 이미 이쪽이다. 비밀번호만 채우면 끝.

```dotenv
POSTGRES_HOST=64.110.116.62
POSTGRES_PORT=55432
POSTGRES_PASSWORD=<팀 채널의 비밀번호>
```

서버 상세·주의사항은 [07-shared-dev-db.md](07-shared-dev-db.md).

### Docker

`docker-compose.yml` 에는 **postgres 서비스 하나뿐**이다. API·페이지·Vite는 그대로 로컬.

```dotenv
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_PASSWORD=jungle
```

```bash
docker compose up -d
```

`POSTGRES_PASSWORD` 는 컨테이너 첫 기동 때 `pgdata` 볼륨에 박힌다. 나중에 바꾸려면
`docker compose down -v` 로 볼륨째 지워야 한다.

**`docker compose up -d` 를 `npm run dev` 보다 먼저 실행한다.** `predev` 의
`scripts/db.sh start` 가 5432 에 이미 postgres 가 있으면
`port 5432 already served by another postgres (compose?) - leaving it alone` 를 찍고
비켜준다. 순서가 반대면 `.pgdata` 에 별도 클러스터를 만들다 포트 충돌.

정지는 `docker compose down`. `npm run db:stop` / `db:reset` 은 pgserver 전용이라
도커 컨테이너에는 듣지 않는다.

### pgserver

`docker` 그룹 권한이나 데몬이 없을 때. 루트 권한 없이 `.pgdata/` 에 PostgreSQL 을 띄운다.

```bash
uv venv --python 3.12 .venv-pg
uv pip install --python .venv-pg/bin/python pgserver
```

`pgserver` 휠은 `cp39`~`cp312` 만 있다. 앱 venv 가 3.13 이상이어도 상관없다 — 위처럼
**서버 전용 venv 를 따로** 판다.

`.env` 는 Docker 경로와 동일(`localhost:5432`). 이후 `npm run dev` 의 `predev` 가
initdb·기동·`flowbee` DB 생성까지 알아서 한다.

| 명령 | 동작 |
|---|---|
| `npm run db` | 기동 (없으면 initdb) |
| `npm run db:stop` | 정지 |
| `npm run db:reset` | `.pgdata` 삭제 후 재생성 + `alembic upgrade head` |
| `./scripts/db.sh psql` | 이 클러스터에 psql 접속 |

## 리눅스 / macOS

```bash
npm install
uv venv --python 3.12 .venv && uv pip install -r requirements.txt
cp .env.example .env          # YOUTUBE_API_KEY, POSTGRES_PASSWORD 채우기
```

uv 가 없으면:

```bash
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

DB 경로를 고른 뒤 (Docker면 컨테이너 먼저 기동), 마이그레이션:

```bash
.venv/bin/alembic -c backend/alembic.ini current       # 현재 리비전 확인
.venv/bin/alembic -c backend/alembic.ini upgrade head
```

공유 원격 DB 는 **한 명만** 돌린다.

```bash
npm run dev
```

`predev` → `npm run db` → `scripts/db.sh start`. `POSTGRES_HOST` 가 원격이면 로컬
postgres 를 건드리지 않고 그냥 빠져나온다.

## 윈도우

### 권장: WSL2

리눅스 절차가 그대로 통한다. 아래 함정이 전부 사라진다. 저장소는 `/home/...` 아래에
두는 게 좋다 — `/mnt/c/` 는 파일 감시(`--reload`, `nodemon`)가 느리다.

### 윈도우 네이티브

먼저 막히는 지점 4개.

| 위치 | 문제 |
|---|---|
| `package.json` `predev` | `./scripts/db.sh` — cmd.exe 가 `.sh` 를 못 돌린다. `npm run dev` 즉사 |
| `package.json` `dev:api` | `.venv/bin/uvicorn` — 윈도우는 `.venv\Scripts\uvicorn.exe` |
| `package.json` `db:reset` | `.venv/bin/alembic` 같은 문제 |
| `scripts/db.sh` | `.venv-pg/bin/python` 등 POSIX 경로 하드코딩. pgserver 자체는 `win_amd64` 휠이 있지만 이 스크립트로는 못 쓴다 |

그래서 윈도우 네이티브에서 DB 는 **공유 원격 또는 Docker Desktop** 둘 중 하나다.

Python 3.12 + Node LTS 설치 후 PowerShell 에서:

```powershell
npm install
py -3.12 -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
```

`Activate.ps1` 이 실행 정책에 막히면 `Set-ExecutionPolicy -Scope Process RemoteSigned`
를 먼저 실행한다.

마이그레이션:

```powershell
.venv\Scripts\alembic -c backend/alembic.ini upgrade head
```

실행 — `npm run dev` 는 위 이유로 못 쓴다. 터미널 3개:

```powershell
.venv\Scripts\uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
node app.js
npx vite
```

첫 줄은 `.venv\Scripts\python -m backend` 로 대체 가능하다. 이쪽은 `.env` 의
`SERVER_HOST` · `SERVER_PORT` · `SERVER_RELOAD` 를 읽는다.

### 터미널 1개로 줄이려면

`package.json` 에 윈도우 전용 스크립트를 추가한다. `predev` 는 `dev` 에만 붙으므로
`dev:win` 은 DB 스크립트를 건드리지 않는다 — 기존 리눅스 워크플로는 그대로다.

```json
"dev:win": "concurrently -n api,pages,devlab -c cyan,green,magenta \"npm:dev:api:win\" \"npm:dev:pages\" \"npm:dev:devlab\"",
"dev:api:win": ".venv\\Scripts\\uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000",
```

`npm run dev:win` 으로 실행. **아직 저장소에 반영하지 않았다.**

## psql 로 직접 붙기

| DB 경로 | 명령 |
|---|---|
| 공유 원격 | `psql "host=64.110.116.62 port=55432 user=jungle dbname=flowbee sslmode=require"` |
| Docker | `docker compose exec postgres psql -U jungle -d flowbee` |
| pgserver | `./scripts/db.sh psql` |

원격은 `sslmode=require` 가 빠지면 `no pg_hba.conf entry ... no encryption` 으로
거절된다. `.venv-pg` 의 psql 은 SSL 미지원이라 원격에 못 붙는다 — 시스템
`postgresql-client` 를 쓸 것.

## 자주 걸리는 것

| 증상 | 원인 |
|---|---|
| `npm run dev` 가 `db.sh` 에서 죽음 | `.venv-pg` 미설치인데 `POSTGRES_HOST=localhost`. 도커를 쓸 거면 컨테이너를 먼저 띄우거나 `dev:api`/`dev:pages`/`dev:devlab` 를 따로 실행 |
| 포트 5432 충돌 | 도커 컨테이너와 `.pgdata` 클러스터가 동시에. `npm run db:stop` 또는 `docker compose down` |
| `npm run db:reset` 이 아무것도 안 함 | `POSTGRES_HOST` 가 원격. 의도된 안전장치 |
| 로그인 요청에 쿠키가 안 붙음 | 프론트에서 절대 URL 로 호출. 상대 경로(`/api/...`)로 부를 것 |
| 5173 에서 화면이 이상함 | 5173 은 API Lab 이다. 제품 화면은 3001 |

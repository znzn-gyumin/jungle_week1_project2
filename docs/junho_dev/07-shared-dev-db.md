# 공유 개발 DB

팀 공용 PostgreSQL 서버. 로컬 `.pgdata` 대신 이걸 쓰면 데이터가 팀원 간에 공유된다.

| 항목 | 값 |
|---|---|
| 호스트 | `64.110.116.62` |
| 포트 | `55432` (5432 아님) |
| DB | `flowbee` |
| 유저 | `jungle` |
| 비밀번호 | 팀 채널에서 공유 (git 커밋 금지) |
| TLS | **필수** — 평문 연결은 서버가 거부 |
| 버전 | PostgreSQL 17.10 (Ubuntu 24.04 arm64) |

## 팀원 세팅

`.env`에서 다음 3줄만 바꾸면 끝. 유동 IP여도 상관없다.

```dotenv
POSTGRES_HOST=64.110.116.62
POSTGRES_PORT=55432
POSTGRES_PASSWORD=<팀 채널의 비밀번호>
```

`npm run dev` 그대로 쓰면 된다. `predev`의 `npm run db`는 `POSTGRES_HOST`가 원격이면
로컬 postgres를 건드리지 않고 그냥 넘어간다 (`scripts/db.sh`).

psql로 직접 붙을 때:

```bash
psql "host=64.110.116.62 port=55432 user=jungle dbname=flowbee sslmode=require"
```

`sslmode=require` 빠지면 `no pg_hba.conf entry ... no encryption` 으로 거절된다.
pgserver(`.venv-pg`)에 들어있는 psql은 SSL 미지원이라 이 서버에 못 붙는다.
시스템 `postgresql-client` 를 쓸 것.

## 로컬 DB로 되돌리기

```dotenv
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_PASSWORD=jungle
```

## 마이그레이션

공용 DB라서 `alembic upgrade head`는 **한 명만** 돌린다. 현재 리비전 `0001`까지 적용됨.

```bash
.venv/bin/alembic -c backend/alembic.ini current   # 확인
.venv/bin/alembic -c backend/alembic.ini upgrade head
```

`npm run db:reset` 은 원격에서 동작하지 않는다 (의도된 안전장치). 공용 데이터를
날려야 하면 팀에 먼저 알리고 직접 SQL로 처리할 것.

## 서버 구성

- 포트 `55432` — 비표준 포트라 봇 스캐너 대부분 회피
- `pg_hba.conf` 는 `hostssl flowbee jungle` 만 허용. 다른 DB/유저 원격 접속 불가
- `jungle` 은 슈퍼유저 아님. `postgres` 슈퍼유저는 유닉스 소켓 전용
- 비밀번호는 scram-sha-256, 32자 랜덤
- 자체 서명 인증서 (`sslmode=require` 는 통과, `verify-full` 은 실패)
- fail2ban: 인증 5회 실패 시 1시간 밴 (`postgresql-auth`, `sshd` jail)
- OCI Security List + 호스트 iptables 둘 다 55432 개방, 재부팅 후에도 유지

## 주의

공개 인터넷에 노출된 서버다. 비밀번호가 유일한 방어선이므로:

- `.env` 를 절대 커밋하지 말 것 (`.gitignore` 에 이미 있음)
- 스크린샷·PR 본문·이슈에 비밀번호 붙여넣지 말 것
- **실제 개인정보 저장 금지.** 개발용 더미 데이터만.
- 서버 SSH: `ssh -i <키> ubuntu@64.110.116.62`

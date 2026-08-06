# Jungle Music — Spotify Clone MVP

노래 검색 · 아티스트 검색 · **실제 음원 재생** 이 동작하는 최소 구현체.

- 프론트: React 19 + Vite
- 백엔드: **FastAPI** + httpx (Client Secret 은닉 + CORS 회피 프록시)
- 재생: Spotify **Web Playback SDK** (브라우저 자체가 Spotify 재생 기기가 됨)

---

## 필수 조건

| 항목 | 이유 |
|---|---|
| **Spotify Premium 계정** | Web Playback SDK 재생은 Premium 전용. Free 계정은 검색만 됨 (앱이 배너로 알려줌) |
| Spotify Developer 앱 | Client ID / Secret 발급용 |
| Python 3.11+ / Node 20+ | 백엔드 / 프론트 |
| Chrome / Edge / Firefox | SDK 는 EME(DRM) 필요. 일부 브라우저·시크릿 모드에서 실패 |

> 참고: Spotify 는 2024년 11월부터 신규 앱에 `preview_url` 을 `null` 로 내려준다. 30초 미리듣기로는 재생을 구현할 수 없어서 SDK 경로를 쓴다.

---

## 설정

### 1. Spotify 앱 등록

<https://developer.spotify.com/dashboard> → **Create app**

- **Redirect URIs** 에 아래 값을 **정확히** 등록:
  ```
  http://127.0.0.1:8000/api/auth/callback
  ```
  Spotify 는 `http://localhost` 를 거부한다. 반드시 `127.0.0.1`.
- **Which API/SDKs** → `Web API` + `Web Playback SDK` 체크

### 2. 환경변수

```bash
cp .env.example .env
```

`.env` 에 Dashboard 의 Client ID / Client Secret 을 채운다.

### 3. 의존성 설치

```bash
# 백엔드 — .venv 경로는 npm 스크립트가 그대로 참조하므로 위치를 바꾸지 말 것
uv venv && uv pip install -r requirements.txt
# uv 가 없다면: python3 -m venv .venv && .venv/bin/pip install -r requirements.txt

# 프론트
npm install
```

### 4. 실행

```bash
npm run dev   # uvicorn(:8000) + vite(:5173) 동시 실행
```

브라우저에서 **<http://127.0.0.1:5173>** 접속. (`localhost` 로 열면 쿠키 도메인이 달라져 로그인이 유지되지 않음)

API 문서는 <http://127.0.0.1:8000/docs> 에서 확인 가능 (FastAPI 자동 생성).

백엔드만 따로 띄우려면:

```bash
.venv/bin/uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

---

## 동작 확인 체크리스트

1. `Spotify 로 로그인` → Spotify 동의 화면 → 앱으로 복귀
2. 우측 상단 배지가 `premium` 인지 확인
3. 하단 플레이어 바에 `● 브라우저 플레이어 연결됨` 표시
4. **노래** 탭에서 검색 → 행의 `▶` 클릭 → 소리 재생 + 진행바 이동
5. **아티스트** 탭에서 검색 → 카드 클릭 → 인기 트랙 목록 → 재생

---

## API

전부 세션 쿠키(`sid`) 기반. 로그인 안 하면 `401`.

| Method | Path | 설명 |
|---|---|---|
| GET | `/api/health` | 서버 상태 + `.env` 설정 여부 |
| GET | `/api/auth/login` | Spotify 인증 페이지로 리다이렉트 |
| GET | `/api/auth/callback` | 코드 → 토큰 교환 후 세션 발급 |
| GET | `/api/auth/me` | 로그인 유저 (`product` 로 Premium 판별) |
| GET | `/api/auth/token` | SDK 용 access token (자동 갱신됨) |
| POST | `/api/auth/logout` | 세션 파기 |
| GET | `/api/search?q=&type=track\|artist` | 곡 / 아티스트 검색 |
| GET | `/api/artists/:id/top-tracks` | 아티스트 인기 트랙 |
| PUT | `/api/player/transfer` | 브라우저 플레이어를 활성 기기로 전환 |
| PUT | `/api/player/play` | `{ deviceId, uris }` — uris 생략 시 이어재생 |
| PUT | `/api/player/pause?deviceId=` | 일시정지 |

---

## 구조

```
backend/
  main.py       라우트 + 응답 정규화 + 예외 핸들러
  spotify.py    토큰 교환/갱신, Spotify API 래퍼
  sessions.py   인메모리 세션 (재시작하면 로그아웃)
  config.py     env + OAuth scope
client/src/
  App.jsx       화면 전체
  usePlayer.js  Web Playback SDK 연결 훅
  api.js        백엔드 호출
```

모든 실패 응답은 `{"error": "..."}` 형태로 통일된다 (FastAPI 기본 `detail` 대신).
프론트 `api.js` 가 이 키를 읽는다.

## 개발 모드 (계정 청취 기록 보호)

우측 상단 `개발 모드` 토글. 켜면 재생 시작 10초 뒤 자동으로 일시정지한다.
설정은 `localStorage` 에 저장되어 새로고침해도 유지된다.

**이 앱의 재생은 네 계정의 실제 스트리밍이다.** 최근 재생 기록에 남고
Daily Mix / Discover Weekly / Wrapped / 상위 아티스트에 반영된다. Spotify 에는
재생 기록 삭제 기능이 없고, 앱의 Private session 은 SDK 기기에 적용되지 않는다.

개발 모드의 한계 — 완전한 보호가 아니다:

- 30초 스트림 집계는 피하지만, **짧은 재생은 스킵 신호로 잡힐 수 있다**
- 추천 알고리즘의 정확한 가중치는 Spotify 가 공개하지 않는다

오염을 아예 피하려면 평소 듣는 곡으로 테스트하거나, `/api/player/devices` 로
재생 없이 연결 상태만 확인한다.

설정 위치: `client/src/App.jsx` 의 `DEV_STOP_MS`

## Development Mode 앱 제약 (중요)

Extended Quota 승인 전 앱은 Spotify 가 조용히 기능을 깎는다. 실측으로 확인한 내용:

| 항목 | 실제 동작 | 대응 |
|---|---|---|
| `search` 의 `limit` | **11 이상이면 400 `Invalid limit`**. 값과 무관 | `MAX_LIMIT = 10` 으로 고정 (`backend/main.py`) |
| `search` 결과 개수 | `limit=10` 을 보내도 보통 **5개**만 옴 | 그대로 표시 |
| `/artists/{id}/top-tracks` | **403 Forbidden**. `market` 값 무관하게 항상 실패 | `artist:"이름"` 필터 검색으로 자동 대체 |
| `/artists/{id}`, `/albums` | 정상 | — |

Extended Quota 승인을 받으면 `MAX_LIMIT` 을 50 까지 올려도 되고, top-tracks 대체 경로는
자동으로 안 타게 된다 (403 일 때만 fallback).

## 알려진 한계 (MVP 범위)

- 세션이 **인메모리**라 서버 재시작 시 재로그인 필요 → 실서비스는 Redis/DB
- 단일 사용자 기준. 동시 사용자 테스트 안 함
- 다음곡/이전곡/셔플/볼륨/시크 미구현 (재생·일시정지만)
- 플레이리스트, 앨범 상세, 좋아요 미구현

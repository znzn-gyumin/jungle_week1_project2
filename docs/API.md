# Flowbee API 명세

FastAPI 앱(`backend/main.py`), prefix `/api`. Express(`app.js`)가 `/api` 를 FastAPI 로 프록시하므로 브라우저에서는 same-origin.

- 응답 JSON 키는 camelCase.
- 인증은 `uid` 세션 쿠키(HttpOnly, SameSite=Lax, path=/, max-age 30일, HTTPS 환경에서 Secure).
- 오류는 모두 `{"error": "..."}` 형태(422 검증 오류, 500 미처리 예외 포함).

## 엔드포인트 요약

| 메서드 | 경로 | 인증 | 설명 |
|---|---|---|---|
| GET | `/api/health` | - | 서버 상태 + YouTube 키 설정 여부 |
| GET | `/api/health/db` | - | DB 연결 + public 스키마 테이블 수 |
| GET | `/api/search` | - | 외부 소스 검색(트랙/앨범), 결과를 DB 에 upsert |
| GET | `/api/tracks` | - | 저장된 트랙 목록 |
| GET | `/api/tracks/{track_id}` | - | 트랙 단건 |
| GET | `/api/albums` | - | 저장된 앨범 목록 |
| GET | `/api/albums/{album_id}` | - | 앨범 단건 |
| POST | `/api/users/signup` | - | 회원가입 + 즉시 로그인 |
| POST | `/api/users/login` | - | 로그인(시도 제한 있음) |
| POST | `/api/users/logout` | - | 세션 파기 + 쿠키 삭제 |
| GET | `/api/users/me` | 선택 | 로그인 여부 + 내 정보 + 카운트 |
| PATCH | `/api/users/me` | 필수 | 닉네임/이메일/비밀번호 수정 |
| DELETE | `/api/users/me` | 필수 | 회원 탈퇴 |
| POST | `/api/playlists` | 필수 | 플레이리스트 생성 |
| GET | `/api/playlists` | 필수 | 내 플레이리스트 목록 |
| GET | `/api/playlists/public` | - | 공개 플레이리스트(조회수 순) |
| GET | `/api/playlists/{playlist_id}` | 선택 | 상세 + 수록곡. 남의 공개 목록이면 조회수 +1 |
| PATCH | `/api/playlists/{playlist_id}` | 필수(소유자) | 이름/설명/공개여부 수정 |
| DELETE | `/api/playlists/{playlist_id}` | 필수(소유자) | 삭제 |
| POST | `/api/playlists/{playlist_id}/tracks` | 필수(소유자) | 곡 추가(맨 뒤) |
| DELETE | `/api/playlists/{playlist_id}/tracks/{item_id}` | 필수(소유자) | 곡 제거 + position 재정렬 |
| PUT | `/api/playlists/{playlist_id}/tracks/order` | 필수(소유자) | 순서 전체 교체 |
| GET | `/api/likes` | 필수 | 내 좋아요(앨범/플레이리스트) |
| PUT | `/api/likes/albums/{album_id}` | 필수 | 앨범 좋아요 |
| DELETE | `/api/likes/albums/{album_id}` | 필수 | 앨범 좋아요 취소 |
| PUT | `/api/likes/playlists/{playlist_id}` | 필수 | 플레이리스트 좋아요 |
| DELETE | `/api/likes/playlists/{playlist_id}` | 필수 | 플레이리스트 좋아요 취소 |

---

## Health

### GET /api/health

| 항목 | 값 |
|---|---|
| 파라미터 | 없음 |
| 200 | `{"ok": true, "youtube": false}` — `youtube` 는 `YOUTUBE_API_KEY` 설정 여부 |

### GET /api/health/db

| 항목 | 값 |
|---|---|
| 파라미터 | 없음 |
| 200 | `{"ok": true, "tables": 6}` |

---

## Search

### GET /api/search

| 쿼리 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| `q` | string | `""` | 검색어. 공백이면 빈 결과 |
| `source` | `all` \| `itunes` \| `youtube` | `all` | 검색 대상 소스 |
| `type` | `track` \| `album` | `track` | `album` 은 iTunes 만 지원 |
| `limit` | int (1–50) | 25 | |

응답 200

```json
{
  "tracks": [ /* Track */ ],
  "albums": [ /* Album */ ],
  "errors": [ { "source": "youtube", "error": "..." } ]
}
```

| 상태 | 조건 |
|---|---|
| 200 | 일부 소스가 실패해도 결과가 하나라도 있으면 `errors` 에 담아 200 |
| 400 | 지원하지 않는 `type` / `source` |
| 422 | `limit` 범위 밖 |
| 502 | 결과가 0건인데 소스 오류가 있을 때. `{"error": "...", "errors": [...]}` |

---

## Tracks

### GET /api/tracks

| 쿼리 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| `q` | string \| null | null | 제목/아티스트 부분 검색 |
| `source` | `itunes` \| `youtube` \| null | null | |
| `limit` | int (1–50) | 25 | |

| 상태 | 응답 |
|---|---|
| 200 | `{"tracks": [Track]}` |
| 400 | 지원하지 않는 `source` |

### GET /api/tracks/{track_id}

| 상태 | 응답 |
|---|---|
| 200 | `Track` |
| 404 | `{"error": "곡을 찾을 수 없습니다"}` |

---

## Albums

### GET /api/albums

| 쿼리 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| `q` | string \| null | null | 앨범명/아티스트 부분 검색 |
| `limit` | int (1–50) | 25 | |

| 상태 | 응답 |
|---|---|
| 200 | `{"albums": [Album]}` |

### GET /api/albums/{album_id}

| 상태 | 응답 |
|---|---|
| 200 | `Album` |
| 404 | `{"error": "앨범을 찾을 수 없습니다"}` |

---

## Users / 인증

### POST /api/users/signup

요청 본문

| 필드 | 타입 | 제약 |
|---|---|---|
| `nickname` | string | 1–30자 |
| `email` | string | ≤255자, `^[^@\s]+@[^@\s]+\.[^@\s]+$` |
| `password` | string | 8–128자 |

| 상태 | 응답 |
|---|---|
| 201 | `{"loggedIn": true, ...User}` + `Set-Cookie: uid=...` |
| 409 | `{"error": "이미 사용 중인 이메일 입니다"}` / `닉네임` |
| 422 | 검증 실패 |

### POST /api/users/login

요청 본문: `email` (≤255자), `password` (≤128자)

| 상태 | 응답 |
|---|---|
| 200 | `{"loggedIn": true, ...User}` + 쿠키 |
| 401 | `{"error": "이메일 또는 비밀번호가 올바르지 않습니다"}` |
| 429 | `{"error": "로그인 시도가 너무 많습니다. 잠시 후 다시 시도하세요"}` + `Retry-After` 헤더 |

제한: `(클라이언트 IP, 이메일)` 당 300초 고정 창에서 실패 10회. 성공하면 카운터 초기화. 프로세스 메모리 저장 — 단일 워커 전용. 프록시가 넘긴 `X-Forwarded-For` 의 실제 클라이언트 IP 를 키로 쓴다.

응답 시간으로 가입 여부를 추측할 수 없게, 유저가 없어도 더미 해시로 같은 비용의 검증을 돌린다.

### POST /api/users/logout

| 상태 | 응답 |
|---|---|
| 200 | `{"ok": true}` + 쿠키 삭제. 쿠키가 없어도 200 |

### GET /api/users/me

| 상태 | 응답 |
|---|---|
| 200 (비로그인) | `{"loggedIn": false}` |
| 200 (로그인) | `{"loggedIn": true, ...User, "counts": {"playlists": 0, "likes": 0}}` |

### PATCH /api/users/me

요청 본문(모두 선택): `nickname`, `email`, `password` — 제약은 signup 과 동일.

| 상태 | 응답 |
|---|---|
| 200 | `User` |
| 401 | `{"error": "로그인이 필요합니다", "loggedIn": false}` |
| 409 | 이메일/닉네임 중복 |

비밀번호를 바꾸면 현재 요청의 세션 하나만 남기고 그 계정의 다른 세션은 전부 파기한다.

### DELETE /api/users/me

| 상태 | 응답 |
|---|---|
| 200 | `{"ok": true}` + 쿠키 삭제. 계정의 모든 세션 파기 |
| 401 | 미로그인 |

---

## Playlists

### POST /api/playlists

| 필드 | 타입 | 기본값 | 제약 |
|---|---|---|---|
| `name` | string | - | 1–100자 |
| `description` | string \| null | null | |
| `isPublic` | bool | false | |

| 상태 | 응답 |
|---|---|
| 200 | `Playlist` |
| 401 | 미로그인 |

### GET /api/playlists

| 쿼리 | 타입 | 기본값 |
|---|---|---|
| `limit` | int (1–200) | 50 |

200: `{"playlists": [Playlist], "limit": 50}` — 최신 생성순.

### GET /api/playlists/public

| 쿼리 | 타입 | 기본값 |
|---|---|---|
| `limit` | int (1–100) | 20 |

200: `{"playlists": [Playlist]}` — 조회수 내림차순.

### GET /api/playlists/{playlist_id}

| 상태 | 응답 |
|---|---|
| 200 | `{...Playlist, "items": [PlaylistItem], "isOwner": bool}` |
| 403 | `{"error": "비공개 플레이리스트입니다"}` |
| 404 | `{"error": "플레이리스트를 찾을 수 없습니다"}` |

소유자가 아닌 사람이 공개 플레이리스트를 열면 `viewCount` 가 1 증가한다.

### PATCH /api/playlists/{playlist_id}

본문(모두 선택): `name` (1–100자), `description`, `isPublic`.

| 상태 | 응답 |
|---|---|
| 200 | `Playlist` |
| 401 / 403 / 404 | 미로그인 / 남의 것 / 없음 |

### DELETE /api/playlists/{playlist_id}

| 상태 | 응답 |
|---|---|
| 200 | `{"ok": true}` |
| 401 / 403 / 404 | 동일 |

### POST /api/playlists/{playlist_id}/tracks

본문: `{"trackId": 12}`

| 상태 | 응답 |
|---|---|
| 200 | `{"itemId": 3, "position": 2, "totalTracks": 3}` |
| 404 | 플레이리스트 없음 / `{"error": "곡을 찾을 수 없습니다"}` |
| 401 / 403 | 미로그인 / 남의 것 |

같은 플레이리스트 동시 추가는 행 잠금(FOR UPDATE)으로 직렬화한다.

### DELETE /api/playlists/{playlist_id}/tracks/{item_id}

| 상태 | 응답 |
|---|---|
| 200 | `{"ok": true, "totalTracks": 2}` — 남은 항목 position 을 0부터 다시 매긴다 |
| 404 | `{"error": "항목을 찾을 수 없습니다"}` |

### PUT /api/playlists/{playlist_id}/tracks/order

본문: `{"itemIds": [3, 1, 2]}` — 플레이리스트의 모든 항목을 정확히 한 번씩 담아야 한다.

| 상태 | 응답 |
|---|---|
| 200 | `{"ok": true, "order": [3, 1, 2]}` |
| 400 | `{"error": "itemIds 는 플레이리스트의 모든 항목을 한 번씩 담아야 합니다"}` |

---

## Likes

### GET /api/likes

| 쿼리 | 타입 | 기본값 |
|---|---|---|
| `limit` | int (1–200) | 50 |

200:

```json
{ "albums": [Like], "playlists": [Like], "limit": 50 }
```

### PUT /api/likes/albums/{album_id} · PUT /api/likes/playlists/{playlist_id}

| 상태 | 응답 |
|---|---|
| 200 | `{"liked": true, "created": true}` — 이미 눌러둔 상태면 `created: false` (멱등) |
| 403 | 비공개 플레이리스트(남의 것) |
| 404 | 대상 없음 |

### DELETE /api/likes/albums/{album_id} · DELETE /api/likes/playlists/{playlist_id}

| 상태 | 응답 |
|---|---|
| 200 | `{"liked": false, "removed": true}` — 원래 없었으면 `removed: false` |

---

## 공통 오류

| 상태 | 형태 | 발생 |
|---|---|---|
| 400 | `{"error": "..."}` | 잘못된 `source`/`type`, 잘못된 `itemIds` |
| 401 | `{"error": "로그인이 필요합니다", "loggedIn": false}` | 인증 필요 엔드포인트 |
| 403 | `{"error": "..."}` | 남의 리소스 / 비공개 |
| 404 | `{"error": "..."}` | 리소스 없음 |
| 409 | `{"error": "이미 사용 중인 ... 입니다"}` | 이메일·닉네임 중복 |
| 422 | `{"error": "필드: 메시지"}` | 요청 검증 실패 |
| 429 | `{"error": "..."}` + `Retry-After` | 로그인 시도 제한 |
| 500 | `{"error": "서버 내부 오류가 발생했습니다"}` | 미처리 예외(스택트레이스는 서버 로그) |
| 502 | `{"error": "...", "errors": [...]}` | 외부 소스 전부 실패 |

---

## 데이터 모델

### Album

| 필드 | 타입 | 비고 |
|---|---|---|
| `id` | int | |
| `source` | `itunes` \| `youtube` | |
| `sourceId` | string | 소스 내 고유 ID |
| `name` | string | |
| `artist` | string | |
| `releaseDate` | date \| null | `YYYY-MM-DD` |
| `totalTracks` | int \| null | |
| `thumbnailUrl` | string \| null | |

### Track

| 필드 | 타입 | 비고 |
|---|---|---|
| `id` | int | |
| `source` | `itunes` \| `youtube` | |
| `sourceId` | string | |
| `title` | string | |
| `artist` | string | |
| `album` | Album \| null | |
| `durationMs` | int \| null | |
| `thumbnailUrl` | string \| null | |
| `playUrl` | string \| null | 미리듣기/재생 URL |

### User

| 필드 | 타입 |
|---|---|
| `id` | int |
| `nickname` | string |
| `email` | string |
| `createdAt` | datetime (ISO 8601) |

### Playlist

| 필드 | 타입 | 비고 |
|---|---|---|
| `id` | int | |
| `userId` | int | 소유자 |
| `name` | string | |
| `description` | string \| null | |
| `totalTracks` | int | |
| `isPublic` | bool | |
| `viewCount` | int | |
| `createdAt` / `updatedAt` | datetime | |
| `items` | [PlaylistItem] | 상세 조회에만 포함 |

### PlaylistItem

| 필드 | 타입 |
|---|---|
| `itemId` | int |
| `position` | int (0부터) |
| `addedAt` | datetime |
| `track` | Track |

### Like

| 필드 | 타입 | 비고 |
|---|---|---|
| `id` | int | |
| `target` | `album` \| `playlist` | |
| `createdAt` | datetime | |
| `album` | Album \| null | `target=album` 일 때만 |
| `playlist` | Playlist \| null | `target=playlist` 일 때만 |

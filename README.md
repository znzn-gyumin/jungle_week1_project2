# Flowbee

아직 작성하지 않고 최종 완성했을 때 작성 예정. 아래는 병합 이후 실행법만.

## 구성

| 프로세스 | 포트 | 역할 |
|---|---|---|
| `node app.js` | 3001 | 페이지(`templates/`) + 정적 파일(`static/`) |
| `uvicorn backend.main:app` | 8000 | API |
| `vite` | 5173 | API Lab (개발 도구, 배포 대상 아님) |

`app.js` 는 `/api` 요청을 8000 으로 프록시한다. 브라우저 입장에서 same-origin
이라 CORS 설정도 `credentials: 'include'` 도 필요 없다.

## 실행

```bash
npm install
uv venv --python 3.12 .venv && uv pip install -r requirements.txt
cp .env.example .env                              # YOUTUBE_API_KEY 채우기

npm run dev        # DB + API(8000) + 페이지(3001) + API Lab(5173)
```

`predev` 의 로컬 DB 기동은 `.env` 의 `POSTGRES_HOST` 가 원격이면 건너뛴다.
Windows 는 `bash` 가 필요한 `scripts/db.sh` 를 못 부르므로 역시 건너뛴다.

<http://localhost:3001> 로 연다.

DB 세팅과 환경변수는 [backend/README.md](backend/README.md) 참고.

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

엔드포인트 목록과 요청·응답 형태는 5173 의 API Lab 에서 직접 눌러볼 수 있다.

## 아직 안 된 것

`static/js/pages/` 의 login · signup · forgot-password 는 화면 전환만 하고
API 를 부르지 않는다. `TODO` 주석이 붙어 있는 자리다.

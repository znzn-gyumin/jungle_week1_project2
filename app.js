import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createProxyMiddleware } from 'http-proxy-middleware';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = process.env.PORT || 3001;
const apiTarget = process.env.API_TARGET || 'http://127.0.0.1:8000';

// /api 는 FastAPI 로 넘긴다. 브라우저 입장에서 same-origin 이라 CORS 도 쿠키 문제도 없다.
// express.json() 보다 먼저 와야 한다. 뒤에 두면 body 를 먼저 먹어버려서 POST 가 멈춘다.
// app.use('/api', ...) 로 걸면 express 가 /api 를 떼어내서 /api/health 가 /health 로 간다.
// pathFilter 로 걸러야 경로가 그대로 넘어간다.
app.use(
  createProxyMiddleware({
    pathFilter: '/api',
    target: apiTarget,
    changeOrigin: false,
  }),
);

app.use(express.static(path.join(__dirname, 'static')));

// body 데이터 해석을 위한 미들웨어
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 기본 라우팅 (templates/index.html 파일 전달)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'templates', 'index.html'));
});

// 랜딩 페이지 (templates/home.html 파일 전달)
app.get('/home', (req, res) => {
  res.sendFile(path.join(__dirname, 'templates', 'home.html'));
});

// 로그인 페이지 (templates/login.html 파일 전달)
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'templates', 'login.html'));
});

// 회원가입 페이지 (templates/signup.html 파일 전달)
app.get('/signup', (req, res) => {
  res.sendFile(path.join(__dirname, 'templates', 'signup.html'));
});

// 비밀번호 재설정 페이지 (templates/forgot-password.html 파일 전달)
app.get('/forgot-password', (req, res) => {
  res.sendFile(path.join(__dirname, 'templates', 'forgot-password.html'));
});

// 보관함 페이지 (templates/library.html 파일 전달)
app.get(['/library', '/library.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'templates', 'library.html'));
});

// 차트 페이지 (templates/chart.html 파일 전달)
app.get(['/chart', '/chart.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'templates', 'chart.html'));
});

// 최신음악 페이지 (templates/latest-music.html 파일 전달)
app.get(['/latest-music', '/latest-music.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'templates', 'latest-music.html'));
});

// 최신앨범 페이지 (templates/latest-albums.html 파일 전달)
app.get(['/latest-albums', '/latest-albums.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'templates', 'latest-albums.html'));
});

// 장르음악 페이지 (templates/genre.html 파일 전달)
app.get(['/genre', '/genre.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'templates', 'genre.html'));
});

// 플레이리스트 목록 페이지 (templates/playlists.html 파일 전달)
app.get(['/playlists', '/playlists.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'templates', 'playlists.html'));
});

// 이벤트 페이지 (templates/events.html 파일 전달)
app.get(['/events', '/events.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'templates', 'events.html'));
});

// 앨범 페이지 (templates/album.html 파일 전달)
app.get(['/album', '/album.html', '/album/:albumId'], (req, res) => {
  res.sendFile(path.join(__dirname, 'templates', 'album.html'));
});

// 플레이리스트 페이지 (templates/playlist.html 파일 전달)
app.get(['/playlist', '/playlist.html', '/playlist/:playlistSlug'], (req, res) => {
  res.sendFile(path.join(__dirname, 'templates', 'playlist.html'));
});

// 서버 실행
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
  console.log(`API proxy  /api -> ${apiTarget}`);
});

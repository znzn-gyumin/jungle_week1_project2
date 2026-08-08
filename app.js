import express from 'express';
import fs from 'fs';
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
    // 원 IP 를 X-Forwarded-For 로 넘긴다. 없으면 FastAPI 가 모든 요청을
    // 127.0.0.1 로 보고, 로그인 시도 제한이 IP 를 구분하지 못한다.
    // 받는 쪽은 --forwarded-allow-ips 로 이 프록시만 믿어야 한다.
    //
    // xfwd: true 는 쓰지 않는다 - 헤더가 이미 있으면 그대로 통과시켜서
    // 클라이언트가 보낸 위조값이 그대로 백엔드에 도달한다. 항상 덮어쓴다.
    on: {
      proxyReq(proxyReq, req) {
        const ip = (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
        proxyReq.setHeader('x-forwarded-for', ip);
      },
    },
  }),
);

app.use(express.static(path.join(__dirname, 'static')));

// body 데이터 해석을 위한 미들웨어
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 템플릿 엔진 대신 <!--#include 이름--> 만 치환한다. 사이드바/토프바/탭/플레이어는
// templates/components/ 한 곳에서만 고치면 모든 페이지에 반영된다.
// 매 요청마다 읽는다 - 캐시하면 템플릿을 고칠 때마다 서버를 다시 띄워야 한다.
const templatePath = (name) => path.join(__dirname, 'templates', `${name}.html`);
const componentPath = (name) => path.join(__dirname, 'templates', 'components', `${name}.html`);

const renderPage = (name) => fs
  .readFileSync(templatePath(name), 'utf8')
  .replace(/<!--#include ([\w-]+)-->/g, (_, part) => fs.readFileSync(componentPath(part), 'utf8'));

const page = (name) => (req, res) => res.type('html').send(renderPage(name));

app.get('/', page('index'));
app.get('/home', page('home'));
app.get('/login', page('login'));
app.get('/signup', page('signup'));
app.get('/forgot-password', page('forgot-password'));
app.get(['/chart', '/chart.html'], page('chart'));
app.get(['/latest-music', '/latest-music.html'], page('latest-music'));
app.get(['/latest-albums', '/latest-albums.html'], page('latest-albums'));
app.get(['/genre', '/genre.html'], page('genre'));
app.get('/my-playlist/:playlistId', page('my-playlist'));
app.get(['/playlists', '/playlists.html'], page('playlists'));
app.get(['/events', '/events.html'], page('events'));
app.get(['/album', '/album.html', '/album/:albumId'], page('album'));
app.get(['/playlist', '/playlist.html', '/playlist/:playlistSlug'], page('playlist'));

// 서버 실행. 127.0.0.1 에만 묶는다 - 기본값(0.0.0.0)이면 3001 이 그대로 외부에
// 열려서 nginx 를 건너뛴 요청이 들어온다. 그러면 위 proxyReq 가 공격자의 소켓
// 주소를 X-Forwarded-For 로 넣어주는 꼴이라, CF-Connecting-IP 기반 제한이 무의미해진다.
app.listen(port, '127.0.0.1', () => {
  console.log(`Server is running on http://localhost:${port}`);
  console.log(`API proxy  /api -> ${apiTarget}`);
});

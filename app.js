const express = require('express');
const path = require('path');
const app = express();
const PORT = 3000; // 원하시는 포트 번호



// 정적 파일 연결 (CSS, 이미지, 프론트 JS)
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

// 서버 실행
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
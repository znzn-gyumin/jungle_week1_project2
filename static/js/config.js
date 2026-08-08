// 공개 카탈로그 API 는 Cloudflare 를 우회해 origin 에 직접 붙는다.
//
// Cloudflare 가 한국 트래픽을 LAX PoP 로 붙인다 (cf-ray 로 확인 - 같은 회선에서
// cloudflare.com 은 ICN 인데 이 존만 LAX). 그래서 origin 이 12ms 에 끝낸 응답도
// 한국 브라우저에선 왕복이 붙어 훨씬 느려진다. 실측(연결 재사용, n=40 교대측정):
//
//     CF 경유  중앙 284ms   /   직결  중앙 184ms
//
// 직결로 돌릴 수 있는 것은 인증이 필요 없는 읽기 전용 엔드포인트뿐이다
// (/api/search, /api/tracks, /api/albums). 세션 쿠키를 쓰는 호출은 반드시
// 같은 출처로 남겨야 한다 - 교차 출처 fetch 는 기본값(credentials: 'same-origin')
// 에서 쿠키를 아예 안 싣는다. 그래서 여기엔 쿠키 설정을 건드릴 일이 없다.
//
// 이 파일은 head 에서 가장 먼저 로드된다. 다른 스크립트는 전부 IIFE 라 그 안의
// 상수를 밖에서 못 보기 때문에, 최상위 const 로 두어 전역 렉시컬 스코프에 올린다.
const CATALOG_API = location.hostname === 'flowbee.nari3040.dev'
    ? 'https://api.flowbee.nari3040.dev'
    : ''; // 로컬·개발은 같은 출처 그대로. 안 그러면 dev 가 프로덕션을 친다.

export const SECTIONS = [
  { key: 'user', label: '유저 정보 API', prefix: '/api/users', auth: false },
  { key: 'catalog', label: '곡 · 앨범', prefix: '/api/search · /api/tracks · /api/albums', auth: false },
  { key: 'playlists', label: '플레이리스트 API', prefix: '/api/playlists', auth: true },
  { key: 'likes', label: '좋아요 API', prefix: '/api/likes', auth: true },
  { key: 'errors', label: '실패 응답 모아보기', prefix: '', auth: true },
]

export const PUBLIC_SECTIONS = SECTIONS.filter((s) => !s.auth).map((s) => s.key)

export const ENDPOINTS = {
  user: [
    ['POST', '/api/users/signup', '{nickname, email, password}', '가입 즉시 로그인. 쿠키 uid 발급'],
    ['POST', '/api/users/login', '{email, password}', ''],
    ['POST', '/api/users/logout', '', '세션 파기'],
    ['GET', '/api/users/me', '', '비로그인이면 401 이 아니라 {loggedIn:false}'],
    ['PATCH', '/api/users/me', '{nickname?, email?, password?}', '보낸 필드만 바뀐다'],
    ['DELETE', '/api/users/me', '', '플레이리스트·좋아요 CASCADE'],
  ],
  catalog: [
    ['GET', '/api/search?q=&type=track&source=all&limit=', '', 'iTunes + YouTube 검색 → tracks upsert'],
    ['GET', '/api/search?q=&type=album&source=itunes&limit=', '', '앨범 검색은 iTunes 만 지원'],
    ['GET', '/api/tracks?q=&source=&limit=', '', 'DB 에 쌓인 곡'],
    ['GET', '/api/tracks/:id', '', ''],
    ['GET', '/api/albums?q=&limit=', '', 'DB 에 쌓인 앨범'],
    ['GET', '/api/albums/:id', '', ''],
  ],
  playlists: [
    ['POST', '/api/playlists', '{name, description?, isPublic?}', ''],
    ['GET', '/api/playlists?limit=', '', '내 것만. 기본 50, 최대 200'],
    ['GET', '/api/playlists/public', '', 'view_count 내림차순'],
    ['GET', '/api/playlists/:id', '', '수록곡 포함. 타인이 보면 view_count +1'],
    ['PATCH', '/api/playlists/:id', '{name?, description?, isPublic?}', ''],
    ['DELETE', '/api/playlists/:id', '', ''],
    ['POST', '/api/playlists/:id/tracks', '{trackId}', '맨 뒤에 추가 + totalTracks +1'],
    ['DELETE', '/api/playlists/:id/tracks/:itemId', '', 'position 재정렬 + totalTracks −1'],
    ['PUT', '/api/playlists/:id/tracks/order', '{itemIds: [...]}', '모든 항목을 한 번씩 담아야 200'],
  ],
  likes: [
    ['GET', '/api/likes?limit=', '', 'albums / playlists 로 나눠서. 기본 50, 최대 200'],
    ['PUT', '/api/likes/albums/:id', '', '멱등. 이미 있으면 created:false'],
    ['DELETE', '/api/likes/albums/:id', '', '없어도 200, removed:false'],
    ['PUT', '/api/likes/playlists/:id', '', '비공개 남의 것이면 403'],
    ['DELETE', '/api/likes/playlists/:id', '', ''],
  ],
}

export const RESPONSE_KEYS = {
  user: {
    title: 'GET /api/users/me',
    rows: [
      ['loggedIn', 'boolean', '이 키만 먼저 보고 분기하면 된다'],
      ['id', 'number', '비로그인이면 아예 없음'],
      ['nickname', 'string', '최대 30자, 유일'],
      ['email', 'string', '소문자로 저장됨'],
      ['createdAt', 'string', 'ISO 8601 + 타임존'],
      ['counts.playlists', 'number', ''],
      ['counts.likes', 'number', ''],
    ],
  },
  playlist: {
    title: 'playlist 객체',
    rows: [
      ['id', 'number', ''],
      ['userId', 'number', '주인'],
      ['name', 'string', '최대 100자'],
      ['description', 'string | null', ''],
      ['totalTracks', 'number', 'playlist_tracks 개수의 비정규화 사본'],
      ['isPublic', 'boolean', 'false 면 주인만 조회 가능'],
      ['viewCount', 'number', '타인이 상세를 열 때만 증가'],
      ['createdAt / updatedAt', 'string', 'ISO 8601'],
      ['items', 'array', '상세 조회에만 포함'],
      ['isOwner', 'boolean', '상세 조회에만 포함'],
    ],
  },
  playlistItem: {
    title: 'playlist.items[] 원소',
    rows: [
      ['itemId', 'number', 'playlist_tracks.id — 빼기/순서변경에 쓰는 값'],
      ['position', 'number', '0부터 연속'],
      ['addedAt', 'string', 'ISO 8601'],
      ['track', 'object', '아래 track 객체'],
    ],
  },
  track: {
    title: 'track 객체',
    rows: [
      ['id', 'number', 'DB id. 담기에 쓰는 값'],
      ['source', "'itunes' | 'youtube'", '재생 방식이 갈린다'],
      ['sourceId', 'string', '외부 플랫폼 id'],
      ['title / artist', 'string', ''],
      ['album', 'album | null', 'YouTube 곡은 null'],
      ['durationMs', 'number | null', ''],
      ['thumbnailUrl', 'string | null', ''],
      ['playUrl', 'string | null', 'itunes 는 30초 오디오, youtube 는 임베드 URL'],
    ],
  },
  album: {
    title: 'album 객체',
    rows: [
      ['id', 'number', '좋아요에 쓰는 값'],
      ['source / sourceId', 'string', ''],
      ['name / artist', 'string', ''],
      ['releaseDate', 'string | null', 'YYYY-MM-DD'],
      ['totalTracks', 'number | null', ''],
      ['thumbnailUrl', 'string | null', ''],
    ],
  },
  like: {
    title: 'GET /api/likes',
    rows: [
      ['albums', 'array', 'target==="album" 만. created_at 내림차순'],
      ['playlists', 'array', 'target==="playlist" 만. created_at 내림차순'],
      ['limit', 'number', '적용된 상한 (기본 50, 최대 200)'],
      ['albums[].target', "'album'", ''],
      ['albums[].album', 'album', ''],
      ['playlists[].playlist', 'playlist', ''],
    ],
  },
}

export const ERROR_SHAPE = `{ "error": "사람이 읽을 한국어 메시지" }`

export function buildSnippet(method, path, body) {
  const head = `await fetch('${path}', {`
  const lines = [`  credentials: 'same-origin',`]
  if (method !== 'GET') lines.unshift(`  method: '${method}',`)
  if (body) {
    lines.push(`  headers: { 'Content-Type': 'application/json' },`)
    lines.push(`  body: JSON.stringify(${JSON.stringify(body)}),`)
  }
  if (method === 'GET') return `const res = await fetch('${path}', { credentials: 'same-origin' })\nconst data = await res.json()`
  return `const res = ${head}\n${lines.join('\n')}\n})\nconst data = await res.json()`
}

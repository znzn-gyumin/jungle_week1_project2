(function () {
const { formatDuration, createHandoff } = window.FlowbeeDetailPlayer;

const page = document.getElementById('album-page');
const statusBox = document.getElementById('album-status');
const content = document.getElementById('album-content');
const body = document.getElementById('album-body');
const playerBar = document.getElementById('album-player');
if (window.ensureSiteNowPlayingDrawer) window.ensureSiteNowPlayingDrawer();
const audio = document.getElementById('audio-player');
const albumButtons = [document.getElementById('album-play'), document.getElementById('player-toggle')];
const seek = document.getElementById('player-seek');
const volume = document.getElementById('player-volume');
const previewLimit = 30;
let tracks = [];
let currentIndex = -1;

const setPlaying = (playing) => albumButtons.forEach((button) => button.classList.toggle('is-playing', playing));
const handoff = createHandoff({ audio, seek, setPlaying, playerBar });

const formatTotalDuration = (items) => {
  const total = items.reduce((sum, track) => sum + (track.durationMs || 0), 0);
  if (!total) return '재생시간 정보 없음';
  return `${Math.floor(total / 60000)}분 ${Math.floor((total % 60000) / 1000)}초`;
};

const albumIdFromLocation = () => {
  const pathMatch = location.pathname.match(/^\/album\/(\d+)\/?$/);
  return pathMatch?.[1] || new URLSearchParams(location.search).get('id');
};

const applyAlbumPalette = (image) => {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const buckets = new Map();
    for (let index = 0; index < pixels.length; index += 16) {
      const alpha = pixels[index + 3];
      if (alpha < 180) continue;
      const red = pixels[index];
      const green = pixels[index + 1];
      const blue = pixels[index + 2];
      const lightness = (red + green + blue) / 3;
      if (lightness < 18 || lightness > 238) continue;
      const key = `${red >> 4},${green >> 4},${blue >> 4}`;
      const bucket = buckets.get(key) || { count: 0, red: 0, green: 0, blue: 0 };
      bucket.count += 1;
      bucket.red += red;
      bucket.green += green;
      bucket.blue += blue;
      buckets.set(key, bucket);
    }
    const dominant = [...buckets.values()].sort((a, b) => b.count - a.count)[0];
    if (!dominant) return;
    const red = Math.round(dominant.red / dominant.count);
    const green = Math.round(dominant.green / dominant.count);
    const blue = Math.round(dominant.blue / dominant.count);
    const darken = (value, amount) => Math.round(value * amount);
    const hero = document.getElementById('album-content');
    hero.style.setProperty('--album-color', `${red} ${green} ${blue}`);
    hero.style.setProperty('--album-color-dark', `${darken(red, .32)} ${darken(green, .32)} ${darken(blue, .32)}`);
    document.documentElement.style.setProperty('--album-color', `${red} ${green} ${blue}`);
  } catch {
    document.getElementById('album-content').classList.add('palette-fallback');
  }
};

const updatePlayerTime = () => {
  const elapsed = Number.isFinite(audio.currentTime) ? Math.min(audio.currentTime, previewLimit) : 0;
  const sourceDuration = Number.isFinite(audio.duration) ? audio.duration : previewLimit;
  const duration = Math.min(sourceDuration, previewLimit);
  seek.max = String(duration);
  seek.value = String(Math.min(elapsed, duration));
  seek.style.setProperty('--progress', `${duration ? (elapsed / duration) * 100 : 0}%`);
  document.getElementById('player-current').textContent = formatDuration(elapsed * 1000);
  document.getElementById('player-duration').textContent = formatDuration(duration * 1000);
};

const updateDrawer = (track, index) => {
  document.getElementById('drawer-cover').src = track.thumbnailUrl || document.getElementById('album-cover').src;
  document.getElementById('drawer-title').textContent = track.title;
  document.getElementById('drawer-artist').textContent = track.artist;
  const queue = tracks.slice(index + 1, index + 6).map((item, offset) => {
    const row = document.createElement('div');
    row.className = 'drawer-queue-item';
    row.innerHTML = '<img alt=""><div><b></b><small></small></div>';
    row.querySelector('img').src = item.thumbnailUrl || document.getElementById('album-cover').src;
    row.querySelector('b').textContent = item.title;
    row.querySelector('small').textContent = item.artist;
    row.addEventListener('click', () => selectTrack(index + offset + 1));
    return row;
  });
  document.getElementById('drawer-queue').replaceChildren(...queue);
};

const selectTrack = (index, autoplay = true) => {
  const track = tracks[index];
  if (!track) return;
  handoff.stop();
  currentIndex = index;
  document.getElementById('now-title').textContent = track.title;
  document.getElementById('now-artist').textContent = track.artist;
  updateDrawer(track, index);
  const playerCover = document.getElementById('player-cover');
  playerCover.src = track.thumbnailUrl || document.getElementById('album-cover').src;
  playerCover.alt = `${track.title} 표지`;
  document.querySelectorAll('.album-tracks li').forEach((row, rowIndex) => row.classList.toggle('is-current', rowIndex === index));
  if (!track.playUrl) {
    audio.removeAttribute('src');
    audio.load();
    setPlaying(false);
    updatePlayerTime();
    document.getElementById('now-artist').textContent = `${track.artist} · 미리듣기 미제공`;
    return;
  }
  audio.src = track.playUrl;
  if (autoplay) audio.play().catch(() => setPlaying(false));
};

const togglePlayback = () => {
  if (handoff.togglePlayback()) return;
  if (currentIndex < 0) selectTrack(0);
  else if (audio.paused) {
    if (audio.currentTime >= previewLimit - 0.1) audio.currentTime = 0;
    audio.play().catch(() => setPlaying(false));
  }
  else audio.pause();
};

const createTrackRow = (track, index) => {
  const row = document.createElement('li');
  row.innerHTML = `<span>${index + 1}</span><div><b></b><small></small></div><button class="track-play" type="button" aria-label="재생">▷</button><button class="track-add" type="button" aria-label="플레이리스트에 담기">+</button><time>${formatDuration(track.durationMs)}</time>`;
  row.querySelector('b').textContent = track.title;
  row.querySelector('small').textContent = track.artist;
  row.addEventListener('click', () => selectTrack(index));
  row.querySelector('.track-add').addEventListener('click', (event) => {
    event.stopPropagation();
    const button = event.currentTarget;
    if (window.handleAddToPlaylistClick) window.handleAddToPlaylistClick(button, track);
  });
  return row;
};

const renderAlbum = (album) => {
  tracks = album.tracks || [];
  document.title = `${album.name} | 플로비`;
  const cover = document.getElementById('album-cover');
  if (album.thumbnailUrl) {
    cover.crossOrigin = 'anonymous';
    cover.addEventListener('load', () => applyAlbumPalette(cover), { once: true });
    cover.src = album.thumbnailUrl;
  }
  cover.alt = `${album.name} 앨범 커버`;
  document.getElementById('album-title').textContent = album.name;
  document.getElementById('album-artist').textContent = album.artist;
  document.getElementById('album-type').textContent = `${album.source.toUpperCase()} ALBUM${album.releaseDate ? ` · ${album.releaseDate.slice(0, 4)}` : ''}`;
  document.getElementById('album-description').textContent = `${album.artist}의 앨범 수록곡을 플로비에서 들어보세요.`;
  document.getElementById('album-summary').textContent = [album.releaseDate, `${tracks.length || album.totalTracks || 0}곡`, formatTotalDuration(tracks)].filter(Boolean).join(' · ');
  document.getElementById('album-number').textContent = String(album.id).padStart(2, '0').slice(-2);
  document.getElementById('track-count').textContent = `${tracks.length || album.totalTracks || 0}곡`;
  // 다른 화면에서 넘어온 곡을 이어 재생 중이면 재생바 커버를 덮어쓰지 않는다.
  if (!handoff.active) {
    const playerCover = document.getElementById('player-cover');
    if (album.thumbnailUrl) playerCover.src = album.thumbnailUrl;
    playerCover.alt = `${album.name} 앨범 표지`;
  }
  const list = document.getElementById('album-tracks');
  list.replaceChildren(...tracks.map(createTrackRow));
  if (!tracks.length) list.innerHTML = '<li class="empty-tracks"><div><b>수록곡 정보가 없습니다.</b><small>이 음원 소스는 트랙 목록을 제공하지 않습니다.</small></div></li>';
  statusBox.hidden = true;
  content.hidden = false;
  body.hidden = false;
  playerBar.hidden = false;
  page.setAttribute('aria-busy', 'false');
};

const showError = (message) => {
  statusBox.textContent = message;
  statusBox.classList.add('is-error');
  page.setAttribute('aria-busy', 'false');
};

albumButtons.forEach((button) => button.addEventListener('click', togglePlayback));
document.querySelector('.album-like').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  const me = window.getCurrentUser ? await window.getCurrentUser() : { loggedIn: false };
  if (!me.loggedIn) {
    if (confirm('로그인이 필요해요. 로그인 페이지로 이동할까요?')) {
      window.location.href = `/login?next=${encodeURIComponent(location.pathname)}`;
    }
    return;
  }
  const liked = button.classList.contains('liked');
  try {
    const res = await fetch(`/api/likes/albums/${albumId}`, { method: liked ? 'DELETE' : 'PUT' });
    if (!res.ok) throw new Error();
    button.classList.toggle('liked');
  } catch {
    alert('좋아요 처리에 실패했어요.');
  }
});
const nowPlayingSnapshot = () => ({
  title: document.getElementById('now-title').textContent,
  artist: document.getElementById('now-artist').textContent,
  thumbnailUrl: document.getElementById('player-cover').src,
  playUrl: audio.src,
  source: 'itunes',
});

audio.addEventListener('play', () => {
  setPlaying(true);
  if (window.saveNowPlaying) window.saveNowPlaying(nowPlayingSnapshot(), audio.currentTime, true);
});
audio.addEventListener('pause', () => {
  setPlaying(false);
  if (window.saveNowPlaying) window.saveNowPlaying(nowPlayingSnapshot(), audio.currentTime, false);
});
audio.addEventListener('timeupdate', updatePlayerTime);
audio.addEventListener('timeupdate', () => {
  if (window.saveNowPlaying && !audio.paused) window.saveNowPlaying(nowPlayingSnapshot(), audio.currentTime, true);
});
audio.addEventListener('loadedmetadata', updatePlayerTime);
audio.addEventListener('ended', () => {
  if (currentIndex + 1 < tracks.length) selectTrack(currentIndex + 1);
  else {
    setPlaying(false);
    if (window.clearNowPlaying) window.clearNowPlaying();
  }
});
audio.addEventListener('timeupdate', () => {
  const limit = Number.isFinite(audio.duration) ? Math.min(audio.duration, previewLimit) : previewLimit;
  if (audio.currentTime >= limit) {
    audio.pause();
    audio.currentTime = limit;
  }
});
document.getElementById('player-prev').addEventListener('click', () => {
  if (tracks.length) selectTrack(currentIndex > 0 ? currentIndex - 1 : tracks.length - 1);
});
document.getElementById('player-next').addEventListener('click', () => {
  if (tracks.length) selectTrack(currentIndex + 1 < tracks.length ? currentIndex + 1 : 0);
});
seek.addEventListener('input', () => {
  if (handoff.seekTo(Number(seek.value))) return;
  if (currentIndex < 0) selectTrack(0, false);
  if (tracks[currentIndex]?.playUrl) audio.currentTime = Math.min(Number(seek.value), previewLimit);
  updatePlayerTime();
});
volume.addEventListener('input', () => {
  audio.volume = Number(volume.value);
  volume.style.setProperty('--progress', `${audio.volume * 100}%`);
});
audio.volume = Number(volume.value);
// 라이브러리로 돌아가는 링크는 api.js 의 전역 클릭 핸들러가 가로챈다.
// 재생 중인 <audio> 를 살린 채 셸만 갈아끼운다.
window.addEventListener('popstate', () => location.reload(), { once: true });

handoff.start();

const albumId = albumIdFromLocation();
if (!/^\d+$/.test(albumId || '')) showError('앨범 ID가 필요합니다. /album/앨범ID 주소로 접속해 주세요.');
else {
  fetch(`/api/albums/${albumId}`)
    .then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || '앨범 정보를 불러오지 못했습니다.');
      return data;
    })
    .then(renderAlbum)
    .catch((error) => showError(error.message));
}
}());

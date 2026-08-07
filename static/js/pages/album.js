const page = document.getElementById('album-page');
const statusBox = document.getElementById('album-status');
const content = document.getElementById('album-content');
const body = document.getElementById('album-body');
const playerBar = document.getElementById('album-player');
const drawer = document.getElementById('now-playing-drawer');
if (window.ensureSiteNowPlayingDrawer) window.ensureSiteNowPlayingDrawer();
const audio = document.getElementById('audio-player');
const albumButtons = [document.getElementById('album-play'), document.getElementById('player-toggle')];
const seek = document.getElementById('player-seek');
const volume = document.getElementById('player-volume');
const previewLimit = 30;
let tracks = [];
let currentIndex = -1;

const formatDuration = (milliseconds) => {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return '—';
  const seconds = Math.floor(milliseconds / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

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

const ensureStylesheet = (href) => {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.append(link);
};

const openLibraryWithoutStoppingPlayback = async (event, pushHistory = true) => {
  event?.preventDefault();
  // 이 앨범의 <audio> 를 그대로 살려서 옮기므로, 새 페이지가 handoff 로 또 한 번
  // 재생을 시작하면 소리가 겹친다. 여기서 지워서 이중 재생을 막는다.
  if (window.clearNowPlaying) window.clearNowPlaying();
  drawer?.classList.add('is-collapsed');
  const drawerToggle = document.getElementById('drawer-toggle');
  if (drawerToggle) {
    drawerToggle.textContent = '‹';
    drawerToggle.setAttribute('aria-label', '현재 재생 패널 열기');
  }
  const link = event?.currentTarget;
  link?.classList.add('is-loading');
  try {
    const response = await fetch('/');
    if (!response.ok) throw new Error('라이브러리를 불러오지 못했습니다.');
    const html = await response.text();
    const nextDocument = new DOMParser().parseFromString(html, 'text/html');
    const shell = nextDocument.querySelector('.app-shell');
    if (!shell) throw new Error('라이브러리 화면을 찾지 못했습니다.');
    ensureStylesheet('/css/pages/main.css');
    ensureStylesheet('/css/pages/main-dynamic.css');
    document.body.prepend(shell);
    const ytHost = document.getElementById('site-yt-host');
    [...document.body.children].forEach((child) => {
      if (child !== shell && child !== playerBar && child !== audio && child !== drawer && child !== ytHost) child.remove();
    });
    document.title = nextDocument.title;
    if (pushHistory) history.pushState({ flowbeeLibrary: true }, '', '/');
    const script = document.createElement('script');
    script.src = `/js/pages/main.js?v=${Date.now()}`;
    document.body.append(script);
  } catch (error) {
    link?.classList.remove('is-loading');
    statusBox.hidden = false;
    statusBox.textContent = error.message;
    statusBox.classList.add('is-error');
  }
};

const setPlaying = (playing) => albumButtons.forEach((button) => button.classList.toggle('is-playing', playing));

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

let ytHandoffActive = false;
let ytHandoffPlayer = null;
let ytHandoffTimer = null;

const updateYtHandoffTime = () => {
  if (!ytHandoffPlayer || typeof ytHandoffPlayer.getDuration !== 'function') return;
  const duration = ytHandoffPlayer.getDuration();
  if (!duration) return;
  const elapsed = ytHandoffPlayer.getCurrentTime();
  seek.max = String(duration);
  seek.value = String(elapsed);
  seek.style.setProperty('--progress', `${(elapsed / duration) * 100}%`);
  document.getElementById('player-current').textContent = formatDuration(elapsed * 1000);
  document.getElementById('player-duration').textContent = formatDuration(duration * 1000);
};

const onYtHandoffState = (event) => {
  if (!ytHandoffActive) return;
  const playing = event.data === window.YT.PlayerState.PLAYING;
  setPlaying(playing);
  clearInterval(ytHandoffTimer);
  ytHandoffTimer = playing ? setInterval(updateYtHandoffTime, 500) : null;
  updateYtHandoffTime();
};

const stopYtHandoff = () => {
  if (!ytHandoffActive) return;
  ytHandoffActive = false;
  clearInterval(ytHandoffTimer);
  ytHandoffTimer = null;
  if (ytHandoffPlayer) ytHandoffPlayer.pauseVideo();
  setPlaying(false);
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
  stopYtHandoff();
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
  if (ytHandoffActive && ytHandoffPlayer) {
    if (ytHandoffPlayer.getPlayerState() === window.YT.PlayerState.PLAYING) ytHandoffPlayer.pauseVideo();
    else ytHandoffPlayer.playVideo();
    return;
  }
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
  document.title = `${album.name} | Flowbee`;
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
  document.getElementById('album-description').textContent = `${album.artist}의 앨범 수록곡을 Flowbee에서 들어보세요.`;
  document.getElementById('album-summary').textContent = [album.releaseDate, `${tracks.length || album.totalTracks || 0}곡`, formatTotalDuration(tracks)].filter(Boolean).join(' · ');
  document.getElementById('album-number').textContent = String(album.id).padStart(2, '0').slice(-2);
  document.getElementById('track-count').textContent = `${tracks.length || album.totalTracks || 0}곡`;
  const playerCover = document.getElementById('player-cover');
  if (album.thumbnailUrl) playerCover.src = album.thumbnailUrl;
  playerCover.alt = `${album.name} 앨범 표지`;
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
  if (ytHandoffActive && ytHandoffPlayer) {
    ytHandoffPlayer.seekTo(Number(seek.value), true);
    updateYtHandoffTime();
    return;
  }
  if (currentIndex < 0) selectTrack(0, false);
  if (tracks[currentIndex]?.playUrl) audio.currentTime = Math.min(Number(seek.value), previewLimit);
  updatePlayerTime();
});
volume.addEventListener('input', () => {
  audio.volume = Number(volume.value);
  volume.style.setProperty('--progress', `${audio.volume * 100}%`);
});
audio.volume = Number(volume.value);
document.querySelectorAll('.back-link, .album-brand').forEach((link) => link.addEventListener('click', openLibraryWithoutStoppingPlayback));
window.addEventListener('popstate', () => location.reload(), { once: true });

if (window.loadNowPlayingHandoff) {
  const handoff = window.loadNowPlayingHandoff();
  if (handoff && handoff.isPlaying && handoff.playUrl) {
    document.getElementById('now-title').textContent = handoff.title;
    document.getElementById('now-artist').textContent = handoff.artist;
    if (handoff.thumbnailUrl) document.getElementById('player-cover').src = handoff.thumbnailUrl;
    playerBar.hidden = false;
    if (handoff.source === 'youtube') {
      ytHandoffActive = true;
      window.resumeYouTubeHandoff(handoff, onYtHandoffState)
        .then((player) => { ytHandoffPlayer = player; })
        .catch(() => stopYtHandoff());
    } else {
      audio.src = handoff.playUrl;
      audio.addEventListener('loadedmetadata', () => { audio.currentTime = handoff.currentTime || 0; }, { once: true });
      audio.play().catch(() => setPlaying(false));
    }
  }
}

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

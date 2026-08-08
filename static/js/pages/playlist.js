(function () {
const { formatDuration, createHandoff } = window.FlowbeeDetailPlayer;

const statusBox = document.getElementById('playlist-status');
const content = document.getElementById('playlist-content');
const playlistBody = document.getElementById('playlist-body');
const playerBar = document.getElementById('playlist-player');
if (window.ensureSiteNowPlayingDrawer) window.ensureSiteNowPlayingDrawer();
const audio = document.getElementById('audio-player');
const seek = document.getElementById('player-seek');
const volume = document.getElementById('player-volume');
const playbackButtons = [document.getElementById('playlist-play'), document.getElementById('player-toggle')];
const previewLimit = 30;
let tracks = [];
let currentIndex = -1;

const totalDuration = (items) => items.reduce((total, track) => total + (track.durationMs || 0), 0);
const setPlaying = (playing) => playbackButtons.forEach((button) => button.classList.toggle('is-playing', playing));
const handoff = createHandoff({ audio, seek, setPlaying, playerBar });

const updatePlayer = () => {
  const elapsed = Number.isFinite(audio.currentTime) ? Math.min(audio.currentTime, previewLimit) : 0;
  const duration = Math.min(Number.isFinite(audio.duration) ? audio.duration : previewLimit, previewLimit);
  seek.max = String(duration);
  seek.value = String(Math.min(elapsed, duration));
  seek.style.setProperty('--progress', `${duration ? (elapsed / duration) * 100 : 0}%`);
  document.getElementById('player-current').textContent = formatDuration(elapsed * 1000);
  document.getElementById('player-duration').textContent = formatDuration(duration * 1000);
};

const updateDrawer = (track, index) => {
  document.getElementById('drawer-cover').src = track.thumbnailUrl || document.getElementById('playlist-cover').src;
  document.getElementById('drawer-title').textContent = track.title;
  document.getElementById('drawer-artist').textContent = track.artist;
  const queue = tracks.slice(index + 1, index + 6).map((item, offset) => {
    const row = document.createElement('div');
    row.className = 'drawer-queue-item';
    row.innerHTML = '<img alt=""><div><b></b><small></small></div>';
    row.querySelector('img').src = window.artwork(item.thumbnailUrl, 150) || document.getElementById('playlist-cover').src;
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
  const cover = document.getElementById('player-cover');
  cover.src = track.thumbnailUrl || document.getElementById('playlist-cover').src;
  cover.alt = `${track.title} 표지`;
  document.querySelectorAll('.playlist-tracks li').forEach((row, rowIndex) => row.classList.toggle('is-current', rowIndex === index));
  if (!track.playUrl) {
    audio.removeAttribute('src');
    audio.load();
    setPlaying(false);
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
    if (audio.currentTime >= previewLimit - .1) audio.currentTime = 0;
    audio.play().catch(() => setPlaying(false));
  } else audio.pause();
};

const createTrackRow = (track, index) => {
  const row = document.createElement('li');
  row.innerHTML = `<span>${index + 1}</span><img alt=""><div><b></b><small></small></div><em></em><button class="track-heart" type="button">♡</button><time>${formatDuration(track.durationMs)}</time>`;
  row.querySelector('img').src = window.artwork(track.thumbnailUrl, 150);
  row.querySelector('b').textContent = track.title;
  row.querySelector('small').textContent = track.artist;
  row.querySelector('em').textContent = track.album?.name || '싱글';
  row.addEventListener('click', () => selectTrack(index));
  row.querySelector('.track-heart').addEventListener('click', (event) => {
    event.stopPropagation();
    event.currentTarget.classList.toggle('liked');
    event.currentTarget.textContent = event.currentTarget.classList.contains('liked') ? '♥' : '♡';
  });
  return row;
};

const render = (playlist) => {
  tracks = playlist.tracks.slice(0, 15);
  document.title = `${playlist.title} | 플로비`;
  const cover = document.getElementById('playlist-cover');
  if (playlist.coverUrl) cover.src = playlist.coverUrl;
  cover.alt = `${playlist.title} 커버`;
  document.getElementById('playlist-title').textContent = playlist.title;
  document.getElementById('playlist-description').textContent = playlist.description;
  document.getElementById('playlist-summary').textContent = `플로비 Curated · ${tracks.length}곡 · ${Math.floor(totalDuration(tracks) / 60000)}분`;
  document.getElementById('playlist-count').textContent = `${tracks.length}곡`;
  document.getElementById('playlist-code').textContent = String(window.FlowbeePlaylists.definitions.findIndex((item) => item.slug === playlist.slug) + 1).padStart(2, '0');
  document.getElementById('playlist-tags').replaceChildren(...playlist.tags.map((tag) => Object.assign(document.createElement('span'), { textContent: tag })));
  document.getElementById('playlist-tracks').replaceChildren(...tracks.map(createTrackRow));
  // 다른 화면에서 넘어온 곡을 이어 재생 중이면 재생바 커버를 덮어쓰지 않는다.
  if (!handoff.active) document.getElementById('player-cover').src = playlist.coverUrl;
  statusBox.hidden = true;
  content.hidden = false;
  playlistBody.hidden = false;
  playerBar.hidden = false;
  document.querySelector('.playlist-like').classList.toggle('liked', Boolean(getLikedRecommended()[playlist.slug]));
};

const RECOMMENDED_LIKES_KEY = 'flowbee_liked_recommended_playlists';
const getLikedRecommended = () => {
  try { return JSON.parse(localStorage.getItem(RECOMMENDED_LIKES_KEY) || '{}'); } catch { return {}; }
};
const setLikedRecommended = (likes) => {
  try { localStorage.setItem(RECOMMENDED_LIKES_KEY, JSON.stringify(likes)); } catch { /* no-op */ }
};

playbackButtons.forEach((button) => button.addEventListener('click', togglePlayback));
document.querySelector('.add-button').addEventListener('click', (event) => event.currentTarget.classList.toggle('added'));
document.querySelector('.playlist-like').addEventListener('click', (event) => {
  if (!definition) return;
  const button = event.currentTarget;
  const liked = button.classList.toggle('liked');
  const likes = getLikedRecommended();
  if (liked) {
    likes[definition.slug] = {
      title: document.getElementById('playlist-title').textContent,
      coverUrl: document.getElementById('playlist-cover').src,
    };
  } else {
    delete likes[definition.slug];
  }
  setLikedRecommended(likes);
});
document.getElementById('player-prev').addEventListener('click', () => tracks.length && selectTrack(currentIndex > 0 ? currentIndex - 1 : tracks.length - 1));
document.getElementById('player-next').addEventListener('click', () => tracks.length && selectTrack(currentIndex + 1 < tracks.length ? currentIndex + 1 : 0));
const nowPlayingSnapshot = () => ({
  title: document.getElementById('now-title').textContent,
  artist: document.getElementById('now-artist').textContent,
  thumbnailUrl: document.getElementById('player-cover').src,
  playUrl: audio.src,
  source: 'itunes',
});
const saveSnapshot = (isPlaying) => {
  if (window.saveNowPlaying && audio.src) window.saveNowPlaying(nowPlayingSnapshot(), audio.currentTime, isPlaying);
};

audio.addEventListener('play', () => { setPlaying(true); saveSnapshot(true); });
audio.addEventListener('pause', () => { setPlaying(false); saveSnapshot(false); });
audio.addEventListener('ended', () => { if (window.clearNowPlaying) window.clearNowPlaying(); });
audio.addEventListener('timeupdate', () => {
  const limit = Number.isFinite(audio.duration) ? Math.min(audio.duration, previewLimit) : previewLimit;
  if (audio.currentTime >= limit) { audio.pause(); audio.currentTime = limit; }
  updatePlayer();
  if (!audio.paused) saveSnapshot(true);
});
audio.addEventListener('loadedmetadata', updatePlayer);
seek.addEventListener('input', () => {
  if (handoff.seekTo(Number(seek.value))) return;
  if (tracks[currentIndex]?.playUrl) audio.currentTime = Number(seek.value);
  updatePlayer();
});
volume.addEventListener('input', () => { audio.volume = Number(volume.value); volume.style.setProperty('--progress', `${audio.volume * 100}%`); });
audio.volume = Number(volume.value);
// 라이브러리로 돌아가는 링크는 api.js 의 전역 클릭 핸들러가 가로챈다.
// 재생 중인 <audio> 를 살린 채 셸만 갈아끼운다.
window.addEventListener('popstate', () => location.reload(), { once: true });

handoff.start();

const slug = location.pathname.match(/^\/playlist\/([^/]+)\/?$/)?.[1] || new URLSearchParams(location.search).get('id') || window.FlowbeePlaylists.definitions[0].slug;
const definition = window.FlowbeePlaylists.find(decodeURIComponent(slug));
if (!definition) {
  statusBox.textContent = '존재하지 않는 추천 플레이리스트입니다.';
  statusBox.classList.add('is-error');
} else {
  window.FlowbeePlaylists.load(definition).then(render).catch((error) => {
    statusBox.textContent = error.message;
    statusBox.classList.add('is-error');
  });
}
}());

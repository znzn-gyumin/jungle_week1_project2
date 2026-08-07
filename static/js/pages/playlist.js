const statusBox = document.getElementById('playlist-status');
const content = document.getElementById('playlist-content');
const playlistBody = document.getElementById('playlist-body');
const playerBar = document.getElementById('playlist-player');
const drawer = document.getElementById('now-playing-drawer');
if (window.ensureSiteNowPlayingDrawer) window.ensureSiteNowPlayingDrawer();
const audio = document.getElementById('audio-player');
const seek = document.getElementById('player-seek');
const volume = document.getElementById('player-volume');
const playbackButtons = [document.getElementById('playlist-play'), document.getElementById('player-toggle')];
const previewLimit = 30;
let tracks = [];
let currentIndex = -1;
// 다른 화면에서 재생하던 곡을 이어받은 상태. render 가 커버를 덮어쓰지 않게 표시해 둔다.
let handoffActive = false;

const formatDuration = (milliseconds) => {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return '—';
  const seconds = Math.floor(milliseconds / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

const totalDuration = (items) => items.reduce((total, track) => total + (track.durationMs || 0), 0);
const setPlaying = (playing) => playbackButtons.forEach((button) => button.classList.toggle('is-playing', playing));

const updatePlayer = () => {
  const elapsed = Number.isFinite(audio.currentTime) ? Math.min(audio.currentTime, previewLimit) : 0;
  const duration = Math.min(Number.isFinite(audio.duration) ? audio.duration : previewLimit, previewLimit);
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
  document.getElementById('drawer-cover').src = track.thumbnailUrl || document.getElementById('playlist-cover').src;
  document.getElementById('drawer-title').textContent = track.title;
  document.getElementById('drawer-artist').textContent = track.artist;
  const queue = tracks.slice(index + 1, index + 6).map((item, offset) => {
    const row = document.createElement('div');
    row.className = 'drawer-queue-item';
    row.innerHTML = '<img alt=""><div><b></b><small></small></div>';
    row.querySelector('img').src = item.thumbnailUrl || document.getElementById('playlist-cover').src;
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
  handoffActive = false;
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
  if (ytHandoffActive && ytHandoffPlayer) {
    if (ytHandoffPlayer.getPlayerState() === window.YT.PlayerState.PLAYING) ytHandoffPlayer.pauseVideo();
    else ytHandoffPlayer.playVideo();
    return;
  }
  if (currentIndex < 0) selectTrack(0);
  else if (audio.paused) {
    if (audio.currentTime >= previewLimit - .1) audio.currentTime = 0;
    audio.play().catch(() => setPlaying(false));
  } else audio.pause();
};

const createTrackRow = (track, index) => {
  const row = document.createElement('li');
  row.innerHTML = `<span>${index + 1}</span><img alt=""><div><b></b><small></small></div><em></em><button class="track-heart" type="button">♡</button><time>${formatDuration(track.durationMs)}</time>`;
  row.querySelector('img').src = track.thumbnailUrl || '';
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

const ensureStylesheet = (href) => {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.append(link);
};

const openLibraryWithoutStoppingPlayback = async (event, pushHistory = true) => {
  event?.preventDefault();
  // 이 화면의 <audio> 를 그대로 살려서 옮기므로, 새 페이지가 handoff 로 또 한 번
  // 재생을 시작하면 소리가 겹친다. 여기서 지워서 이중 재생을 막는다.
  if (window.clearNowPlaying) window.clearNowPlaying();
  drawer?.classList.add('is-collapsed');
  const drawerToggle = document.getElementById('drawer-toggle');
  if (drawerToggle) {
    drawerToggle.textContent = '‹';
    drawerToggle.setAttribute('aria-label', '현재 재생 패널 열기');
  }
  try {
    const response = await fetch('/');
    if (!response.ok) throw new Error('라이브러리를 불러오지 못했습니다.');
    const nextDocument = new DOMParser().parseFromString(await response.text(), 'text/html');
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
    const playlistDefinitions = document.createElement('script');
    playlistDefinitions.src = '/js/recommended-playlists.js';
    playlistDefinitions.addEventListener('load', () => {
      const fixedCatalog = document.createElement('script');
      fixedCatalog.src = '/js/fixed-catalog.js';
      fixedCatalog.addEventListener('load', () => {
        const mainScript = document.createElement('script');
        mainScript.src = `/js/pages/main.js?v=${Date.now()}`;
        document.body.append(mainScript);
      });
      document.body.append(fixedCatalog);
    });
    document.body.append(playlistDefinitions);
  } catch (error) {
    statusBox.hidden = false;
    statusBox.textContent = error.message;
    statusBox.classList.add('is-error');
  }
};

const render = (playlist) => {
  tracks = playlist.tracks.slice(0, 15);
  document.title = `${playlist.title} | Flowbee`;
  const cover = document.getElementById('playlist-cover');
  if (playlist.coverUrl) cover.src = playlist.coverUrl;
  cover.alt = `${playlist.title} 커버`;
  document.getElementById('playlist-title').textContent = playlist.title;
  document.getElementById('playlist-description').textContent = playlist.description;
  document.getElementById('playlist-summary').textContent = `Flowbee Curated · ${tracks.length}곡 · ${Math.floor(totalDuration(tracks) / 60000)}분`;
  document.getElementById('playlist-count').textContent = `${tracks.length}곡`;
  document.getElementById('playlist-code').textContent = String(window.FlowbeePlaylists.definitions.findIndex((item) => item.slug === playlist.slug) + 1).padStart(2, '0');
  document.getElementById('playlist-tags').replaceChildren(...playlist.tags.map((tag) => Object.assign(document.createElement('span'), { textContent: tag })));
  document.getElementById('playlist-tracks').replaceChildren(...tracks.map(createTrackRow));
  if (!handoffActive) document.getElementById('player-cover').src = playlist.coverUrl;
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
  if (ytHandoffActive && ytHandoffPlayer) {
    ytHandoffPlayer.seekTo(Number(seek.value), true);
    updateYtHandoffTime();
    return;
  }
  if (tracks[currentIndex]?.playUrl) audio.currentTime = Number(seek.value);
  updatePlayer();
});
volume.addEventListener('input', () => { audio.volume = Number(volume.value); volume.style.setProperty('--progress', `${audio.volume * 100}%`); });
audio.volume = Number(volume.value);
document.querySelectorAll('.back-link, .playlist-brand').forEach((link) => link.addEventListener('click', openLibraryWithoutStoppingPlayback));
window.addEventListener('popstate', () => {
  if (location.pathname === '/') openLibraryWithoutStoppingPlayback(null, false);
  else location.reload();
}, { once: true });

if (window.loadNowPlayingHandoff) {
  const handoff = window.loadNowPlayingHandoff();
  if (handoff && handoff.isPlaying && handoff.playUrl) {
    handoffActive = true;
    document.getElementById('now-title').textContent = handoff.title;
    document.getElementById('now-artist').textContent = handoff.artist;
    if (handoff.thumbnailUrl) document.getElementById('player-cover').src = handoff.thumbnailUrl;
    if (window.fillNowPlayingDrawer) window.fillNowPlayingDrawer(handoff);
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

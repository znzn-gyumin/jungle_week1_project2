const statusBox = document.getElementById('playlist-status');
const content = document.getElementById('playlist-content');
const playlistBody = document.getElementById('playlist-body');
const playerBar = document.getElementById('playlist-player');
const audio = document.getElementById('audio-player');
const seek = document.getElementById('player-seek');
const volume = document.getElementById('player-volume');
const playbackButtons = [document.getElementById('playlist-play'), document.getElementById('player-toggle')];
const previewLimit = 30;
let tracks = [];
let currentIndex = -1;

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

const selectTrack = (index, autoplay = true) => {
  const track = tracks[index];
  if (!track) return;
  currentIndex = index;
  document.getElementById('now-title').textContent = track.title;
  document.getElementById('now-artist').textContent = track.artist;
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
  document.getElementById('player-cover').src = playlist.coverUrl;
  statusBox.hidden = true;
  content.hidden = false;
  playlistBody.hidden = false;
  playerBar.hidden = false;
};

playbackButtons.forEach((button) => button.addEventListener('click', togglePlayback));
document.querySelector('.add-button').addEventListener('click', (event) => event.currentTarget.classList.toggle('added'));
document.querySelector('.playlist-like').addEventListener('click', (event) => event.currentTarget.classList.toggle('liked'));
document.getElementById('player-prev').addEventListener('click', () => tracks.length && selectTrack(currentIndex > 0 ? currentIndex - 1 : tracks.length - 1));
document.getElementById('player-next').addEventListener('click', () => tracks.length && selectTrack(currentIndex + 1 < tracks.length ? currentIndex + 1 : 0));
audio.addEventListener('play', () => setPlaying(true));
audio.addEventListener('pause', () => setPlaying(false));
audio.addEventListener('timeupdate', () => {
  const limit = Number.isFinite(audio.duration) ? Math.min(audio.duration, previewLimit) : previewLimit;
  if (audio.currentTime >= limit) { audio.pause(); audio.currentTime = limit; }
  updatePlayer();
});
audio.addEventListener('loadedmetadata', updatePlayer);
seek.addEventListener('input', () => { if (tracks[currentIndex]?.playUrl) audio.currentTime = Number(seek.value); updatePlayer(); });
volume.addEventListener('input', () => { audio.volume = Number(volume.value); volume.style.setProperty('--progress', `${audio.volume * 100}%`); });
audio.volume = Number(volume.value);

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

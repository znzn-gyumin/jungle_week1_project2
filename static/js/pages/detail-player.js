// 앨범 상세와 추천 플레이리스트 상세가 같이 쓰는 재생바 조각.
// 두 화면은 사이트 공용 플레이어(.player-bar) 대신 자기 <audio> 로 직접 재생한다.
(function () {
const formatDuration = (milliseconds) => {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return '—';
  const seconds = Math.floor(milliseconds / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

// 다른 화면에서 재생하던 곡을 이어받은 상태를 관리한다.
// 유튜브 곡은 <audio> 가 아니라 숨은 iframe 플레이어가 물고 있어서
// 재생/일시정지·탐색·진행바를 따로 태워 줘야 한다.
const createHandoff = ({ audio, seek, setPlaying, playerBar }) => {
  const el = (id) => document.getElementById(id);
  let active = false;
  let youtube = false;
  let player = null;
  let timer = null;

  const updateYtTime = () => {
    if (!player || typeof player.getDuration !== 'function') return;
    const duration = player.getDuration();
    if (!duration) return;
    const elapsed = player.getCurrentTime();
    seek.max = String(duration);
    seek.value = String(elapsed);
    seek.style.setProperty('--progress', `${(elapsed / duration) * 100}%`);
    el('player-current').textContent = formatDuration(elapsed * 1000);
    el('player-duration').textContent = formatDuration(duration * 1000);
  };

  const onYtState = (event) => {
    if (!youtube) return;
    const playing = event.data === window.YT.PlayerState.PLAYING;
    setPlaying(playing);
    clearInterval(timer);
    timer = playing ? setInterval(updateYtTime, 500) : null;
    updateYtTime();
  };

  const stop = () => {
    active = false;
    if (!youtube) return;
    youtube = false;
    clearInterval(timer);
    timer = null;
    if (player) player.pauseVideo();
    setPlaying(false);
  };

  // 유튜브로 이어받는 중이면 여기서 처리하고 true 를 돌려준다.
  // false 면 화면이 평소대로 <audio> 를 다루면 된다.
  const togglePlayback = () => {
    if (!youtube || !player) return false;
    if (player.getPlayerState() === window.YT.PlayerState.PLAYING) player.pauseVideo();
    else player.playVideo();
    return true;
  };

  const seekTo = (value) => {
    if (!youtube || !player) return false;
    player.seekTo(value, true);
    updateYtTime();
    return true;
  };

  const start = () => {
    const handoff = window.loadNowPlayingHandoff && window.loadNowPlayingHandoff();
    if (!handoff || !handoff.isPlaying || !handoff.playUrl) return;
    active = true;
    el('now-title').textContent = handoff.title;
    el('now-artist').textContent = handoff.artist;
    if (handoff.thumbnailUrl) el('player-cover').src = handoff.thumbnailUrl;
    if (window.fillNowPlayingDrawer) window.fillNowPlayingDrawer(handoff);
    playerBar.hidden = false;
    if (handoff.source === 'youtube') {
      youtube = true;
      window.resumeYouTubeHandoff(handoff, onYtState)
        .then((resumed) => { player = resumed; })
        .catch(() => stop());
      return;
    }
    audio.src = handoff.playUrl;
    audio.addEventListener('loadedmetadata', () => { audio.currentTime = handoff.currentTime || 0; }, { once: true });
    audio.play().catch(() => setPlaying(false));
  };

  return {
    get active() { return active; },
    start,
    stop,
    togglePlayback,
    seekTo,
  };
};

window.FlowbeeDetailPlayer = { formatDuration, createHandoff };
}());

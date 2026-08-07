const playbackButtons = [document.getElementById('playlist-play'), document.getElementById('player-toggle')];
const setPlaying = (isPlaying) => {
  playbackButtons.forEach((button) => {
    button.classList.toggle('is-playing', isPlaying);
    button.setAttribute('aria-label', isPlaying ? '일시정지' : '재생');
  });
};

playbackButtons.forEach((button) => button.addEventListener('click', () => setPlaying(!button.classList.contains('is-playing'))));

document.querySelector('.add-button').addEventListener('click', (event) => {
  const button = event.currentTarget;
  const added = button.classList.toggle('added');
  button.setAttribute('aria-label', added ? '라이브러리에서 제거' : '내 라이브러리에 추가');
});

document.querySelector('.playlist-like').addEventListener('click', (event) => {
  const button = event.currentTarget;
  const liked = button.classList.toggle('liked');
  button.setAttribute('aria-label', liked ? '플레이리스트 좋아요 취소' : '플레이리스트 좋아요');
});

document.getElementById('more-button').addEventListener('click', () => document.getElementById('more-menu').classList.toggle('open'));

document.querySelectorAll('.playlist-tracks li').forEach((track) => {
  track.addEventListener('dblclick', () => {
    document.getElementById('now-title').textContent = track.querySelector('b').textContent;
    setPlaying(true);
  });
});

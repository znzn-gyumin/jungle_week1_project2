const playerButtons = [document.getElementById('album-play'), document.getElementById('player-toggle')];

function setPlaying(isPlaying) {
  playerButtons.forEach((button) => {
    button.classList.toggle('is-playing', isPlaying);
    button.setAttribute('aria-label', isPlaying ? '일시정지' : '재생');
  });
}

playerButtons.forEach((button) => {
  button.addEventListener('click', () => setPlaying(!button.classList.contains('is-playing')));
});

document.querySelector('.album-like').addEventListener('click', (event) => {
  const button = event.currentTarget;
  const liked = button.classList.toggle('liked');
  button.setAttribute('aria-label', liked ? '앨범 좋아요 취소' : '앨범 좋아요');
});

document.querySelectorAll('.heart').forEach((button) => {
  button.addEventListener('click', () => {
    button.classList.toggle('liked');
    button.textContent = button.classList.contains('liked') ? '♥' : '♡';
  });
});

document.querySelectorAll('.track-list li').forEach((track) => {
  track.addEventListener('dblclick', () => {
    document.getElementById('now-title').textContent = track.querySelector('b').textContent;
    setPlaying(true);
  });
});

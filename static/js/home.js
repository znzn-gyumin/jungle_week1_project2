window.addEventListener('DOMContentLoaded', () => {
document.getElementById('hero').classList.add('revealed');
document.querySelectorAll('.tape-card').forEach((card) => {
  card.setAttribute('role', 'link');
  card.setAttribute('tabindex', '0');
  const openAlbum = () => {
    document.body.classList.add('page-leaving');
    // 카세트 카드는 장식용이라 연결된 앨범이 없다. 라이브러리로 보낸다.
    window.setTimeout(() => { window.location.href = '/'; }, 220);
  };
  card.addEventListener('click', openAlbum);
  card.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') openAlbum();
  });
});
});

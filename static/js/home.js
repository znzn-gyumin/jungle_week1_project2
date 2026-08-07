window.addEventListener('DOMContentLoaded', () => {
document.getElementById('hero').classList.add('revealed');
document.querySelectorAll('.tape-card').forEach((card) => {
  card.setAttribute('role', 'link');
  card.setAttribute('tabindex', '0');
  const openAlbum = () => {
    document.body.classList.add('page-leaving');
    window.setTimeout(() => { window.location.href = '/album.html'; }, 220);
  };
  card.addEventListener('click', openAlbum);
  card.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') openAlbum();
  });
});
});

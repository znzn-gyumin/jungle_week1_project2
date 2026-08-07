window.addEventListener('DOMContentLoaded', () => {
    const grid = document.getElementById('card-grid');
    if (!grid) return;

    const TERMS = ['NewJeans', '아이유', '방탄소년단', '르세라핌', '에스파', '세븐틴'];
    grid.innerHTML = '';
    renderApiStatus(grid, '불러오는 중...');

    withCache('flowbee_cache_latest-albums', () => fetchMixedAlbums(TERMS, 5))
        .then((albums) => {
            if (!albums.length) {
                renderApiStatus(grid, '불러올 앨범이 없어요. 잠시 후 다시 시도해주세요.');
                return;
            }
            grid.innerHTML = albums.slice(0, 30).map(renderAlbumCard).join('');
        })
        .catch(() => renderApiStatus(grid, '앨범을 불러오는 데 실패했어요.'));
});

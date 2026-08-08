(function () {
    const initialize = () => {
        const grid = document.getElementById('card-grid');
        if (!grid) return;
        renderApiStatus(grid, '최신 앨범을 불러오는 중...');
        // 서버가 검색 결과를 넓게 받아 발매일순으로 세워 준다. 목록을 여기 적어 둘 필요가 없다.
        fetch(`${CATALOG_API}/api/albums/latest?limit=8`)
            .then((res) => {
                if (!res.ok) throw new Error(`latest albums failed: ${res.status}`);
                return res.json();
            })
            .then(({ albums }) => { grid.innerHTML = albums.map(renderAlbumCard).join(''); })
            .catch(() => renderApiStatus(grid, '최신 앨범을 불러오지 못했어요.'));
    };
    if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', initialize, { once: true });
    else initialize();
}());

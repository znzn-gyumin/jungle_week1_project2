(function () {
    const initialize = () => {
        const grid = document.getElementById('card-grid');
        if (!grid || !window.FlowbeeFixedCatalog) return;
        renderApiStatus(grid, '고정 최신 앨범을 불러오는 중...');
        window.FlowbeeFixedCatalog.loadLatestAlbums()
            .then((albums) => { grid.innerHTML = albums.map(renderAlbumCard).join(''); })
            .catch(() => renderApiStatus(grid, '최신 앨범을 불러오지 못했어요.'));
    };
    if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', initialize, { once: true });
    else initialize();
}());

(function () {
    const initialize = () => {
        const list = document.getElementById('chart-list');
        if (!list) return;
        renderApiStatus(list, 'TOP 트랙을 불러오는 중...');
        // 서버가 Apple Music 차트 피드를 받아 캐시한다. 브라우저 캐시는 없어도 된다.
        fetch(`${CATALOG_API}/api/tracks/top?limit=20`)
            .then((res) => {
                if (!res.ok) throw new Error(`top tracks failed: ${res.status}`);
                return res.json();
            })
            .then(({ tracks }) => { list.innerHTML = tracks.map((track, index) => renderChartRow(index + 1, track)).join(''); })
            .catch(() => renderApiStatus(list, 'TOP 트랙을 불러오지 못했어요.'));
    };
    if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', initialize, { once: true });
    else initialize();
}());

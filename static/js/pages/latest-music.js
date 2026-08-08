(function () {
    const initialize = () => {
        const list = document.getElementById('chart-list');
        if (!list) return;
        renderApiStatus(list, '최신 음악을 불러오는 중...');
        // 서버가 검색 결과를 넓게 받아 발매일순으로 세워 준다. 목록을 여기 적어 둘 필요가 없다.
        fetch(`${CATALOG_API}/api/tracks/latest?limit=20`)
            .then((res) => {
                if (!res.ok) throw new Error(`latest tracks failed: ${res.status}`);
                return res.json();
            })
            .then(({ tracks }) => { list.innerHTML = tracks.map((track, index) => renderChartRow(index + 1, track)).join(''); })
            .catch(() => renderApiStatus(list, '최신 음악을 불러오지 못했어요.'));
    };
    if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', initialize, { once: true });
    else initialize();
}());

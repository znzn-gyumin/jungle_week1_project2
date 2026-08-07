window.addEventListener('DOMContentLoaded', () => {
    const list = document.getElementById('chart-list');
    if (!list) return;

    const TERMS = ['방탄소년단', 'IVE', '아이유', '세븐틴', '뉴진스'];
    renderApiStatus(list, '불러오는 중...');

    withCache('flowbee_cache_chart', () => fetchMixedTracks(TERMS, 4))
        .then((tracks) => {
            if (!tracks.length) {
                renderApiStatus(list, '불러올 곡이 없어요. 잠시 후 다시 시도해주세요.');
                return;
            }
            list.innerHTML = tracks.slice(0, 30).map((track, i) => renderChartRow(i + 1, track)).join('');
        })
        .catch(() => renderApiStatus(list, '음악을 불러오는 데 실패했어요.'));
});

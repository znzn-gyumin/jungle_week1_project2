window.addEventListener('DOMContentLoaded', () => {
    const list = document.getElementById('chart-list');
    if (!list || !window.FlowbeeFixedCatalog) return;
    renderApiStatus(list, '고정 멜론 차트를 불러오는 중...');
    window.FlowbeeFixedCatalog.loadMelonChart()
        .then((tracks) => { list.innerHTML = tracks.map((track, index) => renderChartRow(index + 1, track)).join(''); })
        .catch(() => renderApiStatus(list, '멜론 차트를 불러오지 못했어요.'));
});

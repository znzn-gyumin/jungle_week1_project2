(function () {
const initializeGenrePage = () => {
    const list = document.getElementById('chart-list');
    const filter = document.querySelector('.genre-filter');
    if (!list || !filter) return;

    const GENRES = ['발라드', '댄스', 'R&B', '힙합', '인디', '재즈', '어쿠스틱', '시티팝'];

    const fetchGenre = (genre) => withCache(`flowbee_cache_genre_v3_${genre}`, () => fetchSearch({ q: genre, type: 'track', source: 'all', limit: 15 }).then((data) => data.tracks));

    const renderTracks = (tracks, genreLabel) => {
        if (!tracks.length) {
            renderApiStatus(list, '불러올 곡이 없어요. 잠시 후 다시 시도해주세요.');
            return;
        }
        list.innerHTML = tracks.slice(0, 30).map((track, i) => renderChartRow(i + 1, track, genreLabel)).join('');
    };

    const loadAll = () => withCache('flowbee_cache_genre_all_v3', async () => {
        const settled = await Promise.allSettled(GENRES.map(async (genre) => {
            const tracks = await fetchGenre(genre);
            return tracks.slice(0, 4).map((track) => ({ track, genre }));
        }));
        const combined = [];
        settled.forEach((result) => {
            if (result.status === 'fulfilled') combined.push(...result.value);
        });
        return combined;
    }).then((combined) => {
        if (!combined.length) {
            renderApiStatus(list, '불러올 곡이 없어요. 잠시 후 다시 시도해주세요.');
            return;
        }
        list.innerHTML = combined.slice(0, 30)
            .map(({ track, genre }, i) => renderChartRow(i + 1, track, genre))
            .join('');
    });

    const loadGenre = async (genre) => {
        renderApiStatus(list, '불러오는 중...');
        try {
            const tracks = await fetchGenre(genre);
            renderTracks(tracks, genre);
        } catch {
            renderApiStatus(list, '음악을 불러오는 데 실패했어요.');
        }
    };

    filter.querySelectorAll('.genre-filter-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            filter.querySelectorAll('.genre-filter-btn').forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');
            const genre = btn.dataset.genre;
            if (genre === 'all') {
                renderApiStatus(list, '불러오는 중...');
                loadAll().catch(() => renderApiStatus(list, '음악을 불러오는 데 실패했어요.'));
            } else {
                loadGenre(genre);
            }
        });
    });

    renderApiStatus(list, '불러오는 중...');
    loadAll().catch(() => renderApiStatus(list, '음악을 불러오는 데 실패했어요.'));
};
if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', initializeGenrePage, { once: true });
else initializeGenrePage();
}());

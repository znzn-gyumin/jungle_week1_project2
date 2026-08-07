function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
}

const FLOWBEE_CACHE_TTL_MS = 3 * 24 * 60 * 60 * 1000; // 3일마다 새로 불러온다

function getCached(key) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const { ts, data } = JSON.parse(raw);
        if (Date.now() - ts > FLOWBEE_CACHE_TTL_MS) return null;
        return data;
    } catch {
        return null;
    }
}

function setCached(key, data) {
    try {
        localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
    } catch {
        // localStorage 를 못 쓰는 환경이면 그냥 매번 새로 불러온다
    }
}

async function withCache(key, loader) {
    const cached = getCached(key);
    if (cached) return cached;
    const data = await loader();
    setCached(key, data);
    return data;
}

async function fetchSearch({ q, type = 'track', source = 'all', limit = 8 }) {
    const params = new URLSearchParams({ q, type, source, limit: String(limit) });
    const res = await fetch(`/api/search?${params.toString()}`);
    if (!res.ok) throw new Error(`search failed: ${res.status}`);
    return res.json();
}

async function fetchMixedTracks(terms, perTerm = 2, source = 'all') {
    const settled = await Promise.allSettled(terms.map((term) => fetchSearch({ q: term, type: 'track', source, limit: perTerm })));
    const tracks = [];
    settled.forEach((result) => {
        if (result.status === 'fulfilled') tracks.push(...result.value.tracks);
    });
    return tracks;
}

async function fetchMixedAlbums(terms, perTerm = 3) {
    const settled = await Promise.allSettled(terms.map((term) => fetchSearch({ q: term, type: 'album', source: 'itunes', limit: perTerm })));
    const albums = [];
    settled.forEach((result) => {
        if (result.status === 'fulfilled') albums.push(...result.value.albums);
    });
    return albums;
}

function renderChartRow(rank, track, genreLabel) {
    const albumText = genreLabel || (track.album ? track.album.name : (track.source === 'youtube' ? 'YouTube' : ''));
    const title = escapeHtml(track.title);
    const artist = escapeHtml(track.artist);
    return `<div class="chart-row" data-title="${title}" data-artist="${artist}">
        <span class="chart-rank">${rank}</span>
        <img class="chart-thumb" src="${escapeHtml(track.thumbnailUrl || '')}" alt="">
        <div class="chart-meta"><b>${title}</b><small>${artist}</small></div>
        <span class="chart-album">${escapeHtml(albumText)}</span>
        <button class="chart-like" aria-label="곡은 좋아요를 누를 수 없습니다" disabled>♡</button>
    </div>`;
}

function renderAlbumCard(album) {
    return `<div class="track-card">
        <div class="track-thumb" style="background-image:url('${escapeHtml(album.thumbnailUrl || '')}');background-size:cover;background-position:center;"></div>
        <div class="track-name">${escapeHtml(album.name)}</div>
        <div class="track-sub">${escapeHtml(album.artist)}</div>
    </div>`;
}

function renderApiStatus(container, message) {
    container.innerHTML = `<p class="api-status">${escapeHtml(message)}</p>`;
}

document.addEventListener('click', (event) => {
    const row = event.target.closest('.chart-row[data-title]');
    if (!row || event.target.closest('.chart-like')) return;
    if (window.flowbeePlayTrack) window.flowbeePlayTrack(row.dataset.title, row.dataset.artist);
});

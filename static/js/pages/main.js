(function () {
const albumGrids = [...document.querySelectorAll('[data-album-grid]')];
const playlistGrid = document.querySelector('[data-playlist-grid]');
const playlistFixedGrid = document.querySelector('[data-playlist-grid-fixed]');

const albumSearchUrl = (query, limit = 10) => {
    const params = new URLSearchParams({
        q: query,
        type: 'album',
        source: 'itunes',
        limit: String(limit),
    });
    return `/api/search?${params}`;
};

const createAlbumCard = (album) => {
    const card = document.createElement('a');
    card.className = 'track-card';
    card.href = `/album/${album.id}`;

    const cover = document.createElement('div');
    cover.className = 'track-thumb album-thumb';
    if (album.thumbnailUrl) cover.style.backgroundImage = `url("${album.thumbnailUrl.replaceAll('"', '%22')}")`;

    const title = document.createElement('div');
    title.className = 'track-name';
    title.textContent = album.name;

    const subtitle = document.createElement('div');
    subtitle.className = 'track-sub';
    const trackCount = album.totalTracks ? ` · ${album.totalTracks}곡` : '';
    subtitle.textContent = `${album.artist}${trackCount}`;

    card.append(cover, title, subtitle);
    card.addEventListener('click', () => {
        cover.style.viewTransitionName = 'selected-album-cover';
    });
    return card;
};

const createPlaylistCard = (playlist) => {
    const card = document.createElement('a');
    card.className = 'track-card playlist-card';
    card.href = `/playlist/${playlist.slug}`;
    const cover = document.createElement('div');
    cover.className = 'track-thumb album-thumb';
    if (playlist.coverUrl) cover.style.backgroundImage = `url("${playlist.coverUrl.replaceAll('"', '%22')}")`;
    const title = document.createElement('div');
    title.className = 'track-name';
    title.textContent = playlist.title;
    const subtitle = document.createElement('div');
    subtitle.className = 'track-sub';
    subtitle.textContent = `플로비 추천 · ${playlist.tracks.length}곡`;
    card.append(cover, title, subtitle);
    return card;
};

const showGridMessage = (grid, message, isError = false) => {
    const box = document.createElement('div');
    box.className = `album-grid-message${isError ? ' is-error' : ''}`;
    box.textContent = message;
    grid.replaceChildren(box);
};

const updateMoreButton = (section) => {
    const title = section.querySelector('.section-title');
    const count = section.querySelectorAll('.card-grid > .track-card').length;
    let button = section.querySelector('.more-btn');
    if (count <= 5) {
        button?.remove();
        section.classList.remove('expanded');
        return;
    }
    if (button) return;
    button = document.createElement('button');
    button.type = 'button';
    button.className = 'more-btn';
    button.textContent = '더보기';
    title.insertAdjacentElement('afterend', button);
    button.addEventListener('click', () => {
        const expanded = section.classList.toggle('expanded');
        button.textContent = expanded ? '접기' : '더보기';
    });
};

const updateSliderControls = (section, grid = section.querySelector('[data-album-grid], [data-playlist-grid]')) => {
    const head = section.querySelector('.section-head');
    const cardCount = grid.querySelectorAll(':scope > .track-card').length;
    let controls = section.querySelector('.album-slider-controls');
    if (cardCount <= 5) {
        controls?.remove();
        return;
    }
    if (controls) return;
    controls = document.createElement('div');
    controls.className = 'album-slider-controls';
    controls.innerHTML = '<button type="button" aria-label="이전 항목">‹</button><button type="button" aria-label="다음 항목">›</button>';
    const [previous, next] = controls.querySelectorAll('button');
    const move = (direction) => grid.scrollBy({ left: grid.clientWidth * .88 * direction, behavior: 'smooth' });
    previous.addEventListener('click', () => move(-1));
    next.addEventListener('click', () => move(1));
    head.append(controls);
};

const loadRecommendedPlaylists = async () => {
    if (!playlistGrid || !window.FlowbeePlaylists) return;
    showGridMessage(playlistGrid, '플로비 추천 플레이리스트를 만드는 중입니다.');
    const results = await Promise.allSettled(
        window.FlowbeePlaylists.definitions.map(window.FlowbeePlaylists.load),
    );
    const playlists = results.filter((result) => result.status === 'fulfilled' && result.value.tracks.length).map((result) => result.value);
    if (!playlists.length) {
        showGridMessage(playlistGrid, '추천 플레이리스트를 만들지 못했습니다.', true);
        return;
    }
    playlistGrid.replaceChildren(...playlists.map(createPlaylistCard));
    const section = playlistGrid.closest('.section');
    updateMoreButton(section);
    updateSliderControls(section);
};

const loadFixedPlaylists = async () => {
    if (!playlistFixedGrid || !window.FlowbeePlaylists) return;
    showGridMessage(playlistFixedGrid, '플로비 추천 플레이리스트를 만드는 중입니다.');
    const playlists = await window.FlowbeePlaylists.loadFixed(10);
    if (!playlists.length) {
        showGridMessage(playlistFixedGrid, '추천 플레이리스트를 만들지 못했습니다.', true);
        return;
    }
    playlistFixedGrid.replaceChildren(...playlists.map(createPlaylistCard));
};

const initializePlaylistReroll = () => {
    const button = document.getElementById('playlist-reroll');
    if (!button || !window.FlowbeePlaylists) return;
    button.addEventListener('click', async () => {
        button.disabled = true;
        button.classList.add('is-spinning');
        window.FlowbeePlaylists.reroll();
        await loadRecommendedPlaylists();
        button.disabled = false;
        button.classList.remove('is-spinning');
    });
};

const initializeNowPlayingDrawer = () => {
    const drawer = document.getElementById('now-playing-drawer');
    const toggle = document.getElementById('drawer-toggle');
    if (!drawer || !toggle || toggle.dataset.initialized === 'true') return;
    toggle.dataset.initialized = 'true';
    toggle.addEventListener('click', () => {
        const collapsed = drawer.classList.toggle('is-collapsed');
        toggle.textContent = collapsed ? '‹' : '›';
        toggle.setAttribute('aria-label', collapsed ? '현재 재생 패널 열기' : '현재 재생 패널 닫기');
    });
};

const trackSearchUrl = (query, limit = 1) => {
    const params = new URLSearchParams({
        q: query,
        type: 'track',
        source: 'itunes',
        limit: String(limit),
    });
    return `/api/search?${params}`;
};

let weekPickTrack = null;

const updateWeekPick = (track) => {
    const pick = document.querySelector('.week-pick');
    if (!pick || !track) return;
    weekPickTrack = track;
    const name = pick.querySelector('strong');
    if (name) name.textContent = track.title;
};

const loadWeekPickTrack = async () => {
    if (!document.querySelector('.week-pick')) return;
    try {
        const response = await fetch(trackSearchUrl('Red Velvet'));
        const data = await response.json().catch(() => ({}));
        const track = (data.tracks || [])[0];
        if (track) updateWeekPick(track);
    } catch {
        // 이번 주 추천은 실패해도 기본 문구를 그대로 둔다
    }
};

const initializeWeekPickPlay = () => {
    const pick = document.querySelector('.week-pick');
    if (!pick) return;
    pick.addEventListener('click', (event) => {
        event.preventDefault();
        if (weekPickTrack && window.playSiteTrack) window.playSiteTrack(weekPickTrack);
    });
};

const loadAlbums = async (grid, query) => {
    showGridMessage(grid, '실제 앨범을 불러오는 중입니다.');
    try {
        const response = await fetch(albumSearchUrl(query));
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || '앨범 API 요청에 실패했습니다.');
        const albums = data.albums || [];
        if (!albums.length) {
            showGridMessage(grid, '검색된 앨범이 없습니다.');
            return [];
        }
        grid.replaceChildren(...albums.map(createAlbumCard));
        const section = grid.closest('.section');
        updateMoreButton(section);
        updateSliderControls(section);
        return albums;
    } catch (error) {
        showGridMessage(grid, error.message, true);
        return [];
    }
};

const initializeAlbumGrids = () => Promise.all(
    albumGrids.map(async (grid) => {
        if (grid.dataset.fixedLatest === 'true' && window.FlowbeeFixedCatalog) {
            showGridMessage(grid, '고정 최신 앨범을 불러오는 중...');
            const albums = await window.FlowbeeFixedCatalog.loadLatestAlbums();
            grid.replaceChildren(...albums.map(createAlbumCard));
            const section = grid.closest('.section');
            updateMoreButton(section);
            updateSliderControls(section);
            return albums;
        }
        return loadAlbums(grid, grid.dataset.query);
    }),
);

const searchAlbumsUrl = (query) => `/api/search?${new URLSearchParams({ q: query, type: 'album', source: 'itunes', limit: '50' })}`;
const searchTracksUrl = (query) => `/api/search?${new URLSearchParams({ q: query, type: 'track', source: 'all', limit: '50' })}`;

const matchesQuery = (query, ...fields) => {
    const q = query.trim().toLowerCase();
    return fields.some((field) => (field || '').toLowerCase().includes(q));
};

const clearSearch = () => {
    const results = document.getElementById('search-results');
    const input = document.querySelector('.search-box input');
    if (!results) return;
    results.hidden = true;
    if (input) input.value = '';
    [...document.querySelectorAll('.main-content > .section')].forEach((section) => {
        if (section.id !== 'search-results') section.hidden = false;
    });
};

const performSearch = async (query) => {
    const results = document.getElementById('search-results');
    const queryText = document.getElementById('search-query-text');
    const albumsGrid = document.getElementById('search-albums-grid');
    const tracksList = document.getElementById('search-tracks-list');
    if (!results || !albumsGrid || !tracksList) return;

    queryText.textContent = query;
    results.hidden = false;
    [...document.querySelectorAll('.main-content > .section')].forEach((section) => {
        if (section.id !== 'search-results') section.hidden = true;
    });

    showGridMessage(albumsGrid, '앨범을 검색하는 중입니다.');
    tracksList.innerHTML = '<p class="api-status">곡을 검색하는 중입니다.</p>';

    const [albumResult, trackResult] = await Promise.allSettled([
        fetch(searchAlbumsUrl(query)).then((r) => r.json()),
        fetch(searchTracksUrl(query)).then((r) => r.json()),
    ]);

    const albums = (albumResult.status === 'fulfilled' ? (albumResult.value.albums || []) : [])
        .filter((album) => matchesQuery(query, album.name, album.artist));
    const tracks = (trackResult.status === 'fulfilled' ? (trackResult.value.tracks || []) : [])
        .filter((track) => matchesQuery(query, track.title, track.artist, track.album ? track.album.name : ''));

    if (!albums.length) {
        showGridMessage(albumsGrid, '일치하는 앨범이 없어요.');
    } else {
        albumsGrid.replaceChildren(...albums.map(createAlbumCard));
    }
    updateMoreButton(results);
    updateSliderControls(results, albumsGrid);

    if (!tracks.length) {
        tracksList.innerHTML = '<p class="api-status">일치하는 곡이 없어요.</p>';
    } else if (window.renderChartRow) {
        tracksList.innerHTML = tracks.map((track, i) => window.renderChartRow(i + 1, track)).join('');
    }
};

const initializeSearch = () => {
    const input = document.querySelector('.search-box input');
    const clearBtn = document.getElementById('search-clear-btn');
    if (!input) return;
    input.addEventListener('keydown', async (event) => {
        if (event.key !== 'Enter') return;
        const query = input.value.trim();
        if (!query) { clearSearch(); return; }
        await performSearch(query);
    });
    if (clearBtn) clearBtn.addEventListener('click', clearSearch);
};

const getPlaylistCover = (playlistId) => fetch(`/api/playlists/${playlistId}`)
    .then((r) => r.json())
    .then((data) => {
        const first = (data.items || [])[0];
        return first ? first.track.thumbnailUrl : null;
    })
    .catch(() => null);

const createMyPlaylistCard = (playlist, coverUrl) => {
    const card = document.createElement('a');
    card.className = 'track-card';
    card.href = `/my-playlist/${playlist.id}`;

    const thumb = document.createElement('div');
    thumb.className = 'track-thumb';
    if (coverUrl) {
        thumb.style.backgroundImage = `url("${coverUrl.replaceAll('"', '%22')}")`;
        thumb.style.backgroundSize = 'cover';
        thumb.style.backgroundPosition = 'center';
    } else {
        thumb.style.background = 'linear-gradient(150deg,#8A6A3F,#4A3218)';
    }

    const name = document.createElement('div');
    name.className = 'track-name';
    name.textContent = playlist.name;

    const sub = document.createElement('div');
    sub.className = 'track-sub';
    sub.textContent = `플레이리스트 · ${playlist.totalTracks}곡`;

    card.append(thumb, name, sub);
    return card;
};

const loadMyPlaylists = async () => {
    const grid = document.getElementById('my-playlists-grid');
    if (!grid || !window.getCurrentUser) return;
    const me = await window.getCurrentUser();
    if (!me.loggedIn) {
        showGridMessage(grid, '로그인하면 나만의 플레이리스트를 만들고 곡을 담을 수 있어요.');
        return;
    }
    try {
        const response = await fetch('/api/playlists');
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || '플레이리스트를 불러오지 못했습니다.');
        const playlists = data.playlists || [];
        if (!playlists.length) {
            showGridMessage(grid, '아직 만든 플레이리스트가 없어요. 곡의 + 버튼으로 담아보세요.');
            return;
        }
        const covers = await Promise.all(playlists.map((p) => getPlaylistCover(p.id)));
        grid.replaceChildren(...playlists.map((p, i) => createMyPlaylistCard(p, covers[i])));
        updateMoreButton(grid.closest('.section'));
    } catch (error) {
        showGridMessage(grid, error.message, true);
    }
};

const sidebarEmptyNote = (text) => {
    const note = document.createElement('div');
    note.className = 'sidebar-empty-note';
    note.textContent = text;
    return note;
};

const sidebarThumb = (thumbnailUrl, fallbackGradient) => {
    const thumb = document.createElement('span');
    thumb.className = 'pl-thumb';
    if (thumbnailUrl) {
        thumb.style.backgroundImage = `url("${thumbnailUrl.replaceAll('"', '%22')}")`;
        thumb.style.backgroundSize = 'cover';
        thumb.style.backgroundPosition = 'center';
    } else {
        thumb.style.background = fallbackGradient;
    }
    return thumb;
};

const sidebarLabel = (text) => {
    const span = document.createElement('span');
    span.textContent = text;
    return span;
};

const createSidebarPlaylistItem = (playlist, coverUrl) => {
    const link = document.createElement('a');
    link.href = `/my-playlist/${playlist.id}`;
    link.className = 'sidebar-playlist-item';
    link.append(
        sidebarThumb(coverUrl, 'linear-gradient(150deg,#8A6A3F,#4A3218)'),
        sidebarLabel(`${playlist.name} · ${playlist.totalTracks}곡`),
    );
    return link;
};

const createSidebarAlbumItem = (like) => {
    const album = like.album;
    const link = document.createElement('a');
    link.href = `/album/${album.id}`;
    link.className = 'sidebar-playlist-item';
    link.append(sidebarThumb(album.thumbnailUrl, 'linear-gradient(135deg,#E8A33D,#8A5A2B)'), sidebarLabel(album.name));
    return link;
};

const RECOMMENDED_LIKES_KEY = 'flowbee_liked_recommended_playlists';
const getLikedRecommendedPlaylists = () => {
    try { return JSON.parse(localStorage.getItem(RECOMMENDED_LIKES_KEY) || '{}'); } catch { return {}; }
};

const createSidebarRecommendedPlaylistItem = (slug, info) => {
    const link = document.createElement('a');
    link.href = `/playlist/${slug}`;
    link.className = 'sidebar-playlist-item';
    link.append(sidebarThumb(info.coverUrl, 'linear-gradient(140deg,#F4B942,#C88A2E)'), sidebarLabel(info.title));
    return link;
};

const createSidebarLikedPlaylistItem = (like) => {
    const playlist = like.playlist;
    const link = document.createElement('a');
    link.href = `/my-playlist/${playlist.id}`;
    link.className = 'sidebar-playlist-item';
    link.append(sidebarThumb(null, 'linear-gradient(140deg,#F4B942,#C88A2E)'), sidebarLabel(playlist.name));
    return link;
};

const loadSidebarData = async () => {
    const myGrid = document.getElementById('sidebar-my-playlists');
    const likedAlbumsGrid = document.getElementById('sidebar-liked-albums');
    const likedPlaylistsGrid = document.getElementById('sidebar-liked-playlists');
    if (!myGrid || !window.getCurrentUser) return;
    const me = await window.getCurrentUser();
    if (!me.loggedIn) return;

    try {
        const [playlistsData, likesData] = await Promise.all([
            fetch('/api/playlists').then((r) => r.json()),
            fetch('/api/likes').then((r) => r.json()),
        ]);
        const playlists = playlistsData.playlists || [];
        const covers = await Promise.all(playlists.map((p) => getPlaylistCover(p.id)));
        myGrid.replaceChildren(...(playlists.length
            ? playlists.map((playlist, i) => createSidebarPlaylistItem(playlist, covers[i]))
            : [sidebarEmptyNote('아직 만든 플레이리스트가 없어요.')]));

        const likedAlbums = likesData.albums || [];
        likedAlbumsGrid.replaceChildren(...(likedAlbums.length ? likedAlbums.map(createSidebarAlbumItem) : [sidebarEmptyNote('좋아요 누른 앨범이 없어요.')]));

        const likedPlaylists = likesData.playlists || [];
        const recommendedLikes = getLikedRecommendedPlaylists();
        const likedPlaylistItems = [
            ...likedPlaylists.map(createSidebarLikedPlaylistItem),
            ...Object.entries(recommendedLikes).map(([slug, info]) => createSidebarRecommendedPlaylistItem(slug, info)),
        ];
        likedPlaylistsGrid.replaceChildren(...(likedPlaylistItems.length ? likedPlaylistItems : [sidebarEmptyNote('좋아요 누른 플레이리스트가 없어요.')]));
    } catch {
        // 실패하면 기본 목업을 그대로 둔다
    }
};

const initializeAuthUI = async () => {
    const authLink = document.getElementById('auth-link');
    if (!authLink || !window.getCurrentUser) return;
    const me = await window.getCurrentUser();
    if (!me.loggedIn) return;

    const avatar = document.querySelector('.topbar-right .avatar');
    if (avatar) {
        avatar.classList.add('avatar-lg');
        const nicknameEl = document.createElement('span');
        nicknameEl.className = 'auth-nickname';
        nicknameEl.textContent = me.nickname;
        avatar.append(nicknameEl);
    }

    authLink.textContent = '로그아웃';
    authLink.href = '#';
    authLink.classList.add('auth-link-loggedin');
    authLink.addEventListener('click', async (event) => {
        event.preventDefault();
        if (!confirm('로그아웃할까요?')) return;
        await fetch('/api/users/logout', { method: 'POST' });
        window.location.reload();
    });
};

const initializeMainPage = () => {
    if (window.initSitePlayer) window.initSitePlayer();
    initializeNowPlayingDrawer();
    initializeAuthUI();

    [...document.querySelectorAll('.section')]
        .filter((section) => !section.querySelector('[data-album-grid], [data-playlist-grid], [data-playlist-grid-fixed]'))
        .forEach(updateMoreButton);
    initializeSearch();
    initializeAlbumGrids();
    initializeWeekPickPlay();
    loadWeekPickTrack();
    loadMyPlaylists();
    loadSidebarData();
    loadRecommendedPlaylists();
    initializePlaylistReroll();
    loadFixedPlaylists();
};

if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', initializeMainPage, { once: true });
} else {
    initializeMainPage();
}
}());

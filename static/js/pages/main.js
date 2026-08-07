(function () {
const albumGrids = [...document.querySelectorAll('[data-album-grid]')];
const playlistGrid = document.querySelector('[data-playlist-grid]');

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
    subtitle.textContent = `Flowbee 추천 · ${playlist.tracks.length}곡`;
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

const updateSliderControls = (section) => {
    const grid = section.querySelector('[data-album-grid], [data-playlist-grid]');
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
    showGridMessage(playlistGrid, 'Flowbee 추천 플레이리스트를 만드는 중입니다.');
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

const initializeSearch = () => {
    const input = document.querySelector('.search-box input');
    if (!input || !albumGrids.length) return;
    input.addEventListener('keydown', async (event) => {
        if (event.key !== 'Enter') return;
        const query = input.value.trim();
        if (!query) return;
        const target = albumGrids[0];
        const title = target.closest('.section').querySelector('.section-title');
        title.childNodes[0].textContent = `'${query}' 앨범 검색 결과 `;
        await loadAlbums(target, query);
    });
};

const initializeAuthUI = async () => {
    const authLink = document.getElementById('auth-link');
    if (!authLink || !window.getCurrentUser) return;
    const me = await window.getCurrentUser();
    if (!me.loggedIn) return;
    const nicknameEl = document.createElement('span');
    nicknameEl.className = 'auth-nickname';
    nicknameEl.textContent = `${me.nickname}님`;
    authLink.insertAdjacentElement('beforebegin', nicknameEl);
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
        .filter((section) => !section.querySelector('[data-album-grid], [data-playlist-grid]'))
        .forEach(updateMoreButton);
    initializeSearch();
    initializeAlbumGrids();
    initializeWeekPickPlay();
    loadWeekPickTrack();
    loadRecommendedPlaylists();
    initializePlaylistReroll();
};

if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', initializeMainPage, { once: true });
} else {
    initializeMainPage();
}
}());

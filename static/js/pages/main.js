(function () {
// 본문은 탭을 옮길 때마다 통째로 갈아끼워진다. 그때 다시 찾아야 하므로 let 이다.
let albumGrids = [];
let playlistGrid = null;
let playlistFixedGrid = null;

const albumSearchUrl = (query, limit = 10) => {
    const params = new URLSearchParams({
        q: query,
        type: 'album',
        source: 'itunes',
        limit: String(limit),
    });
    return `${CATALOG_API}/api/search?${params}`;
};

const createAlbumCard = (album) => {
    const card = document.createElement('a');
    card.className = 'track-card';
    card.href = `/album/${album.id}`;

    const cover = document.createElement('div');
    cover.className = 'track-thumb album-thumb';
    if (album.thumbnailUrl) cover.style.backgroundImage = `url("${window.artwork(album.thumbnailUrl, 300).replaceAll('"', '%22')}")`;

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
    if (playlist.coverUrl) cover.style.backgroundImage = `url("${window.artwork(playlist.coverUrl, 300).replaceAll('"', '%22')}")`;
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

// 최근 재생 카드는 앨범 카드처럼 링크가 아니라 그 자리에서 곡을 다시 튼다.
const createRecentPlayCard = (track) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'track-card recent-play-card';

    const cover = document.createElement('div');
    cover.className = 'track-thumb album-thumb';
    if (track.thumbnailUrl) cover.style.backgroundImage = `url("${window.artwork(track.thumbnailUrl, 300).replaceAll('"', '%22')}")`;

    const title = document.createElement('div');
    title.className = 'track-name';
    title.textContent = track.title;

    const subtitle = document.createElement('div');
    subtitle.className = 'track-sub';
    subtitle.textContent = track.artist;

    card.append(cover, title, subtitle);
    card.addEventListener('click', () => window.playSiteTrack?.(track));
    return card;
};

// 곡을 연달아 누르면 응답이 뒤바뀐 순서로 올 수 있다. 마지막 호출만 그린다.
let recentPlaysRequest = 0;

const loadRecentPlays = async () => {
    const grid = document.getElementById('recent-plays-grid');
    if (!grid || !window.getCurrentUser) return;
    const mine = ++recentPlaysRequest;
    const me = await window.getCurrentUser();
    if (!me.loggedIn) {
        showGridMessage(grid, '로그인하면 최근 들은 곡이 여기에 쌓여요.');
        return;
    }
    try {
        const response = await fetch('/api/plays');
        const data = await response.json().catch(() => ({}));
        if (mine !== recentPlaysRequest) return;
        if (!response.ok) throw new Error(data.error || '최근 재생을 불러오지 못했습니다.');
        const tracks = data.tracks || [];
        if (!tracks.length) {
            showGridMessage(grid, '아직 재생한 곡이 없어요. 아무 곡이나 틀어보세요.');
            return;
        }
        grid.replaceChildren(...tracks.map(createRecentPlayCard));
        updateMoreButton(grid.closest('.section'));
    } catch (error) {
        showGridMessage(grid, error.message, true);
    }
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

// 사이드바/토프바/탭은 templates/components/ 에서 통째로 공유한다. 페이지마다 달라지는
// 부분은 여기서 켠다 - 마크업을 7벌로 복사하지 않기 위한 대가다.
// 탭 줄은 이동할 때마다 새로 오고 검색창은 살아남는다. 둘 다 지금 경로에 맞춰 다시 칠한다.
// 검색창 안내문은 페이지마다 다르므로, data-search 가 없는 홈에서는 기본값으로 되돌려야 한다.
// 기본값은 topbar.html 의 placeholder 하나뿐이다. 덮어쓰기 전에 한 번 챙겨 둔다.
const applyRouteChrome = () => {
    const path = location.pathname.replace(/\/$/, '') || '/';
    document.querySelector(`.content-tab[href="${path}"]`)?.classList.add('active');
    const input = document.querySelector('.search-box input');
    if (!input) return;
    input.dataset.defaultPlaceholder ??= input.placeholder;
    input.placeholder = document.querySelector('.app-shell')?.dataset.search || input.dataset.defaultPlaceholder;
};

// 좁은 화면에서 사이드바는 오버레이다. 햄버거로 열고, 바깥/링크/ESC 로 닫는다.
const initializeSidebarToggle = () => {
    const toggle = document.getElementById('sidebar-toggle');
    const sidebar = document.querySelector('.sidebar');
    if (!toggle || !sidebar) return;
    const setOpen = (open) => {
        document.body.classList.toggle('sidebar-open', open);
        toggle.setAttribute('aria-expanded', String(open));
    };
    toggle.addEventListener('click', () => setOpen(!document.body.classList.contains('sidebar-open')));
    document.addEventListener('click', (event) => {
        if (!document.body.classList.contains('sidebar-open')) return;
        if (event.target === toggle || toggle.contains(event.target)) return;
        // 사이드바 안이라도 링크를 눌렀으면 이동하면서 닫는다
        if (sidebar.contains(event.target) && !event.target.closest('a')) return;
        setOpen(false);
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') setOpen(false);
    });
};

const loadAlbums = async (grid, url) => {
    showGridMessage(grid, '실제 앨범을 불러오는 중입니다.');
    try {
        const response = await fetch(url);
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

// 어느 줄이든 응답은 { albums } 하나로 같다. 다른 건 어디서 받아오냐뿐이다.
const albumGridUrl = (grid) => {
    const limit = grid.dataset.limit || '10';
    if ('topAlbums' in grid.dataset) return `${CATALOG_API}/api/albums/top?limit=${limit}`;
    // 검색 씨앗의 기본값은 서버가 쥔다. 화면이 굳이 다른 걸 원할 때만 data-query 로 덮는다.
    if ('latest' in grid.dataset) {
        const params = new URLSearchParams({ limit });
        if (grid.dataset.query) params.set('q', grid.dataset.query);
        return `${CATALOG_API}/api/albums/latest?${params}`;
    }
    return albumSearchUrl(grid.dataset.query, limit);
};

const initializeAlbumGrids = () => Promise.all(
    albumGrids.map((grid) => loadAlbums(grid, albumGridUrl(grid))),
);

const searchAlbumsUrl = (query) => `${CATALOG_API}/api/search?${new URLSearchParams({ q: query, type: 'album', source: 'itunes', limit: '50' })}`;
const searchTracksUrl = (query) => `${CATALOG_API}/api/search?${new URLSearchParams({ q: query, type: 'track', source: 'all', limit: '50' })}`;

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

// 검색창은 탑바에 있어서 살아남는다 - 한 번만 붙인다.
const initializeSearch = () => {
    const input = document.querySelector('.search-box input');
    if (!input) return;
    input.addEventListener('keydown', async (event) => {
        if (event.key !== 'Enter') return;
        const query = input.value.trim();
        if (!query) { clearSearch(); return; }
        await performSearch(query);
    });
};

// 검색 지우기 버튼은 본문 안에 있다 - 본문이 바뀔 때마다 다시 붙인다.
const bindSearchClear = () => {
    document.getElementById('search-clear-btn')?.addEventListener('click', clearSearch);
};

// 내 플레이리스트 목록은 카드 그리드와 사이드바가 같이 쓴다. 한 번만 부른다.
// 표지(coverUrl)는 목록 응답에 이미 들어 있다 - 플레이리스트마다 상세를 또 부르지 않는다.
let myPlaylistsPromise = null;
const getMyPlaylists = () => {
    if (!myPlaylistsPromise) {
        myPlaylistsPromise = fetch('/api/playlists').then(async (response) => {
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error || '플레이리스트를 불러오지 못했습니다.');
            return data.playlists || [];
        });
    }
    return myPlaylistsPromise;
};

const createMyPlaylistCard = (playlist) => {
    const card = document.createElement('a');
    card.className = 'track-card';
    card.href = `/my-playlist/${playlist.id}`;

    const thumb = document.createElement('div');
    thumb.className = 'track-thumb';
    if (playlist.coverUrl) {
        thumb.style.backgroundImage = `url("${window.artwork(playlist.coverUrl, 300).replaceAll('"', '%22')}")`;
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
        const playlists = await getMyPlaylists();
        if (!playlists.length) {
            showGridMessage(grid, '아직 만든 플레이리스트가 없어요. 곡의 + 버튼으로 담아보세요.');
            return;
        }
        grid.replaceChildren(...playlists.map(createMyPlaylistCard));
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
        // 사이드바 썸네일은 28px. iTunes 원본 크기(100)면 레티나에서도 충분하다.
        thumb.style.backgroundImage = `url("${window.artwork(thumbnailUrl, 100).replaceAll('"', '%22')}")`;
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

const createSidebarPlaylistItem = (playlist) => {
    const link = document.createElement('a');
    link.href = `/my-playlist/${playlist.id}`;
    link.className = 'sidebar-playlist-item';
    link.dataset.kind = 'mine';
    link.append(
        sidebarThumb(playlist.coverUrl, 'linear-gradient(150deg,#8A6A3F,#4A3218)'),
        sidebarLabel(`${playlist.name} · ${playlist.totalTracks}곡`),
    );
    return link;
};

const createSidebarAlbumItem = (like) => {
    const album = like.album;
    const link = document.createElement('a');
    link.href = `/album/${album.id}`;
    link.className = 'sidebar-playlist-item';
    link.dataset.kind = 'album';
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
    link.dataset.kind = 'playlist';
    link.append(sidebarThumb(info.coverUrl, 'linear-gradient(140deg,#F4B942,#C88A2E)'), sidebarLabel(info.title));
    return link;
};

const createSidebarLikedPlaylistItem = (like) => {
    const playlist = like.playlist;
    const link = document.createElement('a');
    link.href = `/my-playlist/${playlist.id}`;
    link.className = 'sidebar-playlist-item';
    link.dataset.kind = 'playlist';
    link.append(sidebarThumb(null, 'linear-gradient(140deg,#F4B942,#C88A2E)'), sidebarLabel(playlist.name));
    return link;
};

// 태그 하나가 선택된 상태를 유지한다. 목록은 한 벌만 그리고 태그로 걸러 보여준다.
const applySidebarFilter = (kind) => {
    const library = document.getElementById('sidebar-library');
    if (!library) return;
    library.querySelectorAll('.sidebar-playlist-item').forEach((item) => {
        item.hidden = kind !== 'all' && item.dataset.kind !== kind;
    });
};

// 선택 없음이 기본값(전체). 태그를 다시 누르거나 X 를 누르면 다시 전체로 돌아간다.
const selectSidebarTag = (tags, tag) => {
    tags.querySelectorAll('.sidebar-tag').forEach((el) => el.classList.toggle('active', el === tag));
    document.getElementById('sidebar-tag-clear').hidden = !tag;
    applySidebarFilter(tag ? tag.dataset.kind : 'all');
};

const initializeSidebarTags = () => {
    const tags = document.getElementById('sidebar-tags');
    // 세로 휠은 가로 오버플로를 안 움직인다 - 직접 넘겨준다.
    const scroller = tags?.querySelector('.sidebar-tag-scroll');
    if (!tags || !scroller) return;
    scroller.addEventListener('wheel', (event) => {
        if (event.deltaY === 0 || scroller.scrollWidth <= scroller.clientWidth) return;
        event.preventDefault();
        scroller.scrollLeft += event.deltaY;
    }, { passive: false });

    // 좌클릭 드래그로도 가로 스크롤한다. pointer capture 를 쓰면 click 대상이 바뀌어
    // 태그 선택이 깨지므로 window 에 붙인다.
    let dragged = false;
    scroller.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        const startX = event.clientX;
        const startScroll = scroller.scrollLeft;
        dragged = false;
        const onMove = (moveEvent) => {
            const dx = moveEvent.clientX - startX;
            if (Math.abs(dx) > 4) dragged = true;
            scroller.scrollLeft = startScroll - dx;
        };
        const onUp = () => {
            scroller.classList.remove('is-dragging');
            window.removeEventListener('pointermove', onMove);
        };
        scroller.classList.add('is-dragging');
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp, { once: true });
        window.addEventListener('pointercancel', onUp, { once: true });
    });

    // 화살표는 그쪽으로 더 갈 수 있을 때만 보인다.
    const arrows = [...tags.querySelectorAll('.sidebar-tag-arrow')];
    const syncArrows = () => {
        const max = scroller.scrollWidth - scroller.clientWidth;
        arrows.forEach((arrow) => {
            arrow.hidden = Number(arrow.dataset.dir) < 0
                ? scroller.scrollLeft <= 1
                : scroller.scrollLeft >= max - 1;
        });
    };
    scroller.addEventListener('scroll', syncArrows);
    scroller.addEventListener('scrollend', syncArrows); // 부드러운 스크롤은 마지막 위치를 scroll 로 안 알려줄 때가 있다
    window.addEventListener('resize', syncArrows);
    syncArrows();

    tags.addEventListener('click', (event) => {
        if (dragged) { dragged = false; return; }
        const arrow = event.target.closest('.sidebar-tag-arrow');
        if (arrow) {
            scroller.scrollBy({ left: Number(arrow.dataset.dir) * scroller.clientWidth * 0.7, behavior: 'smooth' });
            return;
        }
        if (event.target.closest('.sidebar-tag-clear')) return selectSidebarTag(tags, null);
        const tag = event.target.closest('.sidebar-tag');
        if (tag) selectSidebarTag(tags, tag.classList.contains('active') ? null : tag);
    });
};

const activeSidebarFilter = () => document.querySelector('.sidebar-tag.active')?.dataset.kind || 'all';

const loadSidebarData = async () => {
    const library = document.getElementById('sidebar-library');
    if (!library || !window.getCurrentUser) return;
    const me = await window.getCurrentUser();
    if (!me.loggedIn) return;

    try {
        const [playlists, likesData] = await Promise.all([
            getMyPlaylists(),
            fetch('/api/likes').then((r) => r.json()),
        ]);
        const recommendedLikes = getLikedRecommendedPlaylists();
        const items = [
            ...playlists.map(createSidebarPlaylistItem),
            ...(likesData.albums || []).map(createSidebarAlbumItem),
            ...(likesData.playlists || []).map(createSidebarLikedPlaylistItem),
            ...Object.entries(recommendedLikes).map(([slug, info]) => createSidebarRecommendedPlaylistItem(slug, info)),
        ];
        library.replaceChildren(...(items.length ? items : [sidebarEmptyNote('아직 담아둔 항목이 없어요.')]));
        applySidebarFilter(activeSidebarFilter());
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

// 플레이리스트를 만들거나 곡을 담은 뒤 api.js 가 부른다. getMyPlaylists 의 promise 캐시는
// 여기서만 비울 수 있고, 사이드바는 이제 탭을 옮겨도 안 다시 그려지므로 여기가 유일한 갱신 통로다.
// 곡을 틀면 api.js 가 기록을 끝낸 뒤 이걸 부른다. 새로고침 없이 순서가 갱신된다.
window.refreshRecentPlays = () => loadRecentPlays();

window.refreshMyPlaylists = () => {
    myPlaylistsPromise = null;
    loadMyPlaylists();
    loadSidebarData();
};

// 사이드바/탑바/플레이어는 탭을 옮겨도 그대로 남는다. 여기 있는 것들은 화면당 한 번만 돈다.
const initializeShell = () => {
    if (window.initSitePlayer) window.initSitePlayer();
    initializeSidebarToggle();
    initializeSidebarTags();
    initializeAuthUI();
    initializeSearch();
    loadSidebarData();
};

// 탭 줄과 본문은 이동할 때마다 새 것으로 갈린다. api.js 가 갈아끼운 뒤 이걸 부른다.
const initializeMainContent = () => {
    albumGrids = [...document.querySelectorAll('[data-album-grid]')];
    playlistGrid = document.querySelector('[data-playlist-grid]');
    playlistFixedGrid = document.querySelector('[data-playlist-grid-fixed]');

    applyRouteChrome();
    bindSearchClear();
    [...document.querySelectorAll('.section')]
        .filter((section) => !section.querySelector('[data-album-grid], [data-playlist-grid], [data-playlist-grid-fixed]'))
        .forEach(updateMoreButton);
    initializeAlbumGrids();
    loadRecentPlays();
    loadMyPlaylists();
    loadRecommendedPlaylists();
    initializePlaylistReroll();
    loadFixedPlaylists();
};
window.initializeMainContent = initializeMainContent;

const initializeMainPage = () => {
    initializeShell();
    initializeMainContent();
};

if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', initializeMainPage, { once: true });
} else {
    initializeMainPage();
}
}());

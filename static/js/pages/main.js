const albumGrids = [...document.querySelectorAll('[data-album-grid]')];

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
    const grid = section.querySelector('[data-album-grid]');
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
    controls.innerHTML = '<button type="button" aria-label="이전 앨범">‹</button><button type="button" aria-label="다음 앨범">›</button>';
    const [previous, next] = controls.querySelectorAll('button');
    const move = (direction) => grid.scrollBy({ left: grid.clientWidth * .88 * direction, behavior: 'smooth' });
    previous.addEventListener('click', () => move(-1));
    next.addEventListener('click', () => move(1));
    head.append(controls);
};

const updateWeekPick = (album) => {
    const pick = document.querySelector('.week-pick');
    if (!pick || !album) return;
    pick.href = `/album/${album.id}`;
    const name = pick.querySelector('strong');
    if (name) name.textContent = album.name;
};

const loadAlbums = async (grid, query, updatePick = false) => {
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
        if (updatePick) updateWeekPick(albums[0]);
        return albums;
    } catch (error) {
        showGridMessage(grid, error.message, true);
        return [];
    }
};

const initializeAlbumGrids = () => Promise.all(
    albumGrids.map((grid, index) => loadAlbums(grid, grid.dataset.query, index === 0)),
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
        await loadAlbums(target, query, true);
    });
};

const initializeMainPage = () => {
    const playBtn = document.getElementById('play-btn');
    if (playBtn) {
        const playIcon = playBtn.querySelector('span');
        playBtn.addEventListener('click', () => {
            const playing = playIcon.textContent === '⏸';
            playIcon.textContent = playing ? '▶' : '⏸';
        });
    }

    [...document.querySelectorAll('.section')]
        .filter((section) => !section.querySelector('[data-album-grid]'))
        .forEach(updateMoreButton);
    initializeSearch();
    initializeAlbumGrids();
};

if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', initializeMainPage, { once: true });
} else {
    initializeMainPage();
}

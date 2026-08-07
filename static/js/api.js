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
    const albumText = genreLabel || (typeof track.album === 'string' ? track.album : (track.album?.name || (track.source === 'youtube' ? 'YouTube' : '')));
    const title = escapeHtml(track.title);
    const artist = escapeHtml(track.artist);
    const thumb = escapeHtml(track.thumbnailUrl || '');
    const playUrl = escapeHtml(track.playUrl || '');
    const source = escapeHtml(track.source || '');
    return `<div class="chart-row" data-id="${track.id}" data-title="${title}" data-artist="${artist}" data-thumb="${thumb}" data-play-url="${playUrl}" data-source="${source}">
        <span class="chart-rank">${rank}</span>
        <img class="chart-thumb" src="${thumb}" alt="">
        <div class="chart-meta"><b>${title}</b><small>${artist}</small></div>
        <span class="chart-album">${escapeHtml(albumText)}</span>
        <button class="chart-play" type="button" aria-label="재생">▷</button>
        <button class="chart-add" type="button" aria-label="플레이리스트에 담기">+</button>
    </div>`;
}

function renderAlbumCard(album) {
    return `<a class="track-card" href="/album/${album.id}">
        <div class="track-thumb" style="background-image:url('${escapeHtml(album.thumbnailUrl || '')}');background-size:cover;background-position:center;"></div>
        <div class="track-name">${escapeHtml(album.name)}</div>
        <div class="track-sub">${escapeHtml(album.artist)}</div>
    </a>`;
}

function renderApiStatus(container, message) {
    container.innerHTML = `<p class="api-status">${escapeHtml(message)}</p>`;
}

function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
}

function getSiteAudio() {
    let audio = document.getElementById('site-audio');
    if (!audio) {
        audio = document.createElement('audio');
        audio.id = 'site-audio';
        audio.preload = 'none';
        document.body.appendChild(audio);
    }
    return audio;
}

function ensureSiteNowPlayingDrawer() {
    let drawer = document.getElementById('now-playing-drawer');
    if (!document.querySelector('link[href="/css/components/now-playing-drawer.css"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = '/css/components/now-playing-drawer.css';
        document.head.appendChild(link);
    }
    if (!drawer) {
        drawer = document.createElement('aside');
        drawer.className = 'now-playing-drawer is-collapsed';
        drawer.id = 'now-playing-drawer';
        drawer.innerHTML = '<button class="drawer-toggle" id="drawer-toggle" type="button" aria-label="현재 재생 패널 열기">‹</button><div class="drawer-content"><p class="drawer-label">NOW PLAYING · 30초 미리듣기</p><div class="drawer-empty-cover" id="drawer-empty-cover" aria-hidden="true">♪</div><img class="drawer-cover" id="drawer-cover" alt="" hidden><h2 class="drawer-title" id="drawer-title">재생 중인 곡이 없습니다</h2><p class="drawer-artist" id="drawer-artist">곡을 선택해 주세요.</p><div class="drawer-preview">Flowbee는 iTunes에서 제공하는 30초 미리듣기를 재생합니다.</div><h3 class="drawer-queue-title">다음 재생 목록</h3><div class="drawer-queue" id="drawer-queue"></div></div>';
        document.body.insertBefore(drawer, document.querySelector('.player-bar'));
    }
    // 앨범/플레이리스트 상세 화면은 각 페이지 재생기가 토글을 직접 관리한다.
    if (document.getElementById('album-page') || document.getElementById('playlist-page')) return drawer;
    const toggle = drawer.querySelector('#drawer-toggle');
    if (toggle && toggle.dataset.initialized !== 'true') {
        toggle.dataset.initialized = 'true';
        toggle.addEventListener('click', () => {
            const collapsed = drawer.classList.toggle('is-collapsed');
            toggle.textContent = collapsed ? '‹' : '›';
            toggle.setAttribute('aria-label', collapsed ? '현재 재생 패널 열기' : '현재 재생 패널 닫기');
        });
    }
    return drawer;
}

function extractYouTubeId(embedUrl) {
    try {
        return new URL(embedUrl).pathname.split('/').filter(Boolean).pop() || null;
    } catch {
        return null;
    }
}

let activePlayMode = 'audio'; // 'audio' | 'youtube'
let ytPlayer = null;
let ytReadyPromise = null;
let ytProgressTimer = null;
let sitePlayerUI = null;

function loadYouTubeApi() {
    if (ytReadyPromise) return ytReadyPromise;
    ytReadyPromise = new Promise((resolve) => {
        if (window.YT && window.YT.Player) { resolve(); return; }
        const previous = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = () => {
            if (previous) previous();
            resolve();
        };
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
    });
    return ytReadyPromise;
}

function getYtHost() {
    let host = document.getElementById('site-yt-host');
    if (!host) {
        host = document.createElement('div');
        host.id = 'site-yt-host';
        host.style.cssText = 'position:fixed; width:1px; height:1px; overflow:hidden; opacity:0; pointer-events:none; left:-9999px; top:-9999px;';
        document.body.appendChild(host);
    }
    return host;
}

async function getYtPlayer() {
    await loadYouTubeApi();
    if (ytPlayer) return ytPlayer;
    const host = getYtHost();
    ytPlayer = await new Promise((resolve) => {
        const player = new window.YT.Player(host, {
            height: '1',
            width: '1',
            playerVars: { autoplay: 0, controls: 0, disablekb: 1 },
            events: {
                onReady: () => resolve(player),
                onStateChange: handleYtStateChange,
            },
        });
    });
    return ytPlayer;
}

function stopYtProgressPolling() {
    if (ytProgressTimer) clearInterval(ytProgressTimer);
    ytProgressTimer = null;
}

function startYtProgressPolling() {
    stopYtProgressPolling();
    ytProgressTimer = setInterval(() => {
        if (!ytPlayer || typeof ytPlayer.getDuration !== 'function') return;
        const duration = ytPlayer.getDuration();
        if (!duration) return;
        updatePlayerProgress(ytPlayer.getCurrentTime(), duration);
    }, 500);
}

function handleYtStateChange(event) {
    if (activePlayMode !== 'youtube' || !sitePlayerUI) return;
    if (event.data === window.YT.PlayerState.PLAYING) {
        sitePlayerUI.setIcon(true);
        startYtProgressPolling();
    } else if (event.data === window.YT.PlayerState.PAUSED || event.data === window.YT.PlayerState.ENDED) {
        sitePlayerUI.setIcon(false);
        stopYtProgressPolling();
    }
}

function updatePlayerProgress(current, duration) {
    if (!sitePlayerUI || !duration) return;
    const { progressFill, timeEls } = sitePlayerUI;
    if (progressFill) progressFill.style.width = `${(current / duration) * 100}%`;
    if (timeEls[0]) timeEls[0].textContent = formatTime(current);
    if (timeEls[1]) timeEls[1].textContent = formatTime(duration);
}

const NOW_PLAYING_KEY = 'flowbee_now_playing';
const NOW_PLAYING_HANDOFF_MAX_AGE_MS = 8000;

function saveNowPlaying(track, currentTime, isPlaying) {
    try {
        localStorage.setItem(NOW_PLAYING_KEY, JSON.stringify({
            title: track.title,
            artist: track.artist,
            thumbnailUrl: track.thumbnailUrl,
            playUrl: track.playUrl,
            source: track.source,
            currentTime: currentTime || 0,
            isPlaying: !!isPlaying,
            ts: Date.now(),
        }));
    } catch {
        // localStorage 를 못 쓰면 이어재생은 그냥 포기한다
    }
}

function clearNowPlaying() {
    try {
        localStorage.removeItem(NOW_PLAYING_KEY);
    } catch {
        // no-op
    }
}

function loadNowPlayingHandoff() {
    try {
        const raw = localStorage.getItem(NOW_PLAYING_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        if (Date.now() - data.ts > NOW_PLAYING_HANDOFF_MAX_AGE_MS) return null;
        return data;
    } catch {
        return null;
    }
}

function initSitePlayer() {
    ensureSiteNowPlayingDrawer();
    const audio = getSiteAudio();
    if (sitePlayerUI) return audio;

    const playBtn = document.getElementById('play-btn');
    const playIcon = playBtn ? playBtn.querySelector('span') : null;
    const progressFill = document.querySelector('.player-controls .progress-track .progress-fill');
    const timeEls = document.querySelectorAll('.player-controls .time');
    const setIcon = (playing) => { if (playIcon) playIcon.textContent = playing ? '⏸' : '▶'; };
    sitePlayerUI = { progressFill, timeEls, setIcon };

    if (playBtn) {
        playBtn.addEventListener('click', () => {
            if (activePlayMode === 'youtube' && ytPlayer) {
                const playing = ytPlayer.getPlayerState() === window.YT.PlayerState.PLAYING;
                if (playing) ytPlayer.pauseVideo();
                else ytPlayer.playVideo();
                return;
            }
            if (!audio.src) return;
            if (audio.paused) audio.play().catch(() => {});
            else audio.pause();
        });
    }
    audio.addEventListener('play', () => {
        if (activePlayMode !== 'audio') return;
        setIcon(true);
        if (currentTrack) saveNowPlaying(currentTrack, audio.currentTime, true);
    });
    audio.addEventListener('pause', () => {
        if (activePlayMode !== 'audio') return;
        setIcon(false);
        if (currentTrack) saveNowPlaying(currentTrack, audio.currentTime, false);
    });
    audio.addEventListener('ended', () => {
        if (activePlayMode !== 'audio') return;
        setIcon(false);
        clearNowPlaying();
    });
    audio.addEventListener('timeupdate', () => {
        if (activePlayMode !== 'audio' || !Number.isFinite(audio.duration) || !audio.duration) return;
        updatePlayerProgress(audio.currentTime, audio.duration);
        if (currentTrack && !audio.paused) saveNowPlaying(currentTrack, audio.currentTime, true);
    });

    const volumeSlider = document.querySelector('.player-volume .volume-slider');
    if (volumeSlider) {
        audio.volume = Number(volumeSlider.value);
        volumeSlider.style.setProperty('--progress', `${audio.volume * 100}%`);
        volumeSlider.addEventListener('input', () => {
            const value = Number(volumeSlider.value);
            audio.volume = value;
            if (ytPlayer && typeof ytPlayer.setVolume === 'function') ytPlayer.setVolume(value * 100);
            volumeSlider.style.setProperty('--progress', `${value * 100}%`);
        });
    }
    resumeHandoffPlayback();
    return audio;
}

const persistentPageRoutes = new Set(['/', '/latest-music', '/latest-albums', '/genre', '/chart', '/playlists', '/events']);
const dynamicPageScripts = new Set(['/latest-music', '/latest-albums', '/genre', '/chart']);

function loadPageScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = `${src}?spa=${Date.now()}`;
        script.onload = resolve;
        script.onerror = reject;
        document.body.appendChild(script);
    });
}

async function navigateWithoutStoppingPlayback(path, pushHistory = true) {
    const response = await fetch(path);
    if (!response.ok) throw new Error('화면을 불러오지 못했습니다.');
    const nextDocument = new DOMParser().parseFromString(await response.text(), 'text/html');
    const nextShell = nextDocument.querySelector('.app-shell');
    const currentShell = document.querySelector('.app-shell');
    if (!nextShell || !currentShell) throw new Error('화면 영역을 찾지 못했습니다.');

    nextDocument.querySelectorAll('link[rel="stylesheet"]').forEach((stylesheet) => {
        const href = stylesheet.getAttribute('href');
        if (!href || document.querySelector(`link[href="${href}"]`)) return;
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        document.head.appendChild(link);
    });
    currentShell.replaceWith(nextShell);
    document.title = nextDocument.title;
    ensureSiteNowPlayingDrawer().classList.add('is-collapsed');
    const toggle = document.getElementById('drawer-toggle');
    if (toggle) {
        toggle.textContent = '‹';
        toggle.setAttribute('aria-label', '현재 재생 패널 열기');
    }
    if (pushHistory) history.pushState({ flowbeePersistentPage: true }, '', path);

    if (path === '/') {
        await loadPageScript('/js/recommended-playlists.js');
        await loadPageScript('/js/fixed-catalog.js');
        await loadPageScript('/js/pages/main.js');
    } else {
        await loadPageScript('/js/pages/main.js');
        if (path === '/latest-music' || path === '/latest-albums' || path === '/chart') {
            await loadPageScript('/js/fixed-catalog.js');
        }
        if (dynamicPageScripts.has(path)) {
            const pageName = path.slice(1);
            await loadPageScript(`/js/pages/${pageName}.js`);
        }
    }
}

function initializePersistentNavigation() {
    if (document.documentElement.dataset.persistentNavigation === 'true') return;
    document.documentElement.dataset.persistentNavigation = 'true';
    document.addEventListener('click', (event) => {
        const link = event.target.closest('a[href]');
        if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const url = new URL(link.href, location.href);
        const path = url.pathname.replace(/\/$/, '') || '/';
        if (url.origin !== location.origin || !persistentPageRoutes.has(path)) return;
        event.preventDefault();
        navigateWithoutStoppingPlayback(path).catch(() => { location.href = path; });
    });
    window.addEventListener('popstate', () => {
        const path = location.pathname.replace(/\/$/, '') || '/';
        if (persistentPageRoutes.has(path)) navigateWithoutStoppingPlayback(path, false).catch(() => location.reload());
    });
}

async function playSiteTrack(track) {
    if (!track) return;
    currentTrack = track;
    const nameEl = document.querySelector('.player-now-playing .track-name');
    const subEl = document.querySelector('.player-now-playing .track-sub');
    const thumbEl = document.querySelector('.player-now-playing .track-thumb');
    if (nameEl) nameEl.textContent = track.title;
    if (subEl) subEl.textContent = track.artist;
    if (thumbEl && track.thumbnailUrl) {
        thumbEl.style.backgroundImage = `url('${track.thumbnailUrl.replace(/'/g, '%27')}')`;
        thumbEl.style.backgroundSize = 'cover';
        thumbEl.style.backgroundPosition = 'center';
    }

    const drawer = document.getElementById('now-playing-drawer');
    const drawerCover = document.getElementById('drawer-cover');
    const drawerEmptyCover = document.getElementById('drawer-empty-cover');
    const drawerTitle = document.getElementById('drawer-title');
    const drawerArtist = document.getElementById('drawer-artist');
    if (drawerTitle) drawerTitle.textContent = track.title;
    if (drawerArtist) drawerArtist.textContent = track.artist;
    if (drawerCover && track.thumbnailUrl) {
        drawerCover.src = track.thumbnailUrl;
        drawerCover.alt = `${track.title} 앨범 표지`;
        drawerCover.hidden = false;
        drawerCover.style.display = 'block';
        if (drawerEmptyCover) {
            drawerEmptyCover.hidden = true;
            drawerEmptyCover.style.display = 'none';
        }
    }
    const audio = initSitePlayer();

    if (track.source === 'youtube') {
        const videoId = extractYouTubeId(track.playUrl);
        if (!videoId) {
            if (subEl) subEl.textContent = `${track.artist} · 재생할 수 없어요`;
            return;
        }
        audio.pause();
        stopYtProgressPolling();
        activePlayMode = 'youtube';
        const player = await getYtPlayer();
        const volumeSlider = document.querySelector('.player-volume .volume-slider');
        if (volumeSlider) player.setVolume(Number(volumeSlider.value) * 100);
        player.loadVideoById(videoId, startAt || 0);
        player.playVideo();
        return;
    }

    if (ytPlayer) ytPlayer.pauseVideo();
    stopYtProgressPolling();
    activePlayMode = 'audio';
    audio.src = track.playUrl;
    if (startAt) {
        audio.addEventListener('loadedmetadata', () => { audio.currentTime = startAt; }, { once: true });
    }
    audio.play().catch(() => {});
}

function resumeHandoffPlayback() {
    const handoff = loadNowPlayingHandoff();
    if (!handoff || !handoff.isPlaying) return;
    playSiteTrack({
        title: handoff.title,
        artist: handoff.artist,
        thumbnailUrl: handoff.thumbnailUrl,
        playUrl: handoff.playUrl,
        source: handoff.source,
    }, handoff.currentTime);
}

let currentUserPromise = null;

function getCurrentUser(force = false) {
    if (!currentUserPromise || force) {
        currentUserPromise = fetch('/api/users/me').then((r) => r.json()).catch(() => ({ loggedIn: false }));
    }
    return currentUserPromise;
}

let playlistPicker = null;

function closePlaylistPicker() {
    if (playlistPicker) {
        playlistPicker.remove();
        playlistPicker = null;
    }
    document.removeEventListener('click', handlePlaylistPickerOutsideClick, true);
}

function handlePlaylistPickerOutsideClick(event) {
    if (playlistPicker && !playlistPicker.contains(event.target)) closePlaylistPicker();
}

async function addTrackToPlaylist(playlistId, track, button) {
    try {
        const res = await fetch(`/api/playlists/${playlistId}/tracks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ trackId: Number(track.id) }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || '담기에 실패했어요.');
        button.classList.add('added');
        button.textContent = '✓';
        button.setAttribute('aria-label', '플레이리스트에 담김');
        setTimeout(() => {
            button.classList.remove('added');
            button.textContent = '+';
            button.setAttribute('aria-label', '플레이리스트에 담기');
        }, 2000);
    } catch (err) {
        alert(err.message || '담기에 실패했어요.');
    } finally {
        closePlaylistPicker();
    }
}

async function createPlaylistAndAdd(track, button) {
    const name = prompt('새 플레이리스트 이름을 입력하세요');
    if (!name || !name.trim()) return;
    try {
        const res = await fetch('/api/playlists', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name.trim() }),
        });
        const playlist = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(playlist.error || '플레이리스트 생성에 실패했어요.');
        await addTrackToPlaylist(playlist.id, track, button);
    } catch (err) {
        alert(err.message || '플레이리스트 생성에 실패했어요.');
        closePlaylistPicker();
    }
}

function openPlaylistPicker(anchor, track, button) {
    closePlaylistPicker();
    const popover = document.createElement('div');
    popover.className = 'playlist-picker';
    popover.innerHTML = '<p class="playlist-picker-status">불러오는 중...</p>';
    document.body.appendChild(popover);
    playlistPicker = popover;

    const rect = anchor.getBoundingClientRect();
    const width = 220;
    popover.style.top = `${window.scrollY + rect.bottom + 6}px`;
    popover.style.left = `${Math.max(8, window.scrollX + rect.right - width)}px`;

    fetch('/api/playlists')
        .then((r) => r.json())
        .then((data) => {
            const playlists = data.playlists || [];
            popover.innerHTML = '';
            if (!playlists.length) {
                const empty = document.createElement('p');
                empty.className = 'playlist-picker-status';
                empty.textContent = '아직 플레이리스트가 없어요.';
                popover.appendChild(empty);
            }
            playlists.forEach((playlist) => {
                const item = document.createElement('button');
                item.type = 'button';
                item.className = 'playlist-picker-item';
                item.textContent = `${playlist.name} · ${playlist.totalTracks}곡`;
                item.addEventListener('click', () => addTrackToPlaylist(playlist.id, track, button));
                popover.appendChild(item);
            });
            const createBtn = document.createElement('button');
            createBtn.type = 'button';
            createBtn.className = 'playlist-picker-item playlist-picker-create';
            createBtn.textContent = '+ 새 플레이리스트 만들기';
            createBtn.addEventListener('click', () => createPlaylistAndAdd(track, button));
            popover.appendChild(createBtn);
        })
        .catch(() => {
            popover.innerHTML = '<p class="playlist-picker-status">불러오지 못했어요.</p>';
        });

    setTimeout(() => document.addEventListener('click', handlePlaylistPickerOutsideClick, true), 0);
}

async function handleAddToPlaylistClick(button, track) {
    const me = await getCurrentUser();
    if (!me.loggedIn) {
        if (confirm('로그인이 필요해요. 로그인 페이지로 이동할까요?')) {
            window.location.href = `/login?next=${encodeURIComponent(location.pathname)}`;
        }
        return;
    }
    openPlaylistPicker(button, track, button);
}

document.addEventListener('click', (event) => {
    const addBtn = event.target.closest('.chart-add');
    if (addBtn) {
        const row = addBtn.closest('.chart-row');
        handleAddToPlaylistClick(addBtn, {
            id: row.dataset.id,
            title: row.dataset.title,
            artist: row.dataset.artist,
        });
        return;
    }

    const row = event.target.closest('.chart-row[data-title]');
    if (!row || event.target.closest('.chart-add')) return;
    playSiteTrack({
        title: row.dataset.title,
        artist: row.dataset.artist,
        thumbnailUrl: row.dataset.thumb,
        playUrl: row.dataset.playUrl,
        source: row.dataset.source,
    });
});

initSitePlayer();
initializePersistentNavigation();

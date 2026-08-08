(function () {
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
    return `<div class="chart-row" data-id="${escapeHtml(track.id)}" data-title="${title}" data-artist="${artist}" data-thumb="${thumb}" data-play-url="${playUrl}" data-source="${source}">
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
        drawer.innerHTML = '<button class="drawer-close" id="drawer-close" type="button" aria-label="현재 재생 패널 닫기">✕</button><div class="drawer-content"><p class="drawer-label">NOW PLAYING</p><div class="drawer-empty-cover" id="drawer-empty-cover" aria-hidden="true">♪</div><img class="drawer-cover" id="drawer-cover" alt="" hidden><h2 class="drawer-title" id="drawer-title">재생 중인 곡이 없습니다</h2><p class="drawer-artist" id="drawer-artist">곡을 선택해 주세요.</p><div class="drawer-preview">플로비는 iTunes에서 제공하는 30초 미리듣기를 재생합니다.</div><h3 class="drawer-queue-title">다음 재생 목록</h3><div class="drawer-queue" id="drawer-queue"></div></div>';
        document.body.insertBefore(drawer, document.querySelector('.player-bar'));
    }
    // 접힌 상태에서는 삐져나온 부분 아무 데나 누르면 열리고, 닫기는 왼쪽 위 버튼으로만 한다.
    if (drawer.dataset.initialized !== 'true') {
        drawer.dataset.initialized = 'true';
        drawer.addEventListener('click', (event) => {
            if (drawer.classList.contains('is-collapsed')) drawer.classList.remove('is-collapsed');
            else if (event.target.closest('#drawer-close')) drawer.classList.add('is-collapsed');
        });
    }
    return drawer;
}

function fillNowPlayingDrawer(track) {
    const cover = document.getElementById('drawer-cover');
    const emptyCover = document.getElementById('drawer-empty-cover');
    const title = document.getElementById('drawer-title');
    const artist = document.getElementById('drawer-artist');
    if (title) title.textContent = track.title;
    if (artist) artist.textContent = track.artist;
    if (cover && track.thumbnailUrl) {
        cover.src = track.thumbnailUrl;
        cover.alt = `${track.title} 앨범 표지`;
        cover.hidden = false;
        cover.style.display = 'block';
        if (emptyCover) {
            emptyCover.hidden = true;
            emptyCover.style.display = 'none';
        }
    }
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
let currentTrack = null;

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

const ytStateListeners = new Set();

function addYtStateListener(listener) {
    ytStateListeners.add(listener);
}

function dispatchYtState(event) {
    handleYtStateChange(event);
    ytStateListeners.forEach((listener) => listener(event));
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
                onStateChange: dispatchYtState,
            },
        });
    });
    return ytPlayer;
}

function stopYtProgressPolling() {
    if (ytProgressTimer) clearInterval(ytProgressTimer);
    ytProgressTimer = null;
}

function saveYtProgress(isPlaying) {
    if (!currentTrack || !ytPlayer || typeof ytPlayer.getCurrentTime !== 'function') return;
    saveNowPlaying(currentTrack, ytPlayer.getCurrentTime(), isPlaying);
}

function startYtProgressPolling() {
    stopYtProgressPolling();
    ytProgressTimer = setInterval(() => {
        if (!ytPlayer || typeof ytPlayer.getDuration !== 'function') return;
        const duration = ytPlayer.getDuration();
        if (!duration) return;
        updatePlayerProgress(ytPlayer.getCurrentTime(), duration);
        saveYtProgress(true);
    }, 500);
}

function handleYtStateChange(event) {
    if (activePlayMode !== 'youtube') return;
    const playing = event.data === window.YT.PlayerState.PLAYING;
    const stopped = event.data === window.YT.PlayerState.PAUSED || event.data === window.YT.PlayerState.ENDED;
    // 이어재생 저장은 사이트 플레이어 바가 없는 앨범/플레이리스트 화면에서도 돌아야 한다.
    if (playing) startYtProgressPolling();
    else if (stopped) {
        stopYtProgressPolling();
        saveYtProgress(false);
    }
    if (!sitePlayerUI) return;
    if (playing) sitePlayerUI.setIcon(true);
    else if (stopped) sitePlayerUI.setIcon(false);
}

async function resumeYouTubeHandoff(handoff, onState) {
    const videoId = extractYouTubeId(handoff.playUrl);
    if (!videoId) return null;
    activePlayMode = 'youtube';
    currentTrack = {
        title: handoff.title,
        artist: handoff.artist,
        thumbnailUrl: handoff.thumbnailUrl,
        playUrl: handoff.playUrl,
        source: 'youtube',
    };
    if (onState) addYtStateListener(onState);
    const player = await getYtPlayer();
    player.loadVideoById(videoId, handoff.currentTime || 0);
    player.playVideo();
    return player;
}

function updatePlayerProgress(current, duration) {
    if (!sitePlayerUI || !duration) return;
    const { progressFill, timeEls } = sitePlayerUI;
    if (progressFill) progressFill.style.width = `${(current / duration) * 100}%`;
    if (timeEls[0]) timeEls[0].textContent = formatTime(current);
    if (timeEls[1]) timeEls[1].textContent = formatTime(duration);
}

const NOW_PLAYING_KEY = 'flowbee_now_playing';
// 느린 네트워크/콜드 캐시에서는 다음 페이지가 뜨는 데만 8초를 넘길 수 있다.
const NOW_PLAYING_HANDOFF_MAX_AGE_MS = 30000;

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
        script.src = src;
        // 실행이 끝난 <script> 는 지운다. 남겨두면 화면을 옮길 때마다 쌓인다.
        // 태그를 지워도 이미 실행된 코드는 그대로 살아 있다.
        const done = (handler) => () => { script.remove(); handler(); };
        script.onload = done(resolve);
        script.onerror = done(() => reject(new Error(`스크립트를 불러오지 못했습니다: ${src}`)));
        document.body.appendChild(script);
    });
}

// 상세 화면(앨범/추천 플레이리스트)에는 .app-shell 이 없다. 그 경우엔 라이브러리 셸을
// 앞에 붙이고 재생 중인 것들만 남긴다. 상세 화면이 각자 복사해 두던 로직을 여기로 모았다.
function swapInShell(nextShell) {
    const currentShell = document.querySelector('.app-shell');
    if (currentShell) {
        currentShell.replaceWith(nextShell);
        return;
    }
    // 재생 중인 <audio> 를 그대로 들고 가므로, 새 화면이 handoff 로 또 틀면 소리가 겹친다.
    const keep = new Set([
        document.getElementById('audio-player'),
        document.getElementById('site-audio'),
        document.getElementById('site-yt-host'),
        document.getElementById('now-playing-drawer'),
        document.querySelector('.album-player'),
    ]);
    clearNowPlaying();
    document.body.prepend(nextShell);
    [...document.body.children].forEach((child) => {
        if (child !== nextShell && !keep.has(child)) child.remove();
    });
}

async function navigateWithoutStoppingPlayback(path, pushHistory = true) {
    const response = await fetch(path);
    if (!response.ok) throw new Error('화면을 불러오지 못했습니다.');
    const nextDocument = new DOMParser().parseFromString(await response.text(), 'text/html');
    const nextShell = nextDocument.querySelector('.app-shell');
    if (!nextShell) throw new Error('화면 영역을 찾지 못했습니다.');

    nextDocument.querySelectorAll('link[rel="stylesheet"]').forEach((stylesheet) => {
        const href = stylesheet.getAttribute('href');
        if (!href || document.querySelector(`link[href="${href}"]`)) return;
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        document.head.appendChild(link);
    });
    swapInShell(nextShell);
    document.title = nextDocument.title;
    ensureSiteNowPlayingDrawer().classList.add('is-collapsed');
    if (pushHistory) history.pushState({ flowbeePersistentPage: true }, '', path);

    // 어느 화면에서 넘어오든 main.js/페이지 스크립트가 쓰는 전역이 먼저 준비돼 있어야 한다.
    if (!window.FlowbeePlaylists) await loadPageScript('/js/recommended-playlists.js');
    if (!window.FlowbeeFixedCatalog) await loadPageScript('/js/fixed-catalog.js');
    await loadPageScript('/js/pages/main.js');
    if (dynamicPageScripts.has(path)) await loadPageScript(`/js/pages/${path.slice(1)}.js`);
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

async function playSiteTrack(track, startAt = 0) {
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
    fillNowPlayingDrawer(track);
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
    // 앨범/플레이리스트 상세는 자기 <audio> 로 직접 이어받는다. 여기서 또 틀면 소리가 겹친다.
    if (document.getElementById('album-page') || document.getElementById('playlist-page')) return;
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
        // 새로 만든 플레이리스트든 곡 수가 바뀐 기존 것이든, 목록/사이드바를 다시 그린다.
        // 담기가 실패해도 부른다 - createPlaylistAndAdd 로 왔다면 플레이리스트는 이미 생겼다.
        window.refreshMyPlaylists?.();
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

// 다른 스크립트가 실제로 쓰는 것만 내보낸다. 나머지는 이 파일 안에 갇혀 있어야
// 페이지 스크립트가 같은 이름을 써도 부딪히지 않는다.
Object.assign(window, {
    escapeHtml,
    withCache,
    fetchSearch,
    renderChartRow,
    renderAlbumCard,
    renderApiStatus,
    ensureSiteNowPlayingDrawer,
    fillNowPlayingDrawer,
    resumeYouTubeHandoff,
    saveNowPlaying,
    clearNowPlaying,
    loadNowPlayingHandoff,
    initSitePlayer,
    playSiteTrack,
    getCurrentUser,
    handleAddToPlaylistClick,
    navigateWithoutStoppingPlayback,
});

initSitePlayer();
initializePersistentNavigation();
}());

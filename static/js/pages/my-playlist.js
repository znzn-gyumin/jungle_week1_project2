window.addEventListener('DOMContentLoaded', () => {
    const titleEl = document.getElementById('my-playlist-title');
    const metaEl = document.getElementById('my-playlist-meta');
    const listEl = document.getElementById('my-playlist-tracks');
    const deleteBtn = document.getElementById('my-playlist-delete');
    if (!titleEl || !listEl) return;

    const playlistId = (location.pathname.match(/^\/my-playlist\/(\d+)/) || [])[1];
    if (!playlistId) {
        titleEl.textContent = '플레이리스트를 찾을 수 없어요.';
        deleteBtn?.remove();
        return;
    }

    const renderTrackRow = (item) => {
        const track = item.track;
        const title = escapeHtml(track.title);
        const artist = escapeHtml(track.artist);
        const albumName = escapeHtml(track.album ? track.album.name : (track.source === 'youtube' ? 'YouTube' : ''));
        const thumb = escapeHtml(track.thumbnailUrl || '');
        const playUrl = escapeHtml(track.playUrl || '');
        const source = escapeHtml(track.source || '');
        return `<div class="chart-row" data-item-id="${item.itemId}" data-id="${track.id}" data-title="${title}" data-artist="${artist}" data-thumb="${thumb}" data-play-url="${playUrl}" data-source="${source}">
            <span class="chart-rank">${item.position + 1}</span>
            <img class="chart-thumb" src="${escapeHtml(artwork(track.thumbnailUrl, 150))}" alt="" loading="lazy" decoding="async">
            <div class="chart-meta"><b>${title}</b><small>${artist}</small></div>
            <span class="chart-album">${albumName}</span>
            <button class="chart-play" type="button" aria-label="재생">▷</button>
            <button class="chart-delete" type="button" aria-label="곡 삭제">✕</button>
        </div>`;
    };

    const render = (playlist) => {
        titleEl.textContent = playlist.name;
        metaEl.textContent = `${playlist.totalTracks}곡 · ${playlist.isPublic ? '공개' : '비공개'} 플레이리스트`;
        const items = playlist.items || [];
        if (!items.length) {
            listEl.innerHTML = '<p class="api-status">아직 담긴 곡이 없어요. 다른 페이지에서 + 버튼으로 담아보세요.</p>';
            return;
        }
        listEl.innerHTML = items.map(renderTrackRow).join('');
    };

    const load = async () => {
        renderApiStatus(listEl, '불러오는 중...');
        try {
            const res = await fetch(`/api/playlists/${playlistId}`);
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || '플레이리스트를 불러오지 못했어요.');
            if (!data.isOwner) {
                deleteBtn?.remove();
            }
            render(data);
        } catch (error) {
            titleEl.textContent = '불러오지 못했어요';
            metaEl.textContent = error.message;
            listEl.innerHTML = '';
        }
    };

    listEl.addEventListener('click', async (event) => {
        const deleteTrackBtn = event.target.closest('.chart-delete');
        if (deleteTrackBtn) {
            event.stopPropagation();
            const row = deleteTrackBtn.closest('.chart-row');
            const itemId = row.dataset.itemId;
            try {
                const res = await fetch(`/api/playlists/${playlistId}/tracks/${itemId}`, { method: 'DELETE' });
                if (!res.ok) throw new Error();
                await load();
            } catch {
                alert('곡을 삭제하지 못했어요.');
            }
            return;
        }
        // 재생(▷)이나 행 클릭은 api.js 의 전역 chart-row 리스너가 처리한다
    });

    deleteBtn?.addEventListener('click', async () => {
        if (!confirm('이 플레이리스트를 삭제할까요?')) return;
        try {
            const res = await fetch(`/api/playlists/${playlistId}`, { method: 'DELETE' });
            if (!res.ok) throw new Error();
            window.location.href = '/';
        } catch {
            alert('플레이리스트를 삭제하지 못했어요.');
        }
    });

    load();
});

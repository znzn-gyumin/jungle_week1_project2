window.addEventListener('DOMContentLoaded', () => {
    const playBtn = document.getElementById('play-btn');
    const playIcon = playBtn ? playBtn.querySelector('span') : null;
    const setPlaying = (playing) => {
        if (playIcon) playIcon.textContent = playing ? '⏸' : '▶';
    };
    if (playBtn) {
        playBtn.addEventListener('click', () => setPlaying(playIcon.textContent !== '⏸'));
    }

    window.flowbeeSetPlaying = setPlaying;
    window.flowbeePlayTrack = (title, artist) => {
        const nameEl = document.querySelector('.player-now-playing .track-name');
        const subEl = document.querySelector('.player-now-playing .track-sub');
        if (nameEl && title) nameEl.textContent = title;
        if (subEl && artist) subEl.textContent = artist;
        setPlaying(true);
    };

    const weekPick = document.getElementById('week-pick-play');
    if (weekPick) {
        weekPick.addEventListener('click', (event) => {
            event.preventDefault();
            setPlaying(true);
        });
    }

    document.querySelectorAll('.chart-like').forEach((button) => {
        button.addEventListener('click', () => {
            button.classList.toggle('liked');
            button.textContent = button.classList.contains('liked') ? '♥' : '♡';
        });
    });

    document.querySelectorAll('.section').forEach((section) => {
        const head = section.querySelector('.section-head');
        const title = section.querySelector('.section-title');
        const cards = section.querySelectorAll('.card-grid > .track-card');
        if (!head || !title || cards.length <= 5) return;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'more-btn';
        btn.textContent = '더보기';
        title.insertAdjacentElement('afterend', btn);

        btn.addEventListener('click', () => {
            const expanded = section.classList.toggle('expanded');
            btn.textContent = expanded ? '접기' : '더보기';
        });
    });
});

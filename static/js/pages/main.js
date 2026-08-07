window.addEventListener('DOMContentLoaded', () => {
    const playBtn = document.getElementById('play-btn');
    if (playBtn) {
        const playIcon = playBtn.querySelector('span');
        playBtn.addEventListener('click', () => {
            const playing = playIcon.textContent === '⏸';
            playIcon.textContent = playing ? '▶' : '⏸';
        });
    }

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

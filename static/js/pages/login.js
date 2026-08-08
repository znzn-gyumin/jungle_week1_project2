const GOOGLE_GSI = 'https://accounts.google.com/gsi/client';

function loadScript(src) {
    return new Promise((resolve, reject) => {
        const el = document.createElement('script');
        el.src = src;
        el.async = true;
        el.onload = resolve;
        el.onerror = () => reject(new Error(`script load failed: ${src}`));
        document.head.append(el);
    });
}

window.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('login-form');
    const error = document.getElementById('login-error');
    const submitBtn = form.querySelector('.login-submit');

    const goNext = () => {
        const next = new URLSearchParams(location.search).get('next');
        window.location.href = next || '/';
    };

    const showError = (message) => {
        error.textContent = message;
        error.hidden = false;
    };

    async function postLogin(path, body) {
        const res = await fetch(path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || '로그인에 실패했어요.');
        return data;
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        error.hidden = true;

        const email = form.email.value.trim();
        const password = form.password.value;

        if (!email || !password) {
            showError('이메일과 비밀번호를 모두 입력해주세요.');
            return;
        }

        submitBtn.disabled = true;
        try {
            await postLogin('/api/users/login', { email, password });
            goNext();
        } catch (err) {
            showError(err.message);
            submitBtn.disabled = false;
        }
    });

    // 구글 버튼: 서버가 클라이언트 ID 를 줄 때만 GIS 스크립트를 받아 그린다.
    // 설정이 없거나 스크립트가 막히면 구분선까지 같이 지워서 흔적을 남기지 않는다.
    (async () => {
        const box = document.getElementById('google-btn');
        const divider = document.getElementById('google-divider');
        try {
            const res = await fetch('/api/users/google');
            const { clientId } = await res.json();
            if (!clientId) throw new Error('구글 로그인 미설정');

            await loadScript(GOOGLE_GSI);
            google.accounts.id.initialize({
                client_id: clientId,
                callback: async ({ credential }) => {
                    error.hidden = true;
                    try {
                        await postLogin('/api/users/google', { credential });
                        goNext();
                    } catch (err) {
                        showError(err.message);
                    }
                },
            });
            google.accounts.id.renderButton(box, {
                theme: 'outline',
                size: 'large',
                // GIS 는 200~400 밖의 width 를 거부한다.
                width: Math.min(Math.max(box.clientWidth || 320, 200), 400),
                text: 'continue_with',
                locale: 'ko',
            });
        } catch {
            box.remove();
            divider.remove();
        }
    })();
});

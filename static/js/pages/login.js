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

    window.mountGoogleButton({
        box: document.getElementById('google-btn'),
        divider: document.getElementById('google-divider'),
        text: 'continue_with',
        onSuccess: goNext,
        onError: showError,
    });
});

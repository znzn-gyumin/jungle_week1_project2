window.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('login-form');
    const error = document.getElementById('login-error');
    const submitBtn = form.querySelector('.login-submit');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        error.hidden = true;

        const email = form.email.value.trim();
        const password = form.password.value;

        if (!email || !password) {
            error.textContent = '이메일과 비밀번호를 모두 입력해주세요.';
            error.hidden = false;
            return;
        }

        submitBtn.disabled = true;
        try {
            const res = await fetch('/api/users/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ email, password }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || '로그인에 실패했어요.');
            const next = new URLSearchParams(location.search).get('next');
            window.location.href = next || '/';
        } catch (err) {
            error.textContent = err.message;
            error.hidden = false;
            submitBtn.disabled = false;
        }
    });
});

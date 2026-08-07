window.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('signup-form');
    const error = document.getElementById('signup-error');
    const submitBtn = form.querySelector('.login-submit');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        error.hidden = true;

        const nickname = form.nickname.value.trim();
        const email = form.email.value.trim();
        const password = form.password.value;
        const password2 = form.password2.value;

        if (password.length < 8) {
            error.textContent = '비밀번호는 8자 이상이어야 합니다.';
            error.hidden = false;
            return;
        }
        if (password !== password2) {
            error.textContent = '비밀번호가 일치하지 않습니다.';
            error.hidden = false;
            return;
        }
        if (!form.agree.checked) {
            error.textContent = '이용약관에 동의해주세요.';
            error.hidden = false;
            return;
        }

        submitBtn.disabled = true;
        try {
            const res = await fetch('/api/users/signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ nickname, email, password }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || '회원가입에 실패했어요.');
            window.location.href = '/';
        } catch (err) {
            error.textContent = err.message;
            error.hidden = false;
            submitBtn.disabled = false;
        }
    });
});

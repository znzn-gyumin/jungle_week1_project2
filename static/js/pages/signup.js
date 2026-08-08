window.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('signup-form');
    const error = document.getElementById('signup-error');
    const submitBtn = form.querySelector('.login-submit');

    const showError = (message) => {
        error.textContent = message;
        error.hidden = false;
    };

    // 구글에는 가입과 로그인의 구분이 없다. 처음 보는 이메일이면 서버가 계정을
    // 만들고, 이미 있으면 그 계정으로 들어간다.
    window.mountGoogleButton({
        box: document.getElementById('google-btn'),
        divider: document.getElementById('google-divider'),
        text: 'signup_with',
        onSuccess: () => { window.location.href = '/'; },
        onError: showError,
    }).then((mounted) => {
        if (!mounted) document.getElementById('google-terms').remove();
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        error.hidden = true;

        const nickname = form.nickname.value.trim();
        const email = form.email.value.trim();
        const password = form.password.value;
        const password2 = form.password2.value;

        if (password.length < 8) {
            showError('비밀번호는 8자 이상이어야 합니다.');
            return;
        }
        if (password !== password2) {
            showError('비밀번호가 일치하지 않습니다.');
            return;
        }
        if (!form.agree.checked) {
            showError('이용약관에 동의해주세요.');
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
            showError(err.message);
            submitBtn.disabled = false;
        }
    });
});

window.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('login-form');
    const error = document.getElementById('login-error');

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        error.hidden = true;

        const email = form.email.value.trim();
        const password = form.password.value;

        if (!email || !password) {
            error.textContent = '이메일과 비밀번호를 모두 입력해주세요.';
            error.hidden = false;
            return;
        }

        // TODO: 실제 로그인 API 연동 전까지는 임시로 메인 화면으로 이동
        window.location.href = '/';
    });
});

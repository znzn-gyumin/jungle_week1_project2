window.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('signup-form');
    const error = document.getElementById('signup-error');

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        error.hidden = true;

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

        // TODO: 실제 회원가입 API 연동 전까지는 임시로 로그인 화면으로 이동
        window.location.href = '/login';
    });
});

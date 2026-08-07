window.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('forgot-form');
    const error = document.getElementById('forgot-error');
    const requestView = document.getElementById('request-view');
    const sentView = document.getElementById('sent-view');
    const sentMessage = document.getElementById('sent-message');
    const resendBtn = document.getElementById('resend-btn');

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        error.hidden = true;

        const email = form.email.value.trim();
        if (!email) {
            error.textContent = '이메일을 입력해주세요.';
            error.hidden = false;
            return;
        }

        // TODO: 실제 이메일 발송 API 연동 전까지는 임시로 완료 화면만 보여줌
        sentMessage.textContent = `${email} 주소로 재설정 링크를 보냈어요.`;
        requestView.hidden = true;
        sentView.hidden = false;
    });

    resendBtn.addEventListener('click', () => {
        sentView.hidden = true;
        requestView.hidden = false;
    });
});

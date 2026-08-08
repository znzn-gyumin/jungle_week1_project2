// 로그인 화면과 회원가입 화면이 같은 구글 버튼을 공유한다. 구글 쪽에는 가입과
// 로그인의 구분이 없다 - 처음 보는 이메일이면 POST /api/users/google 이 그 자리에서
// 계정을 만들어 준다. 그래서 화면마다 다른 건 버튼 문구뿐이다.
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

// 서버가 클라이언트 ID 를 줄 때만 GIS 스크립트를 받아 버튼을 그린다.
// 설정이 없거나 스크립트가 막히면 구분선까지 같이 지워서 흔적을 남기지 않는다.
// 그렸으면 true. 화면마다 딸린 문구가 다르므로 나머지 뒷정리는 부르는 쪽이 한다.
window.mountGoogleButton = async ({ box, divider, text = 'continue_with', onSuccess, onError }) => {
    try {
        const res = await fetch('/api/users/google');
        const { clientId } = await res.json();
        if (!clientId) throw new Error('구글 로그인 미설정');

        await loadScript(GOOGLE_GSI);
        google.accounts.id.initialize({
            client_id: clientId,
            callback: async ({ credential }) => {
                try {
                    const login = await fetch('/api/users/google', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({ credential }),
                    });
                    const data = await login.json().catch(() => ({}));
                    if (!login.ok) throw new Error(data.error || '구글 로그인에 실패했어요.');
                    onSuccess();
                } catch (err) {
                    onError(err.message);
                }
            },
        });
        google.accounts.id.renderButton(box, {
            theme: 'outline',
            size: 'large',
            // GIS 는 200~400 밖의 width 를 거부한다.
            width: Math.min(Math.max(box.clientWidth || 320, 200), 400),
            text,
            locale: 'ko',
        });
        return true;
    } catch {
        box.remove();
        divider.remove();
        return false;
    }
};

import uvicorn

from backend.config import get_settings


def main() -> None:
    settings = get_settings()
    uvicorn.run(
        "backend.main:app",
        host=settings.server_host,
        port=settings.server_port,
        reload=settings.server_reload,
        # app.js 프록시가 붙인 X-Forwarded-For 만 믿는다. 로그인 시도 제한이
        # 이 값으로 클라이언트를 가르므로, 신뢰 목록을 넓히면 위조가 가능해진다.
        forwarded_allow_ips=settings.trusted_proxies,
    )


if __name__ == "__main__":
    main()

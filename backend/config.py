from functools import lru_cache
from pathlib import Path

from pydantic import PostgresDsn, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_user: str = "jungle"
    postgres_password: SecretStr = SecretStr("jungle")
    postgres_db: str = "flowbee"

    youtube_api_key: SecretStr = SecretStr("")

    # 구글 OAuth 클라이언트 ID. 비어 있으면 구글 로그인 버튼이 아예 안 뜬다.
    # 공개값이라 프런트에 그대로 내려준다 (GET /api/users/google).
    google_client_id: str = ""

    # iTunes storefront 이자 YouTube 지역 제한 판정 국가. 같은 ISO 코드를 쓴다.
    itunes_country: str = "KR"

    # 같은 검색어를 이 시간 안에 다시 물으면 외부 API 대신 DB 에서 읽는다.
    # iTunes 는 IP 당 약 20회/분, YouTube 는 검색 1회에 쿼터 100 유닛이다.
    search_cache_ttl: int = 86400

    # HTTPS 배포에서는 true - 쿠키가 평문 HTTP 로 나가지 않는다.
    cookie_secure: bool = False

    # X-Forwarded-For 를 믿을 프록시. app.js 가 같은 호스트에서 도는 게 기본이다.
    # 넓히면 클라이언트가 IP 를 위조해 로그인 시도 제한을 우회할 수 있다.
    trusted_proxies: str = "127.0.0.1"

    ssl_trust_system: bool = False

    client_origins: str = "http://127.0.0.1:5173,http://localhost:5173"
    server_host: str = "127.0.0.1"
    server_port: int = 8000
    server_reload: bool = False

    def _dsn(self, scheme: str) -> str:
        return str(
            PostgresDsn.build(
                scheme=scheme,
                username=self.postgres_user,
                password=self.postgres_password.get_secret_value(),
                host=self.postgres_host,
                port=self.postgres_port,
                path=self.postgres_db,
            )
        )

    @property
    def sync_database_url(self) -> str:
        return self._dsn("postgresql+psycopg")

    @property
    def async_database_url(self) -> str:
        return self._dsn("postgresql+asyncpg")

    @property
    def allowed_origins(self) -> list[str]:
        return [o.strip() for o in self.client_origins.split(",") if o.strip()]

    @property
    def youtube_key(self) -> str:
        return self.youtube_api_key.get_secret_value()


@lru_cache
def get_settings() -> Settings:
    return Settings()

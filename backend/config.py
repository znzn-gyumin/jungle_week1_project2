from functools import lru_cache

from pydantic import PostgresDsn
from pydantic_settings import BaseSettings, SettingsConfigDict

SPOTIFY_SCOPES = " ".join(
    (
        "streaming",
        "user-read-email",
        "user-read-private",
        "user-read-playback-state",
        "user-modify-playback-state",
    )
)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_user: str = "jungle"
    postgres_password: str = "jungle"
    postgres_db: str = "jungle_music"

    spotify_client_id: str = ""
    spotify_client_secret: str = ""
    spotify_redirect_uri: str = "http://127.0.0.1:8000/api/auth/callback"

    client_origin: str = "http://127.0.0.1:5173"
    server_port: int = 8000

    def _dsn(self, scheme: str) -> str:
        return str(
            PostgresDsn.build(
                scheme=scheme,
                username=self.postgres_user,
                password=self.postgres_password,
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

    def missing_spotify_config(self) -> list[str]:
        return [
            name
            for name, value in (
                ("SPOTIFY_CLIENT_ID", self.spotify_client_id),
                ("SPOTIFY_CLIENT_SECRET", self.spotify_client_secret),
            )
            if not value
        ]


@lru_cache
def get_settings() -> Settings:
    return Settings()

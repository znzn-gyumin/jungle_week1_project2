from functools import lru_cache

from pydantic import PostgresDsn
from pydantic_settings import BaseSettings, SettingsConfigDict


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


@lru_cache
def get_settings() -> Settings:
    return Settings()

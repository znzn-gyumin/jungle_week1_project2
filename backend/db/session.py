from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from backend.config import get_settings

settings = get_settings()

# asyncpg 는 libpq 와 달리 TLS 를 스스로 협상하지 않는다. 공유 개발 DB 는 hostssl
# 로만 열려 있어 평문으로 붙으면 비밀번호를 보기도 전에 pg_hba 에서 막힌다
# ("no pg_hba.conf entry for host ..., no encryption"). 로컬/도커 postgres 는
# TLS 를 안 켜므로 그때만 끈다. 마이그레이션은 psycopg(libpq) 라 sslmode=prefer
# 기본값으로 알아서 협상한다 - 여기만 있으면 된다.
LOCAL_DB_HOSTS = {"localhost", "127.0.0.1", "::1", "postgres"}

engine: AsyncEngine = create_async_engine(
    settings.async_database_url,
    pool_pre_ping=True,
    # ponytail: require 는 암호화만 하고 인증서는 안 본다. 서버 인증서를 검증하려면
    # verify-full 로 올리고 루트 CA 를 함께 넘길 것.
    connect_args=(
        {} if settings.postgres_host in LOCAL_DB_HOSTS else {"ssl": "require"}
    ),
)

SessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


async def get_db() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise

from sqlalchemy import ARRAY, BigInteger, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from backend.db.base import Base, PKMixin, TimestampMixin


class SearchCache(PKMixin, TimestampMixin, Base):
    """질의 -> 결과 행 ID 매핑.

    트랙/앨범 실물은 tracks/albums 가 원본이고, 여기엔 "이 질의가 어떤 행을
    어떤 순서로 돌려줬나"만 남는다. 그래서 값이 바뀌어도 캐시는 안 썩는다.

    updated_at 이 외부 API 를 마지막으로 친 시각이다. settings.search_cache_ttl
    안이면 services.search 가 API 호출을 건너뛰고 ID 로 DB 에서 읽는다.
    """

    __tablename__ = "search_cache"
    __table_args__ = (
        UniqueConstraint(
            "kind",
            "source",
            "query",
            "result_limit",
            name="uq_search_cache_kind_source_query_result_limit",
        ),
    )

    kind: Mapped[str] = mapped_column(String(16), nullable=False)  # track | album
    source: Mapped[str] = mapped_column(String(16), nullable=False)
    # casefold 된 검색어. varchar 상한은 btree 인덱스가 감당할 크기로 자른 값이고
    # api.search 가 같은 길이로 입력을 막는다.
    query: Mapped[str] = mapped_column(String(200), nullable=False)
    result_limit: Mapped[int] = mapped_column(Integer, nullable=False)
    result_ids: Mapped[list[int]] = mapped_column(ARRAY(BigInteger), nullable=False)

    def __repr__(self) -> str:
        return f"<SearchCache {self.kind}:{self.source} {self.query!r}>"

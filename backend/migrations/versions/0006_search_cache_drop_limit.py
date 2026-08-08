"""search_cache 키에서 result_limit 제거

캐시 키에 요청 개수가 들어 있어서 limit=20 과 limit=21 이 서로 다른 행이었다.
같은 검색어라도 화면마다 limit 이 다르면 그만큼 외부 API 를 다시 쳤다.

이제 소스가 한 번에 주는 최대치(iTunes 200, YouTube 50)를 통째로 받아 한 행에
넣고, 부르는 쪽이 앞에서부터 자른다. 풀을 키워도 호출 횟수는 그대로다 - iTunes 는
limit 이 쿼리 파라미터고 YouTube 는 maxResults 상한이 50 이라 어차피 1회다.

기존 행은 지운다. limit 별로 쪼개져 있어 그대로 두면 새 UNIQUE (kind, source,
query) 와 충돌하고, 어차피 TTL 짜리 캐시라 첫 요청에 다시 채워진다.

Revision ID: 0006
Revises: 0005
Create Date: 2026-08-08

"""

from typing import Sequence, Union

from alembic import op

revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("DELETE FROM search_cache")
    op.execute(
        """
        ALTER TABLE search_cache
            DROP CONSTRAINT uq_search_cache_kind_source_query_result_limit,
            DROP COLUMN result_limit,
            ADD CONSTRAINT uq_search_cache_kind_source_query
                UNIQUE (kind, source, query)
        """
    )


def downgrade() -> None:
    # 지워진 result_limit 값은 복구할 수 없다. 캐시를 비우고 컬럼만 되돌린다.
    op.execute("DELETE FROM search_cache")
    op.execute(
        """
        ALTER TABLE search_cache
            DROP CONSTRAINT uq_search_cache_kind_source_query,
            ADD COLUMN result_limit integer NOT NULL,
            ADD CONSTRAINT uq_search_cache_kind_source_query_result_limit
                UNIQUE (kind, source, query, result_limit)
        """
    )

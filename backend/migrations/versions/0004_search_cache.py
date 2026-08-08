"""search_cache 테이블

검색은 매 요청마다 iTunes/YouTube 를 직접 쳤다. iTunes 는 IP 당 약 20회/분,
YouTube 는 검색 1회에 쿼터 100 유닛이라 같은 질의 반복이 그대로 한도로 간다.

트랙/앨범 실물은 이미 tracks/albums 에 upsert 되고 있으니, 없는 것은
"이 질의가 어떤 행을 어떤 순서로 돌려줬나" 뿐이다. 그것만 저장한다.

0003 다음이어야 한다. 캐시가 먼저 굳으면 0003 의 새 컬럼이 TTL 동안 NULL 로 남는다.

Revision ID: 0004
Revises: 0003
Create Date: 2026-08-07

"""

from typing import Sequence, Union

from alembic import op

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE search_cache (
            id           bigserial    NOT NULL,
            kind         varchar(16)  NOT NULL,
            source       varchar(16)  NOT NULL,
            query        varchar(200) NOT NULL,
            result_limit integer      NOT NULL,
            result_ids   bigint[]     NOT NULL,
            created_at   timestamptz  NOT NULL DEFAULT now(),
            updated_at   timestamptz  NOT NULL DEFAULT now(),

            CONSTRAINT pk_search_cache PRIMARY KEY (id),
            CONSTRAINT uq_search_cache_kind_source_query_result_limit
                UNIQUE (kind, source, query, result_limit)
        )
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE search_cache")

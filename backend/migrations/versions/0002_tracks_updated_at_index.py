"""tracks.updated_at index

repository.list_tracks 는 ORDER BY updated_at DESC LIMIT n 으로 읽는다.
인덱스가 없으면 tracks 전체 Seq Scan 뒤 정렬이라 행 수에 비례해 느려진다.

Revision ID: 0002
Revises: 0001
Create Date: 2026-08-06

"""

from typing import Sequence, Union

from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE INDEX ix_tracks_updated_at ON tracks (updated_at DESC)")


def downgrade() -> None:
    op.execute("DROP INDEX ix_tracks_updated_at")

"""plays 테이블

홈의 "최근 재생" 칸은 하드코딩된 검색어(Red Velvet)를 앨범 검색으로 채우고 있었다.
실제로 유저가 뭘 틀었는지는 어디에도 안 남았다. 그것만 저장한다.

이력 전체가 아니라 곡당 마지막 재생 시각 한 행이다 (uq_plays_user_id_track_id).

Revision ID: 0005
Revises: 0004
Create Date: 2026-08-08

"""

from typing import Sequence, Union

from alembic import op

revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE plays (
            id        bigserial   NOT NULL,
            user_id   bigint      NOT NULL,
            track_id  bigint      NOT NULL,
            played_at timestamptz NOT NULL DEFAULT now(),

            CONSTRAINT pk_plays PRIMARY KEY (id),
            CONSTRAINT fk_plays_user_id_users
                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
            CONSTRAINT fk_plays_track_id_tracks
                FOREIGN KEY (track_id) REFERENCES tracks (id) ON DELETE CASCADE,
            CONSTRAINT uq_plays_user_id_track_id UNIQUE (user_id, track_id)
        )
        """
    )
    op.execute("CREATE INDEX ix_plays_user_id_played_at ON plays (user_id, played_at DESC)")
    op.execute("CREATE INDEX ix_plays_track_id ON plays (track_id)")


def downgrade() -> None:
    op.execute("DROP TABLE plays")

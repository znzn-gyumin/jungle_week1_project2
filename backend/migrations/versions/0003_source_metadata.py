"""tracks/albums 부가 메타데이터

소스 응답에 이미 들어 있는데 버리던 값들을 담는다. 추가 API 호출은 없다.
- artist_source_id: 아티스트 페이지
- genre: 추천
- release_date, disc_number, track_number: 정렬과 앨범 트랙 순서
- albums.tracks_synced_at: 앨범 상세가 매 요청마다 iTunes 를 다시 치던 것 차단

전부 nullable 이다. 기존 행은 NULL 로 남고 다음 검색의 upsert 때 채워진다.

Revision ID: 0003
Revises: 0002
Create Date: 2026-08-07

"""

from typing import Sequence, Union

from alembic import op

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE tracks
            ADD COLUMN artist_source_id varchar(128),
            ADD COLUMN genre            text,
            ADD COLUMN release_date     date,
            ADD COLUMN disc_number      integer,
            ADD COLUMN track_number     integer
        """
    )
    op.execute(
        """
        ALTER TABLE albums
            ADD COLUMN artist_source_id varchar(128),
            ADD COLUMN genre            text,
            ADD COLUMN tracks_synced_at timestamptz
        """
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE albums
            DROP COLUMN tracks_synced_at,
            DROP COLUMN genre,
            DROP COLUMN artist_source_id
        """
    )
    op.execute(
        """
        ALTER TABLE tracks
            DROP COLUMN track_number,
            DROP COLUMN disc_number,
            DROP COLUMN release_date,
            DROP COLUMN genre,
            DROP COLUMN artist_source_id
        """
    )

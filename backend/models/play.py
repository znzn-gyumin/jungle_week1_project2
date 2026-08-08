from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    Index,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.db.base import Base, PKMixin

if TYPE_CHECKING:
    from backend.models.track import Track


class Play(PKMixin, Base):
    """유저가 마지막으로 그 곡을 재생한 시각. 한 곡당 한 행이다.

    재생 이력 전체를 쌓지 않는다 - 화면이 쓰는 건 "최근 재생" 목록뿐이고,
    같은 곡을 열 번 틀면 카드 열 장이 아니라 맨 앞으로 오는 게 맞다.
    그래서 (user_id, track_id) UNIQUE 에 played_at 만 갈아치운다.
    """

    __tablename__ = "plays"
    __table_args__ = (
        UniqueConstraint("user_id", "track_id", name="uq_plays_user_id_track_id"),
        Index("ix_plays_user_id_played_at", "user_id", text("played_at DESC")),
        Index("ix_plays_track_id", "track_id"),
    )

    user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    track_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("tracks.id", ondelete="CASCADE"),
        nullable=False,
    )
    played_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    track: Mapped["Track"] = relationship()

    def __repr__(self) -> str:
        return f"<Play user={self.user_id} track={self.track_id}>"

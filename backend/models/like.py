from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
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
    from backend.models.album import Album
    from backend.models.playlist import Playlist
    from backend.models.user import User


class Like(PKMixin, Base):
    __tablename__ = "likes"
    __table_args__ = (
        CheckConstraint(
            "num_nonnulls(album_id, playlist_id) = 1",
            name="exactly_one_target",
        ),
        UniqueConstraint("user_id", "album_id", name="uq_likes_user_id_album_id"),
        UniqueConstraint(
            "user_id", "playlist_id", name="uq_likes_user_id_playlist_id"
        ),
        Index("ix_likes_user_id_created_at", "user_id", text("created_at DESC")),
        Index("ix_likes_album_id", "album_id"),
        Index("ix_likes_playlist_id", "playlist_id"),
    )

    user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    album_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("albums.id", ondelete="CASCADE"),
    )
    playlist_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("playlists.id", ondelete="CASCADE"),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    user: Mapped["User"] = relationship(back_populates="likes")
    album: Mapped["Album | None"] = relationship(back_populates="likes")
    playlist: Mapped["Playlist | None"] = relationship(back_populates="likes")

    def __repr__(self) -> str:
        return f"<Like id={self.id} user={self.user_id}>"

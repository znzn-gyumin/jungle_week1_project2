from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.db.base import Base, PKMixin, TimestampMixin

if TYPE_CHECKING:
    from backend.models.like import Like
    from backend.models.track import Track
    from backend.models.user import User


class Playlist(PKMixin, TimestampMixin, Base):
    __tablename__ = "playlists"
    __table_args__ = (
        CheckConstraint("view_count >= 0", name="view_count_non_negative"),
        CheckConstraint("total_tracks >= 0", name="total_tracks_non_negative"),
        Index("ix_playlists_user_id", "user_id"),
        Index(
            "ix_playlists_public_view_count",
            text("view_count DESC"),
            postgresql_where=text("is_public"),
        ),
    )

    user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    total_tracks: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("0")
    )
    is_public: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false")
    )
    view_count: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("0")
    )

    user: Mapped["User"] = relationship(back_populates="playlists")
    items: Mapped[list["PlaylistTrack"]] = relationship(
        back_populates="playlist",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="PlaylistTrack.position",
    )
    likes: Mapped[list["Like"]] = relationship(
        back_populates="playlist",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    def __repr__(self) -> str:
        return f"<Playlist id={self.id} name={self.name!r}>"


class PlaylistTrack(PKMixin, Base):
    __tablename__ = "playlist_tracks"
    __table_args__ = (
        UniqueConstraint(
            "playlist_id",
            "position",
            name="uq_playlist_tracks_playlist_id_position",
            deferrable=True,
            initially="DEFERRED",
        ),
        CheckConstraint("position >= 0", name="position_non_negative"),
        Index("ix_playlist_tracks_track_id", "track_id"),
    )

    playlist_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("playlists.id", ondelete="CASCADE"),
        nullable=False,
    )
    track_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("tracks.id", ondelete="CASCADE"),
        nullable=False,
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    added_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    playlist: Mapped["Playlist"] = relationship(back_populates="items")
    track: Mapped["Track"] = relationship(back_populates="playlist_links")

    def __repr__(self) -> str:
        return (
            f"<PlaylistTrack playlist={self.playlist_id} "
            f"track={self.track_id} pos={self.position}>"
        )

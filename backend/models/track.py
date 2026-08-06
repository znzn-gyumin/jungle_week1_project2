from typing import TYPE_CHECKING

from sqlalchemy import (
    BigInteger,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.db.base import Base, PKMixin, TimestampMixin
from backend.models.enums import SourceType, source_enum

if TYPE_CHECKING:
    from backend.models.album import Album
    from backend.models.playlist import PlaylistTrack


class Track(PKMixin, TimestampMixin, Base):
    __tablename__ = "tracks"
    __table_args__ = (
        UniqueConstraint("source", "source_id", name="uq_tracks_source_source_id"),
        Index("ix_tracks_isrc", "isrc"),
        Index("ix_tracks_title_lower", text("lower(title)")),
        Index("ix_tracks_album_id", "album_id"),
    )

    source: Mapped[SourceType] = mapped_column(source_enum(), nullable=False)
    source_id: Mapped[str] = mapped_column(String(128), nullable=False)

    title: Mapped[str] = mapped_column(Text, nullable=False)
    artist: Mapped[str] = mapped_column(Text, nullable=False)

    album_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("albums.id", ondelete="SET NULL"),
    )

    duration_ms: Mapped[int | None] = mapped_column(Integer)
    isrc: Mapped[str | None] = mapped_column(String(12))
    thumbnail_url: Mapped[str | None] = mapped_column(Text)
    external_url: Mapped[str | None] = mapped_column(Text)

    album: Mapped["Album | None"] = relationship(back_populates="tracks")
    playlist_links: Mapped[list["PlaylistTrack"]] = relationship(
        back_populates="track",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    def __repr__(self) -> str:
        return f"<Track id={self.id} {self.source}:{self.source_id}>"

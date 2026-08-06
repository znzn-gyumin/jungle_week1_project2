from datetime import date
from typing import TYPE_CHECKING

from sqlalchemy import Date, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.db.base import Base, PKMixin, TimestampMixin
from backend.models.enums import SourceType, source_enum

if TYPE_CHECKING:
    from backend.models.like import Like
    from backend.models.track import Track


class Album(PKMixin, TimestampMixin, Base):
    __tablename__ = "albums"
    __table_args__ = (
        UniqueConstraint("source", "source_id", name="uq_albums_source_source_id"),
    )

    source: Mapped[SourceType] = mapped_column(source_enum(), nullable=False)
    source_id: Mapped[str] = mapped_column(String(128), nullable=False)

    name: Mapped[str] = mapped_column(Text, nullable=False)
    artist: Mapped[str] = mapped_column(Text, nullable=False)

    release_date: Mapped[date | None] = mapped_column(Date)
    total_tracks: Mapped[int | None] = mapped_column(Integer)
    thumbnail_url: Mapped[str | None] = mapped_column(Text)
    external_url: Mapped[str | None] = mapped_column(Text)

    tracks: Mapped[list["Track"]] = relationship(back_populates="album")
    likes: Mapped[list["Like"]] = relationship(
        back_populates="album",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    def __repr__(self) -> str:
        return f"<Album id={self.id} {self.source}:{self.source_id}>"

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.db.base import Base, PKMixin
from backend.models.enums import SourceType, source_enum

if TYPE_CHECKING:
    from backend.models.album import Album
    from backend.models.track import Track


class SearchCache(PKMixin, Base):
    __tablename__ = "search_cache"
    __table_args__ = (
        UniqueConstraint(
            "source",
            "search_type",
            "query",
            name="uq_search_cache_source_search_type_query",
        ),
        Index("ix_search_cache_fetched_at", "fetched_at"),
    )

    source: Mapped[SourceType] = mapped_column(source_enum(), nullable=False)
    search_type: Mapped[str] = mapped_column(String(16), nullable=False)
    query: Mapped[str] = mapped_column(Text, nullable=False)
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    items: Mapped[list["SearchCacheItem"]] = relationship(
        back_populates="cache",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="SearchCacheItem.position",
    )

    def __repr__(self) -> str:
        return f"<SearchCache {self.source}:{self.search_type}:{self.query!r}>"


class SearchCacheItem(Base):
    __tablename__ = "search_cache_items"
    __table_args__ = (
        CheckConstraint(
            "num_nonnulls(track_id, album_id) = 1", name="exactly_one_target"
        ),
        CheckConstraint("position >= 0", name="position_non_negative"),
        Index("ix_search_cache_items_track_id", "track_id"),
        Index("ix_search_cache_items_album_id", "album_id"),
    )

    cache_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("search_cache.id", ondelete="CASCADE"),
        primary_key=True,
    )
    position: Mapped[int] = mapped_column(Integer, primary_key=True)
    track_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("tracks.id", ondelete="CASCADE")
    )
    album_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("albums.id", ondelete="CASCADE")
    )

    cache: Mapped["SearchCache"] = relationship(back_populates="items")
    track: Mapped["Track | None"] = relationship()
    album: Mapped["Album | None"] = relationship()

    def __repr__(self) -> str:
        return f"<SearchCacheItem cache={self.cache_id} pos={self.position}>"

from datetime import date
from typing import TYPE_CHECKING

from sqlalchemy import (
    BigInteger,
    Date,
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
        Index("ix_tracks_album_id", "album_id"),
        # repository.list_tracks 의 ORDER BY updated_at DESC LIMIT n 용
        Index("ix_tracks_updated_at", text("updated_at DESC")),
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
    thumbnail_url: Mapped[str | None] = mapped_column(Text)
    play_url: Mapped[str | None] = mapped_column(Text)

    # 소스가 주는 부가 정보. 아직 화면에 안 나오지만 재검색 없이 쌓아 둔다.
    # artist_source_id 는 아티스트 페이지, genre 는 추천, release_date 는 정렬,
    # disc/track_number 는 앨범 상세 트랙 순서용.
    artist_source_id: Mapped[str | None] = mapped_column(String(128))
    genre: Mapped[str | None] = mapped_column(Text)
    release_date: Mapped[date | None] = mapped_column(Date)
    disc_number: Mapped[int | None] = mapped_column(Integer)
    track_number: Mapped[int | None] = mapped_column(Integer)

    album: Mapped["Album | None"] = relationship(back_populates="tracks")
    playlist_links: Mapped[list["PlaylistTrack"]] = relationship(
        back_populates="track",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    def __repr__(self) -> str:
        return f"<Track id={self.id} {self.source}:{self.source_id}>"

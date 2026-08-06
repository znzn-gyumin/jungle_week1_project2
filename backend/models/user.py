from typing import TYPE_CHECKING

from sqlalchemy import Index, String, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.db.base import Base, PKMixin, TimestampMixin

if TYPE_CHECKING:
    from backend.models.like import Like
    from backend.models.playlist import Playlist


class User(PKMixin, TimestampMixin, Base):
    __tablename__ = "users"
    __table_args__ = (
        Index("uq_users_nickname_lower", text("lower(nickname)"), unique=True),
        Index("uq_users_email_lower", text("lower(email)"), unique=True),
    )

    nickname: Mapped[str] = mapped_column(String(30), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)

    playlists: Mapped[list["Playlist"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    likes: Mapped[list["Like"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    def __repr__(self) -> str:
        return f"<User id={self.id} nickname={self.nickname!r}>"

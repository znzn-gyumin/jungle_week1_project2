"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-08-05

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

source_type = postgresql.ENUM(
    "itunes", "youtube", name="source_type", create_type=False
)


def upgrade() -> None:
    source_type.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "users",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("nickname", sa.String(length=30), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name="pk_users"),
        sa.UniqueConstraint("nickname", name="uq_users_nickname"),
        sa.UniqueConstraint("email", name="uq_users_email"),
    )

    op.create_table(
        "albums",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("source", source_type, nullable=False),
        sa.Column("source_id", sa.String(length=128), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("artist", sa.Text(), nullable=False),
        sa.Column("release_date", sa.Date(), nullable=True),
        sa.Column("total_tracks", sa.Integer(), nullable=True),
        sa.Column("thumbnail_url", sa.Text(), nullable=True),
        sa.Column("external_url", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name="pk_albums"),
        sa.UniqueConstraint("source", "source_id", name="uq_albums_source_source_id"),
    )

    op.create_table(
        "tracks",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("source", source_type, nullable=False),
        sa.Column("source_id", sa.String(length=128), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("artist", sa.Text(), nullable=False),
        sa.Column("album_id", sa.BigInteger(), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("thumbnail_url", sa.Text(), nullable=True),
        sa.Column("external_url", sa.Text(), nullable=True),
        sa.Column("audio_url", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name="pk_tracks"),
        sa.ForeignKeyConstraint(
            ["album_id"],
            ["albums.id"],
            name="fk_tracks_album_id_albums",
            ondelete="SET NULL",
        ),
        sa.UniqueConstraint("source", "source_id", name="uq_tracks_source_source_id"),
    )
    op.create_index("ix_tracks_title_lower", "tracks", [sa.text("lower(title)")])
    op.create_index("ix_tracks_album_id", "tracks", ["album_id"])

    op.create_table(
        "playlists",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "total_tracks", sa.Integer(), server_default=sa.text("0"), nullable=False
        ),
        sa.Column(
            "is_public", sa.Boolean(), server_default=sa.text("false"), nullable=False
        ),
        sa.Column(
            "view_count", sa.Integer(), server_default=sa.text("0"), nullable=False
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name="pk_playlists"),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="fk_playlists_user_id_users",
            ondelete="CASCADE",
        ),
        sa.CheckConstraint("view_count >= 0", name="view_count_non_negative"),
        sa.CheckConstraint("total_tracks >= 0", name="total_tracks_non_negative"),
    )
    op.create_index("ix_playlists_user_id", "playlists", ["user_id"])
    op.create_index(
        "ix_playlists_public_view_count",
        "playlists",
        [sa.text("view_count DESC")],
        postgresql_where=sa.text("is_public"),
    )

    op.create_table(
        "playlist_tracks",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("playlist_id", sa.BigInteger(), nullable=False),
        sa.Column("track_id", sa.BigInteger(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column(
            "added_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name="pk_playlist_tracks"),
        sa.ForeignKeyConstraint(
            ["playlist_id"],
            ["playlists.id"],
            name="fk_playlist_tracks_playlist_id_playlists",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["track_id"],
            ["tracks.id"],
            name="fk_playlist_tracks_track_id_tracks",
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint(
            "playlist_id",
            "position",
            name="uq_playlist_tracks_playlist_id_position",
            deferrable=True,
            initially="DEFERRED",
        ),
        sa.CheckConstraint("position >= 0", name="position_non_negative"),
    )
    op.create_index("ix_playlist_tracks_track_id", "playlist_tracks", ["track_id"])

    op.create_table(
        "likes",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("album_id", sa.BigInteger(), nullable=True),
        sa.Column("playlist_id", sa.BigInteger(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name="pk_likes"),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name="fk_likes_user_id_users", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["album_id"],
            ["albums.id"],
            name="fk_likes_album_id_albums",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["playlist_id"],
            ["playlists.id"],
            name="fk_likes_playlist_id_playlists",
            ondelete="CASCADE",
        ),
        sa.CheckConstraint(
            "num_nonnulls(album_id, playlist_id) = 1",
            name="exactly_one_target",
        ),
        sa.UniqueConstraint("user_id", "album_id", name="uq_likes_user_id_album_id"),
        sa.UniqueConstraint(
            "user_id", "playlist_id", name="uq_likes_user_id_playlist_id"
        ),
    )
    op.create_index(
        "ix_likes_user_id_created_at",
        "likes",
        ["user_id", sa.text("created_at DESC")],
    )
    op.create_index("ix_likes_album_id", "likes", ["album_id"])
    op.create_index("ix_likes_playlist_id", "likes", ["playlist_id"])

    op.create_table(
        "search_cache",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("source", source_type, nullable=False),
        sa.Column("search_type", sa.String(length=16), nullable=False),
        sa.Column("query", sa.Text(), nullable=False),
        sa.Column(
            "fetched_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name="pk_search_cache"),
        sa.UniqueConstraint(
            "source",
            "search_type",
            "query",
            name="uq_search_cache_source_search_type_query",
        ),
    )
    op.create_index("ix_search_cache_fetched_at", "search_cache", ["fetched_at"])

    op.create_table(
        "search_cache_items",
        sa.Column("cache_id", sa.BigInteger(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("track_id", sa.BigInteger(), nullable=True),
        sa.Column("album_id", sa.BigInteger(), nullable=True),
        sa.PrimaryKeyConstraint("cache_id", "position", name="pk_search_cache_items"),
        sa.ForeignKeyConstraint(
            ["cache_id"],
            ["search_cache.id"],
            name="fk_search_cache_items_cache_id_search_cache",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["track_id"],
            ["tracks.id"],
            name="fk_search_cache_items_track_id_tracks",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["album_id"],
            ["albums.id"],
            name="fk_search_cache_items_album_id_albums",
            ondelete="CASCADE",
        ),
        sa.CheckConstraint(
            "num_nonnulls(track_id, album_id) = 1", name="exactly_one_target"
        ),
        sa.CheckConstraint("position >= 0", name="position_non_negative"),
    )
    op.create_index(
        "ix_search_cache_items_track_id", "search_cache_items", ["track_id"]
    )
    op.create_index(
        "ix_search_cache_items_album_id", "search_cache_items", ["album_id"]
    )


def downgrade() -> None:
    op.drop_table("search_cache_items")
    op.drop_table("search_cache")
    op.drop_table("likes")
    op.drop_table("playlist_tracks")
    op.drop_table("playlists")
    op.drop_table("tracks")
    op.drop_table("albums")
    op.drop_table("users")
    source_type.drop(op.get_bind(), checkfirst=True)

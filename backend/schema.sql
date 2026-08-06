BEGIN;

CREATE TYPE source_type AS ENUM ('itunes', 'youtube');


CREATE TABLE users (
    id            bigserial    NOT NULL,
    nickname      varchar(30)  NOT NULL,
    email         varchar(255) NOT NULL,
    password_hash varchar(255) NOT NULL,
    created_at    timestamptz  NOT NULL DEFAULT now(),
    updated_at    timestamptz  NOT NULL DEFAULT now(),

    CONSTRAINT pk_users          PRIMARY KEY (id),
    CONSTRAINT uq_users_nickname UNIQUE (nickname),
    CONSTRAINT uq_users_email    UNIQUE (email)
);


CREATE TABLE albums (
    id            bigserial    NOT NULL,
    source        source_type  NOT NULL,
    source_id     varchar(128) NOT NULL,
    name          text         NOT NULL,
    artist        text         NOT NULL,
    release_date  date,
    total_tracks  integer,
    thumbnail_url text,
    external_url  text,
    created_at    timestamptz  NOT NULL DEFAULT now(),
    updated_at    timestamptz  NOT NULL DEFAULT now(),

    CONSTRAINT pk_albums PRIMARY KEY (id),
    CONSTRAINT uq_albums_source_source_id UNIQUE (source, source_id)
);


CREATE TABLE tracks (
    id            bigserial    NOT NULL,
    source        source_type  NOT NULL,
    source_id     varchar(128) NOT NULL,
    title         text         NOT NULL,
    artist        text         NOT NULL,
    album_id      bigint,
    duration_ms   integer,
    thumbnail_url text,
    external_url  text,
    preview_url   text,
    created_at    timestamptz  NOT NULL DEFAULT now(),
    updated_at    timestamptz  NOT NULL DEFAULT now(),

    CONSTRAINT pk_tracks PRIMARY KEY (id),
    CONSTRAINT uq_tracks_source_source_id UNIQUE (source, source_id),
    CONSTRAINT fk_tracks_album_id_albums
        FOREIGN KEY (album_id) REFERENCES albums (id) ON DELETE SET NULL
);

CREATE INDEX ix_tracks_album_id    ON tracks (album_id);
CREATE INDEX ix_tracks_title_lower ON tracks (lower(title));


CREATE TABLE playlists (
    id          bigserial    NOT NULL,
    user_id     bigint       NOT NULL,
    name        varchar(100) NOT NULL,
    description text,
    is_public   boolean      NOT NULL DEFAULT false,
    view_count  integer      NOT NULL DEFAULT 0,
    created_at  timestamptz  NOT NULL DEFAULT now(),
    updated_at  timestamptz  NOT NULL DEFAULT now(),

    CONSTRAINT pk_playlists PRIMARY KEY (id),
    CONSTRAINT fk_playlists_user_id_users
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT ck_playlists_view_count_non_negative CHECK (view_count >= 0)
);

CREATE INDEX ix_playlists_user_id ON playlists (user_id);
CREATE INDEX ix_playlists_public_view_count
    ON playlists (view_count DESC) WHERE is_public;


CREATE TABLE playlist_tracks (
    id          bigserial   NOT NULL,
    playlist_id bigint      NOT NULL,
    track_id    bigint      NOT NULL,
    position    integer     NOT NULL,
    added_at    timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT pk_playlist_tracks PRIMARY KEY (id),
    CONSTRAINT fk_playlist_tracks_playlist_id_playlists
        FOREIGN KEY (playlist_id) REFERENCES playlists (id) ON DELETE CASCADE,
    CONSTRAINT fk_playlist_tracks_track_id_tracks
        FOREIGN KEY (track_id) REFERENCES tracks (id) ON DELETE CASCADE,
    CONSTRAINT uq_playlist_tracks_playlist_id_position
        UNIQUE (playlist_id, position) DEFERRABLE INITIALLY DEFERRED,
    CONSTRAINT ck_playlist_tracks_position_non_negative CHECK (position >= 0)
);

CREATE INDEX ix_playlist_tracks_track_id ON playlist_tracks (track_id);


CREATE TABLE likes (
    id          bigserial   NOT NULL,
    user_id     bigint      NOT NULL,
    playlist_id bigint,
    album_id    bigint,
    created_at  timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT pk_likes PRIMARY KEY (id),
    CONSTRAINT fk_likes_user_id_users
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_likes_playlist_id_playlists
        FOREIGN KEY (playlist_id) REFERENCES playlists (id) ON DELETE CASCADE,
    CONSTRAINT fk_likes_album_id_albums
        FOREIGN KEY (album_id) REFERENCES albums (id) ON DELETE CASCADE,
    CONSTRAINT ck_likes_exactly_one_target
        CHECK (num_nonnulls(playlist_id, album_id) = 1),
    CONSTRAINT uq_likes_user_id_playlist_id UNIQUE (user_id, playlist_id),
    CONSTRAINT uq_likes_user_id_album_id    UNIQUE (user_id, album_id)
);

CREATE INDEX ix_likes_user_id_created_at ON likes (user_id, created_at DESC);
CREATE INDEX ix_likes_playlist_id        ON likes (playlist_id);
CREATE INDEX ix_likes_album_id           ON likes (album_id);

COMMIT;

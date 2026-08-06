from datetime import date

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

from backend.models.enums import SourceType


class Schema(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
    )


class AlbumOut(Schema):
    id: int
    source: SourceType
    source_id: str
    name: str
    artist: str
    release_date: date | None = None
    total_tracks: int | None = None
    thumbnail_url: str | None = None


class TrackOut(Schema):
    id: int
    source: SourceType
    source_id: str
    title: str
    artist: str
    album: AlbumOut | None = None
    duration_ms: int | None = None
    thumbnail_url: str | None = None
    play_url: str | None = None


class SourceError(Schema):
    source: str
    error: str


class SearchResponse(Schema):
    tracks: list[TrackOut] = []
    albums: list[AlbumOut] = []
    errors: list[SourceError] = []


class TrackListResponse(Schema):
    tracks: list[TrackOut]


class AlbumListResponse(Schema):
    albums: list[AlbumOut]


class HealthResponse(Schema):
    ok: bool
    youtube: bool


class DbHealthResponse(Schema):
    ok: bool
    tables: int

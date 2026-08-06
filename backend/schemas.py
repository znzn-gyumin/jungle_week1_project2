from typing import Any

from backend.models import Album, Track


def album_out(album: Album) -> dict[str, Any]:
    return {
        "id": album.id,
        "source": album.source.value,
        "sourceId": album.source_id,
        "name": album.name,
        "artist": album.artist,
        "releaseDate": album.release_date.isoformat() if album.release_date else None,
        "totalTracks": album.total_tracks,
        "thumbnailUrl": album.thumbnail_url,
    }


def track_out(track: Track) -> dict[str, Any]:
    return {
        "id": track.id,
        "source": track.source.value,
        "sourceId": track.source_id,
        "title": track.title,
        "artist": track.artist,
        "album": album_out(track.album) if track.album else None,
        "durationMs": track.duration_ms,
        "thumbnailUrl": track.thumbnail_url,
        "playUrl": track.play_url,
    }

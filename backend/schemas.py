from typing import Any

from backend.models import Track


def track_out(track: Track) -> dict[str, Any]:
    return {
        "id": track.id,
        "source": track.source.value,
        "sourceId": track.source_id,
        "title": track.title,
        "artist": track.artist,
        "durationMs": track.duration_ms,
        "thumbnailUrl": track.thumbnail_url,
        "playUrl": track.play_url,
    }

from typing import Any

from backend.models import Album, Like, Playlist, PlaylistTrack, Track, User


def user_out(user: User) -> dict[str, Any]:
    return {
        "id": user.id,
        "nickname": user.nickname,
        "email": user.email,
        "createdAt": user.created_at,
    }


def album_out(album: Album) -> dict[str, Any]:
    return {
        "id": album.id,
        "source": album.source.value,
        "sourceId": album.source_id,
        "name": album.name,
        "artist": album.artist,
        "releaseDate": album.release_date,
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


def playlist_item_out(item: PlaylistTrack) -> dict[str, Any]:
    return {
        "itemId": item.id,
        "position": item.position,
        "addedAt": item.added_at,
        "track": track_out(item.track),
    }


def playlist_out(playlist: Playlist, items: bool = False) -> dict[str, Any]:
    data: dict[str, Any] = {
        "id": playlist.id,
        "userId": playlist.user_id,
        "name": playlist.name,
        "description": playlist.description,
        "totalTracks": playlist.total_tracks,
        "isPublic": playlist.is_public,
        "viewCount": playlist.view_count,
        "createdAt": playlist.created_at,
        "updatedAt": playlist.updated_at,
    }
    if items:
        data["items"] = [playlist_item_out(i) for i in playlist.items]
    return data


def like_out(like: Like) -> dict[str, Any]:
    return {
        "id": like.id,
        "target": "album" if like.album_id else "playlist",
        "createdAt": like.created_at,
        "album": album_out(like.album) if like.album else None,
        "playlist": playlist_out(like.playlist) if like.playlist else None,
    }

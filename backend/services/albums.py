from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import get_settings
from backend.db import repository
from backend.models import Album
from backend.models.enums import SourceType
from backend.sources import itunes

settings = get_settings()


async def get_album_with_tracks(db: AsyncSession, album_id: int) -> Album | None:
    album = await repository.get_album(db, album_id)
    if album is None or album.source != SourceType.ITUNES:
        return album
    if album.tracks and (
        album.total_tracks is None or len(album.tracks) >= album.total_tracks
    ):
        return album

    results = await itunes.lookup_album_tracks(
        album.source_id, country=settings.itunes_country
    )
    if album.total_tracks is None or len(results) < album.total_tracks:
        searched = await itunes.search_album_tracks(
            album.source_id,
            album.name,
            country=settings.itunes_country,
        )
        by_id = {str(row["trackId"]): row for row in (*results, *searched)}
        results = list(by_id.values())
    rows = []
    for result in results:
        row = itunes.to_track(result)
        row["album_id"] = album.id
        rows.append(row)
    await repository.upsert_tracks(db, rows)
    await db.commit()
    return await repository.get_album(db, album_id)

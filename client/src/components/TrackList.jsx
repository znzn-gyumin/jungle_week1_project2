export function TrackList({ tracks, currentId, onPlay }) {
  return (
    <ul className="tracks">
      {tracks.map((t) => (
        <li key={t.id} className={t.id === currentId ? 'row playing' : 'row'}>
          <button className="rowMain" onClick={() => onPlay(t)}>
            {t.thumbnailUrl ? (
              <img src={t.thumbnailUrl} alt="" width="48" height="48" />
            ) : (
              <span className="thumbFallback" />
            )}
            <span className="meta">
              <span className="title">{t.title}</span>
              <span className="muted">{t.artist}</span>
            </span>
          </button>
          <span className={`badge ${t.source}`}>{t.source}</span>
          <span className="muted dur">{formatDuration(t.durationMs)}</span>
        </li>
      ))}
    </ul>
  )
}

export function formatDuration(ms) {
  if (!ms) return ''
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

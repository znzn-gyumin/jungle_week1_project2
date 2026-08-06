import { useEffect, useRef, useState } from 'react'
import { api } from './api.js'

const SOURCES = [
  { key: 'all', label: '전체' },
  { key: 'itunes', label: 'iTunes' },
  { key: 'youtube', label: 'YouTube' },
]

export default function App() {
  const [query, setQuery] = useState('')
  const [source, setSource] = useState('all')
  const [tracks, setTracks] = useState([])
  const [warnings, setWarnings] = useState([])
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [current, setCurrent] = useState(null)
  const [searched, setSearched] = useState(false)

  async function submit(e) {
    e.preventDefault()
    const q = query.trim()
    if (!q) return

    setLoading(true)
    setError(null)
    setWarnings([])
    try {
      const data = await api.search(q, source)
      setTracks(data.tracks)
      setWarnings(data.errors ?? [])
    } catch (err) {
      setError(err.message)
      setTracks([])
    } finally {
      setLoading(false)
      setSearched(true)
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <h1>Flowbee</h1>
        <form className="search" onSubmit={submit}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="곡 또는 아티스트 검색"
            aria-label="검색어"
          />
          <select value={source} onChange={(e) => setSource(e.target.value)} aria-label="검색 대상">
            {SOURCES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
          <button type="submit" disabled={loading}>
            {loading ? '검색 중' : '검색'}
          </button>
        </form>
      </header>

      {error && <Banner tone="error">{error}</Banner>}
      {warnings.map((w) => (
        <Banner key={w.source} tone="warn">
          {w.source}: {w.error}
        </Banner>
      ))}

      <main>
        {tracks.length > 0 ? (
          <TrackList tracks={tracks} currentId={current?.id} onPlay={setCurrent} />
        ) : (
          searched && !loading && !error && <p className="empty muted">결과가 없습니다.</p>
        )}
      </main>

      {current && <PlayerBar track={current} onClose={() => setCurrent(null)} />}
    </div>
  )
}

function TrackList({ tracks, currentId, onPlay }) {
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
          <span className="muted dur">{fmt(t.durationMs)}</span>
        </li>
      ))}
    </ul>
  )
}

function PlayerBar({ track, onClose }) {
  const audioRef = useRef(null)

  useEffect(() => {
    if (track.source === 'itunes' && audioRef.current) {
      audioRef.current.play().catch(() => {})
    }
  }, [track])

  return (
    <div className="playerBar">
      <div className="nowPlaying">
        <strong>{track.title}</strong>
        <span className="muted">{track.artist}</span>
      </div>

      {track.source === 'itunes' ? (
        track.playUrl ? (
          <audio ref={audioRef} src={track.playUrl} controls autoPlay />
        ) : (
          <p className="muted">미리듣기를 제공하지 않는 곡입니다.</p>
        )
      ) : (
        <iframe
          title={track.title}
          src={`${track.playUrl}?autoplay=1`}
          allow="autoplay; encrypted-media"
          frameBorder="0"
        />
      )}

      {track.source === 'itunes' && <span className="muted hint">30초 미리듣기</span>}
      <button className="close" onClick={onClose} aria-label="닫기">
        ×
      </button>
    </div>
  )
}

function Banner({ tone, children }) {
  return <div className={`banner ${tone}`}>{children}</div>
}

function fmt(ms) {
  if (!ms) return ''
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

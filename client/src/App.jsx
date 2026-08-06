import { useState } from 'react'
import { api } from './api.js'
import { Banner } from './components/Banner.jsx'
import { PlayerBar } from './components/PlayerBar.jsx'
import { TrackList } from './components/TrackList.jsx'

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
          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            aria-label="검색 대상"
          >
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

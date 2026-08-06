import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api.js'
import { usePlayer } from './usePlayer.js'

const TABS = [
  { key: 'track', label: '노래' },
  { key: 'artist', label: '아티스트' },
]

const DEV_MODE_KEY = 'jungle:devMode'
const DEV_STOP_MS = 10_000

export default function App() {
  const [me, setMe] = useState(null)
  const [authError, setAuthError] = useState(null)

  useEffect(() => {
    const err = new URLSearchParams(window.location.search).get('auth_error')
    if (err) {
      setAuthError(err)
      window.history.replaceState({}, '', window.location.pathname)
    }
    api.me().then(setMe).catch((e) => setAuthError(authErrorMessage(e)))
  }, [])

  // me 를 못 받으면 me 는 계속 null 이라 아래 스플래시에 갇힌다.
  // 에러를 먼저 렌더해야 사유가 화면에 보인다.
  if (!me && authError) {
    return (
      <Splash>
        <h1 className="brand">Jungle Music</h1>
        <p className="error">로그인 실패: {authError}</p>
        <a className="btn-primary" href="/api/auth/login">다시 로그인</a>
      </Splash>
    )
  }

  if (!me) return <Splash>불러오는 중…</Splash>

  if (!me.loggedIn) {
    return (
      <Splash>
        <h1 className="brand">Jungle Music</h1>
        <p className="muted">노래 검색 · 아티스트 검색 · 실제 재생</p>
        {authError && <p className="error">로그인 실패: {authError}</p>}
        <a className="btn-primary" href="/api/auth/login">Spotify 로 로그인</a>
        <p className="muted small">재생에는 Spotify Premium 계정이 필요합니다.</p>
      </Splash>
    )
  }

  return <Home me={me} onLogout={() => api.logout().then(() => setMe({ loggedIn: false }))} />
}

function Home({ me, onLogout }) {
  const { deviceId, state, position, error, activate, clearError } = usePlayer(true)

  const [tab, setTab] = useState('track')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState({ tracks: [], artists: [] })
  const [artistView, setArtistView] = useState(null)
  const [busy, setBusy] = useState(false)
  const [apiError, setApiError] = useState(null)

  const [devMode, setDevMode] = useState(
    () => localStorage.getItem(DEV_MODE_KEY) === '1',
  )

  const transferred = useRef(false)
  const autoStopRef = useRef(null)

  const cancelAutoStop = useCallback(() => {
    if (autoStopRef.current === null) return
    clearTimeout(autoStopRef.current)
    autoStopRef.current = null
  }, [])

  /**
   * 개발 모드에서 재생을 짧게 끊어 계정 청취 기록에 남는 양을 줄인다.
   * 30초 스트림 집계는 피하지만, 짧은 재생이 스킵 신호로 잡힐 수 있어 완전한 보호는 아니다.
   */
  const scheduleAutoStop = useCallback(() => {
    cancelAutoStop()
    if (!devMode || !deviceId) return
    autoStopRef.current = setTimeout(() => {
      autoStopRef.current = null
      api.pause(deviceId).catch(() => {})
    }, DEV_STOP_MS)
  }, [cancelAutoStop, devMode, deviceId])

  // 모드를 끄거나 화면을 떠날 때 예약된 정지가 남지 않게 한다.
  useEffect(() => {
    if (!devMode) cancelAutoStop()
    return cancelAutoStop
  }, [devMode, cancelAutoStop])

  const toggleDevMode = () => {
    setDevMode((on) => {
      localStorage.setItem(DEV_MODE_KEY, on ? '0' : '1')
      return !on
    })
  }

  // 브라우저 플레이어가 준비되면 활성 디바이스로 넘긴다. 안 하면 play 가 404 로 실패한다.
  useEffect(() => {
    if (!deviceId || transferred.current) return
    transferred.current = true
    api.transfer(deviceId).catch((e) => setApiError(`디바이스 전환 실패: ${e.message}`))
  }, [deviceId])

  const runSearch = useCallback(async (q, type) => {
    if (!q.trim()) return
    setBusy(true)
    setApiError(null)
    setArtistView(null)
    try {
      setResults(await api.search(q, type))
    } catch (e) {
      setApiError(e.message)
    } finally {
      setBusy(false)
    }
  }, [])

  const openArtist = async (artist) => {
    setBusy(true)
    setApiError(null)
    try {
      const { tracks } = await api.artistTopTracks(artist.id)
      setArtistView({ artist, tracks })
    } catch (e) {
      setApiError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const playTrack = async (track) => {
    if (!deviceId) return setApiError('플레이어가 아직 준비되지 않았습니다.')
    setApiError(null)
    // 클릭 제스처가 살아있는 동안 오디오를 해제한다. await 보다 먼저 와야 한다.
    await activate()
    try {
      await api.play(deviceId, [track.uri])
      scheduleAutoStop()
    } catch (e) {
      setApiError(`재생 실패: ${e.message}`)
    }
  }

  const current = state?.track_window?.current_track
  const notPremium = me.product && me.product !== 'premium'

  return (
    <div className="app">
      <header className="topbar">
        <h1 className="brand">Jungle Music</h1>
        <form
          className="searchbar"
          onSubmit={(e) => {
            e.preventDefault()
            runSearch(query, tab)
          }}
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tab === 'track' ? '노래 제목 검색' : '아티스트 이름 검색'}
            aria-label="검색어"
          />
          <div className="tabs">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                className={t.key === tab ? 'tab active' : 'tab'}
                onClick={() => {
                  setTab(t.key)
                  runSearch(query, t.key)
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button className="btn-primary" type="submit" disabled={busy}>
            {busy ? '검색 중…' : '검색'}
          </button>
        </form>
        <div className="user">
          <button
            className={devMode ? 'btn-ghost dev on' : 'btn-ghost dev'}
            onClick={toggleDevMode}
            title="재생을 10초 뒤 자동 정지해 계정 청취 기록을 줄입니다"
          >
            {devMode ? `개발 모드 · ${DEV_STOP_MS / 1000}초` : '개발 모드 꺼짐'}
          </button>
          <span className={notPremium ? 'badge warn' : 'badge'}>{me.product ?? '?'}</span>
          <span>{me.displayName}</span>
          <button className="btn-ghost" onClick={onLogout}>로그아웃</button>
        </div>
      </header>

      {notPremium && (
        <Banner tone="warn">
          이 계정은 <b>{me.product}</b> 입니다. Web Playback SDK 재생은 Premium 에서만 동작합니다.
          검색은 정상 동작합니다.
        </Banner>
      )}
      {error && <Banner tone="error" onClose={clearError}>{error}</Banner>}
      {apiError && <Banner tone="error" onClose={() => setApiError(null)}>{apiError}</Banner>}

      <main className="content">
        {artistView ? (
          <ArtistPanel view={artistView} onBack={() => setArtistView(null)} onPlay={playTrack} currentId={current?.id} />
        ) : tab === 'track' ? (
          <TrackList tracks={results.tracks} onPlay={playTrack} currentId={current?.id} />
        ) : (
          <ArtistGrid artists={results.artists} onOpen={openArtist} />
        )}
      </main>

      <PlayerBar
        deviceId={deviceId}
        state={state}
        position={position}
        devMode={devMode}
        onToggle={async () => {
          if (!deviceId) return
          await activate()
          try {
            if (state?.paused) {
              await api.play(deviceId)
              scheduleAutoStop()
            } else {
              cancelAutoStop()
              await api.pause(deviceId)
            }
          } catch (e) {
            setApiError(e.message)
          }
        }}
      />
    </div>
  )
}

function TrackList({ tracks, onPlay, currentId }) {
  if (!tracks.length) return <Empty>노래를 검색해 보세요.</Empty>
  return (
    <ol className="tracklist">
      {tracks.map((t, i) => (
        <li key={t.id} className={t.id === currentId ? 'row playing' : 'row'}>
          <span className="idx">{i + 1}</span>
          {t.album?.image ? <img src={t.album.image} alt="" width="40" height="40" /> : <div className="ph40" />}
          <div className="meta">
            <div className="title">{t.name}{t.explicit && <span className="tag">E</span>}</div>
            <div className="sub">{t.artists.map((a) => a.name).join(', ')}</div>
          </div>
          <span className="album">{t.album?.name}</span>
          <span className="dur">{fmt(t.durationMs)}</span>
          <button className="btn-play" onClick={() => onPlay(t)} aria-label={`${t.name} 재생`}>▶</button>
        </li>
      ))}
    </ol>
  )
}

function ArtistGrid({ artists, onOpen }) {
  if (!artists.length) return <Empty>아티스트를 검색해 보세요.</Empty>
  return (
    <div className="grid">
      {artists.map((a) => (
        <button key={a.id} className="card" onClick={() => onOpen(a)}>
          {a.image ? <img src={a.image} alt="" /> : <div className="ph-card" />}
          <div className="card-name">{a.name}</div>
          <div className="card-sub">팔로워 {a.followers.toLocaleString('ko-KR')}</div>
        </button>
      ))}
    </div>
  )
}

function ArtistPanel({ view, onBack, onPlay, currentId }) {
  return (
    <section>
      <button className="btn-ghost" onClick={onBack}>← 검색 결과로</button>
      <div className="artist-head">
        {view.artist.image && <img src={view.artist.image} alt="" />}
        <div>
          <div className="muted small">아티스트</div>
          <h2>{view.artist.name}</h2>
          <div className="muted small">{view.artist.genres.slice(0, 3).join(' · ')}</div>
        </div>
      </div>
      <h3 className="section-title">인기 트랙</h3>
      <TrackList tracks={view.tracks} onPlay={onPlay} currentId={currentId} />
    </section>
  )
}

function PlayerBar({ deviceId, state, position, devMode, onToggle }) {
  const track = state?.track_window?.current_track
  const pct = state?.duration ? (position / state.duration) * 100 : 0

  return (
    <footer className="playerbar">
      <div className="now">
        {track?.album?.images?.[0]?.url ? (
          <img src={track.album.images[0].url} alt="" width="48" height="48" />
        ) : (
          <div className="ph48" />
        )}
        <div className="meta">
          <div className="title">{track?.name ?? '재생 중인 곡 없음'}</div>
          <div className="sub">{track?.artists?.map((a) => a.name).join(', ') ?? '—'}</div>
        </div>
      </div>

      <div className="controls">
        <button className="btn-toggle" onClick={onToggle} disabled={!deviceId || !state}>
          {state?.paused === false ? '❚❚' : '▶'}
        </button>
        <div className="progress">
          <span>{fmt(position)}</span>
          <div className="bar"><div className="fill" style={{ width: `${pct}%` }} /></div>
          <span>{fmt(state?.duration ?? 0)}</span>
        </div>
      </div>

      <div className="device muted small">
        <div>{deviceId ? '● 브라우저 플레이어 연결됨' : '○ 플레이어 연결 대기'}</div>
        {devMode && <div className="dev-note">{DEV_STOP_MS / 1000}초 후 자동 정지</div>}
      </div>
    </footer>
  )
}

// Spotify 는 일부 오류를 JSON 이 아닌 평문으로 준다. 그때 백엔드가 만드는 message 는
// "Spotify 403" 뿐이라 쓸모가 없다. 실제 사유가 담긴 detail.raw 를 우선 보여준다.
function authErrorMessage(e) {
  const raw = e.data?.detail?.raw
  if (typeof raw === 'string' && raw.includes('not registered for this application')) {
    return 'Spotify 대시보드의 User Management 에 이 계정이 등록되어 있지 않습니다. 앱 소유자에게 계정 이메일 추가를 요청하세요.'
  }
  return typeof raw === 'string' ? raw : e.message
}

const Splash = ({ children }) => <div className="splash">{children}</div>
const Empty = ({ children }) => <p className="empty muted">{children}</p>

function Banner({ tone, children, onClose }) {
  return (
    <div className={`banner ${tone}`}>
      <span>{children}</span>
      {onClose && <button className="btn-ghost" onClick={onClose}>닫기</button>}
    </div>
  )
}

function fmt(ms) {
  const total = Math.floor((ms ?? 0) / 1000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

import { useCallback, useEffect, useState } from 'react'
import { api } from '../api.js'
import { PUBLIC_SECTIONS, SECTIONS } from './meta.js'
import { AccountPanel, CatalogPanel, ErrorPanel, LikePanel, PlaylistPanel } from './panels.jsx'
import { RequestLog } from './RequestLog.jsx'
import { useFetchLog } from './useFetchLog.js'
import './devlab.css'

export default function ApiLab() {
  const [log, clearLog] = useFetchLog()

  const [me, setMe] = useState(null)
  const [error, setError] = useState(null)
  const [section, setSection] = useState('user')

  const [playlists, setPlaylists] = useState([])
  const [publicList, setPublicList] = useState([])
  const [detail, setDetail] = useState(null)
  const [likes, setLikes] = useState({ albums: [], playlists: [] })

  const run = useCallback(async (fn) => {
    setError(null)
    try {
      return await fn()
    } catch (e) {
      setError(`${e.status ?? ''} ${e.message}`.trim())
      return null
    }
  }, [])

  const loadPlaylists = useCallback(
    () => run(async () => setPlaylists((await api.playlists.list()).playlists)),
    [run],
  )
  const loadLikes = useCallback(() => run(async () => setLikes(await api.likes.list())), [run])
  const loadPublic = useCallback(
    () => run(async () => setPublicList((await api.playlists.public()).playlists)),
    [run],
  )

  const loadMe = useCallback(
    () =>
      run(async () => {
        const data = await api.users.me()
        setMe(data)
        if (data.loggedIn) {
          await loadPlaylists()
          await loadLikes()
        } else {
          setPlaylists([])
          setPublicList([])
          setDetail(null)
          setLikes({ albums: [], playlists: [] })
        }
        return data
      }),
    [run, loadPlaylists, loadLikes],
  )

  useEffect(() => {
    loadMe()
  }, [loadMe])

  const openDetail = (id) => run(async () => setDetail(await api.playlists.detail(id)))

  const refresh = async () => {
    await loadPlaylists()
    await loadLikes()
    if (detail) await openDetail(detail.id)
  }

  const active = me?.loggedIn || PUBLIC_SECTIONS.includes(section) ? section : 'user'

  return (
    <div className="lab">
      <header className="lab-head">
        <h1>API 확인 페이지</h1>
        <p className="muted small">
          모든 호출이 오른쪽 로그에 남는다. 행을 펼치면 요청·응답 본문과 그대로 복붙할 수 있는
          fetch 코드가 나온다. 패널 아래 표에는 엔드포인트 목록·응답 키 사전·에러 형식이 있다.
        </p>
      </header>

      <label className="lab-picker">
        <span className="muted small">확인할 API</span>
        <select value={active} onChange={(e) => setSection(e.target.value)}>
          {SECTIONS.map((s) => (
            <option key={s.key} value={s.key} disabled={s.auth && !me?.loggedIn}>
              {s.label}
              {s.prefix ? ` — ${s.prefix}` : ''}
              {s.auth && !me?.loggedIn ? ' (로그인 필요)' : ''}
            </option>
          ))}
        </select>
      </label>

      {error && (
        <div className="banner error">
          <span>{error}</span>
          <button className="btn-ghost" onClick={() => setError(null)}>닫기</button>
        </div>
      )}

      <div className="lab-grid">
        <div className="lab-cols">
          {active === 'user' && <AccountPanel me={me} run={run} onChanged={loadMe} />}

          {active === 'catalog' && (
            <CatalogPanel
              playlists={playlists}
              likes={likes}
              loggedIn={!!me?.loggedIn}
              run={run}
              onTrackAdded={refresh}
              onLiked={loadLikes}
            />
          )}

          {active === 'playlists' && (
            <PlaylistPanel
              playlists={playlists}
              publicList={publicList}
              detail={detail}
              run={run}
              onOpen={openDetail}
              onChanged={refresh}
              onClosed={() => setDetail(null)}
              onLoadPublic={loadPublic}
            />
          )}

          {active === 'likes' && (
            <LikePanel
              likes={likes}
              run={run}
              onChanged={loadLikes}
              onOpen={(id) => {
                setSection('playlists')
                openDetail(id)
              }}
            />
          )}

          {active === 'errors' && (
            <ErrorPanel me={me} playlists={playlists} run={run} onChanged={loadMe} />
          )}
        </div>

        <RequestLog log={log} onClear={clearLog} />
      </div>
    </div>
  )
}

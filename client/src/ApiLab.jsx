import { useCallback, useEffect, useState } from 'react'
import { api, onApiEvent } from './api.js'

const LOG_LIMIT = 50

export default function ApiLab() {
  const [me, setMe] = useState(null)
  const [error, setError] = useState(null)
  const [log, setLog] = useState([])

  const [playlists, setPlaylists] = useState([])
  const [detail, setDetail] = useState(null)
  const [likes, setLikes] = useState({ albums: [], playlists: [] })

  useEffect(
    () =>
      onApiEvent((event) =>
        setLog((prev) => [{ ...event, id: crypto.randomUUID() }, ...prev].slice(0, LOG_LIMIT)),
      ),
    [],
  )

  const run = useCallback(async (fn) => {
    setError(null)
    try {
      return await fn()
    } catch (e) {
      setError(e.message)
      return null
    }
  }, [])

  const loadPlaylists = useCallback(
    () => run(async () => setPlaylists((await api.playlists.list()).playlists)),
    [run],
  )
  const loadLikes = useCallback(() => run(async () => setLikes(await api.likes.list())), [run])

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

  const reloadDetail = async () => {
    if (detail) await openDetail(detail.id)
  }

  return (
    <div className="lab">
      <header className="lab-head">
        <h1>API 확인 페이지</h1>
        <p className="muted small">
          유저 · 플레이리스트 · 좋아요 API 를 직접 호출한다. 모든 호출은 오른쪽 로그에 남는다.
        </p>
      </header>

      {error && (
        <div className="banner error">
          <span>{error}</span>
          <button className="btn-ghost" onClick={() => setError(null)}>닫기</button>
        </div>
      )}

      <div className="lab-grid">
        <div className="lab-cols">
          <AccountPanel me={me} onChanged={loadMe} run={run} />

          {me?.loggedIn && (
            <>
              <PlaylistPanel
                playlists={playlists}
                detail={detail}
                run={run}
                onOpen={openDetail}
                onChanged={async () => {
                  await loadPlaylists()
                  await reloadDetail()
                  await loadLikes()
                }}
                onClosed={() => setDetail(null)}
                onDeleted={async () => {
                  setDetail(null)
                  await loadPlaylists()
                  await loadLikes()
                }}
              />

              <LikePanel likes={likes} run={run} onChanged={loadLikes} onOpen={openDetail} />
            </>
          )}
        </div>

        <RequestLog log={log} onClear={() => setLog([])} />
      </div>
    </div>
  )
}

function AccountPanel({ me, onChanged, run }) {
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({ nickname: '', email: '', password: '' })
  const [nickname, setNickname] = useState('')

  const field = (key) => ({
    value: form[key],
    onChange: (e) => setForm((f) => ({ ...f, [key]: e.target.value })),
  })

  if (me?.loggedIn) {
    return (
      <Panel title="1. 유저 정보 API" hint="GET/PATCH/DELETE /api/users/me">
        <dl className="kv">
          <dt>id</dt><dd>{me.id}</dd>
          <dt>닉네임</dt><dd>{me.nickname}</dd>
          <dt>이메일</dt><dd>{me.email}</dd>
          <dt>가입</dt><dd>{new Date(me.createdAt).toLocaleString('ko-KR')}</dd>
          <dt>플레이리스트</dt><dd>{me.counts.playlists}개</dd>
          <dt>좋아요</dt><dd>{me.counts.likes}개</dd>
        </dl>

        <form
          className="row-form"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!nickname.trim()) return
            await run(() => api.users.update({ nickname: nickname.trim() }))
            setNickname('')
            await onChanged()
          }}
        >
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="새 닉네임"
            maxLength={30}
          />
          <button className="btn-primary" type="submit">닉네임 변경</button>
        </form>

        <div className="row-form">
          <button
            className="btn-ghost"
            onClick={async () => {
              await run(() => api.users.logout())
              await onChanged()
            }}
          >
            로그아웃
          </button>
          <button
            className="btn-ghost danger"
            onClick={async () => {
              if (!window.confirm('계정을 삭제하면 플레이리스트와 좋아요가 모두 사라집니다. 진행할까요?')) return
              await run(() => api.users.remove())
              await onChanged()
            }}
          >
            계정 삭제
          </button>
        </div>
      </Panel>
    )
  }

  return (
    <Panel title="1. 유저 정보 API" hint="POST /api/users/signup · /login">
      <div className="tabs">
        {[['login', '로그인'], ['signup', '회원가입']].map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={mode === key ? 'tab active' : 'tab'}
            onClick={() => setMode(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <form
        className="stack-form"
        onSubmit={async (e) => {
          e.preventDefault()
          const call = mode === 'signup' ? api.users.signup(form) : api.users.login(form)
          const ok = await run(() => call)
          if (ok) await onChanged()
        }}
      >
        {mode === 'signup' && (
          <input {...field('nickname')} placeholder="닉네임" maxLength={30} required />
        )}
        <input {...field('email')} type="email" placeholder="이메일" required />
        <input
          {...field('password')}
          type="password"
          placeholder="비밀번호 (8자 이상)"
          minLength={8}
          required
        />
        <button className="btn-primary" type="submit">
          {mode === 'signup' ? '가입하고 로그인' : '로그인'}
        </button>
      </form>
      <p className="muted small">
        Spotify 계정과 무관한 이 서비스의 자체 계정이다. 세션은 서버 메모리에 있어 백엔드를
        재시작하면 풀린다.
      </p>
    </Panel>
  )
}

function PlaylistPanel({ playlists, detail, run, onOpen, onChanged, onClosed, onDeleted }) {
  const [name, setName] = useState('')

  const move = async (index, delta) => {
    const ids = detail.items.map((i) => i.itemId)
    const next = index + delta
    if (next < 0 || next >= ids.length) return
    ;[ids[index], ids[next]] = [ids[next], ids[index]]
    await run(() => api.playlists.reorder(detail.id, ids))
    await onChanged()
  }

  return (
    <Panel title="2. 플레이리스트 API" hint="/api/playlists — 생성 · 담기 · 순서변경 · 공개전환">
      <form
        className="row-form"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!name.trim()) return
          await run(() => api.playlists.create({ name: name.trim() }))
          setName('')
          await onChanged()
        }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="새 플레이리스트 이름"
          maxLength={100}
        />
        <button className="btn-primary" type="submit">만들기</button>
      </form>

      {playlists.length === 0 ? (
        <p className="empty muted">아직 플레이리스트가 없다.</p>
      ) : (
        <ul className="lab-list">
          {playlists.map((p) => (
            <li key={p.id} className={detail?.id === p.id ? 'active' : undefined}>
              <div className="meta">
                <div className="title">{p.name}</div>
                <div className="sub">
                  {p.totalTracks}곡 · 조회 {p.viewCount} · {p.isPublic ? '공개' : '비공개'}
                </div>
              </div>
              <button className="btn-ghost" onClick={() => onOpen(p.id)}>열기</button>
              <button
                className="btn-ghost"
                onClick={async () => {
                  await run(() => api.playlists.update(p.id, { isPublic: !p.isPublic }))
                  await onChanged()
                }}
              >
                {p.isPublic ? '비공개로' : '공개로'}
              </button>
              <button
                className="btn-ghost danger"
                onClick={async () => {
                  await run(() => api.playlists.remove(p.id))
                  await onDeleted()
                }}
              >
                삭제
              </button>
            </li>
          ))}
        </ul>
      )}

      {detail && (
        <div className="detail">
          <div className="row-form">
            <b>{detail.name}</b>
            <span className="muted small">
              totalTracks {detail.totalTracks} · items {detail.items.length}
            </span>
            <button className="btn-ghost" onClick={onClosed}>닫기</button>
          </div>

          {detail.items.length === 0 ? (
            <p className="empty muted">
              비어 있다. 곡을 담으려면 <code>tracks</code> 행이 먼저 있어야 하는데,
              현재 곡을 DB 에 넣는 경로가 없다.
            </p>
          ) : (
            <ol className="lab-list ordered">
              {detail.items.map((item, index) => (
                <li key={item.itemId}>
                  <span className="idx">{item.position}</span>
                  <div className="meta">
                    <div className="title">{item.track.title}</div>
                    <div className="sub">{item.track.artist}</div>
                  </div>
                  <button className="btn-ghost" onClick={() => move(index, -1)} disabled={index === 0}>↑</button>
                  <button
                    className="btn-ghost"
                    onClick={() => move(index, 1)}
                    disabled={index === detail.items.length - 1}
                  >
                    ↓
                  </button>
                  <button
                    className="btn-ghost danger"
                    onClick={async () => {
                      await run(() => api.playlists.removeTrack(detail.id, item.itemId))
                      await onChanged()
                    }}
                  >
                    빼기
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </Panel>
  )
}

function LikePanel({ likes, run, onChanged, onOpen }) {
  const empty = likes.albums.length === 0 && likes.playlists.length === 0

  return (
    <Panel title="3. 좋아요 API" hint="/api/likes — 앨범과 플레이리스트만 담긴다 (곡 좋아요 없음)">
      {empty && (
        <p className="empty muted">
          아직 좋아요가 없다. 공개 플레이리스트는 다른 계정에서 누를 수 있고, 앨범은
          <code> albums </code> 행이 있어야 한다.
        </p>
      )}

      {likes.albums.length > 0 && (
        <ul className="lab-list">
          {likes.albums.map((like) => (
            <li key={like.id}>
              {like.album.thumbnailUrl ? (
                <img src={like.album.thumbnailUrl} alt="" width="40" height="40" />
              ) : (
                <div className="ph40" />
              )}
              <div className="meta">
                <div className="title">{like.album.name}</div>
                <div className="sub">앨범 · {like.album.artist}</div>
              </div>
              <button
                className="btn-ghost danger"
                onClick={async () => {
                  await run(() => api.likes.unlikeAlbum(like.album.id))
                  await onChanged()
                }}
              >
                ♥ 취소
              </button>
            </li>
          ))}
        </ul>
      )}

      {likes.playlists.length > 0 && (
        <ul className="lab-list">
          {likes.playlists.map((like) => (
            <li key={like.id}>
              <div className="meta">
                <div className="title">{like.playlist.name}</div>
                <div className="sub">
                  플레이리스트 · {like.playlist.totalTracks}곡 ·{' '}
                  {like.playlist.isPublic ? '공개' : '비공개(주인이 내림)'}
                </div>
              </div>
              <button className="btn-ghost" onClick={() => onOpen(like.playlist.id)}>열기</button>
              <button
                className="btn-ghost danger"
                onClick={async () => {
                  await run(() => api.likes.unlikePlaylist(like.playlist.id))
                  await onChanged()
                }}
              >
                ♥ 취소
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

function RequestLog({ log, onClear }) {
  return (
    <aside className="lab-log">
      <div className="row-form">
        <h3>요청 로그</h3>
        <button className="btn-ghost" onClick={onClear}>지우기</button>
      </div>
      {log.length === 0 ? (
        <p className="empty muted">아직 호출 없음.</p>
      ) : (
        <ol className="loglist">
          {log.map((e) => (
            <li key={e.id} className={e.ok ? 'ok' : 'fail'}>
              <span className="code">{e.status || 'ERR'}</span>
              <span className="method">{e.method}</span>
              <span className="path">{e.path}</span>
              <span className="ms">{e.ms}ms</span>
              {e.error && <span className="err">{e.error}</span>}
            </li>
          ))}
        </ol>
      )}
    </aside>
  )
}

function Panel({ title, hint, children }) {
  return (
    <section className="panel">
      <h3>{title}</h3>
      {hint && <p className="muted small mono">{hint}</p>}
      {children}
    </section>
  )
}

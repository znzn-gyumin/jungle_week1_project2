import { useEffect, useState } from 'react'
import { api } from '../api.js'
import {
  DEV_PASSWORD,
  forgetAccount,
  isDummyEmail,
  listAccounts,
  nextIdentity,
  saveAccount,
  updateAccount,
} from './accounts.js'
import { catalogApi } from './catalogApi.js'
import { Field, Panel, Reference } from './parts.jsx'

export function AccountPanel({ me, run, onChanged }) {
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({ nickname: '', email: '', password: '' })
  const [patch, setPatch] = useState({ nickname: '', email: '', password: '' })
  const [roster, setRoster] = useState(listAccounts)
  const [busy, setBusy] = useState(false)

  const sync = () => setRoster(listAccounts())

  useEffect(() => {
    if (!me?.loggedIn || !isDummyEmail(me.email)) return
    if (listAccounts().some((a) => a.email === me.email)) return
    saveAccount({
      nickname: me.nickname,
      email: me.email,
      password: DEV_PASSWORD,
      id: me.id,
    })
    setRoster(listAccounts())
  }, [me?.loggedIn, me?.email, me?.nickname, me?.id])

  const field = (state, setState) => (key) => ({
    value: state[key],
    onChange: (e) => setState((f) => ({ ...f, [key]: e.target.value })),
  })
  const signupField = field(form, setForm)
  const patchField = field(patch, setPatch)

  const createDummies = async (count) => {
    setBusy(true)
    await run(async () => {
      for (let i = 0; i < count; i += 1) {
        let created = null
        for (let attempt = 0; attempt < 10 && !created; attempt += 1) {
          const identity = nextIdentity()
          try {
            const user = await api.users.signup(identity)
            saveAccount({ ...identity, id: user.id })
            created = user
          } catch (e) {
            if (e.status !== 409) throw e
          }
        }
        if (!created) throw new Error('닉네임·이메일 중복이 반복돼 더미 계정을 못 만들었다')
      }
    })
    setBusy(false)
    sync()
    await onChanged()
  }

  const switchTo = async (account) => {
    setBusy(true)
    await run(async () => {
      await api.users.logout()
      await api.users.login({ email: account.email, password: account.password })
    })
    setBusy(false)
    await onChanged()
  }

  const removeAccount = async (account) => {
    setBusy(true)
    await run(async () => {
      await api.users.login({ email: account.email, password: account.password })
      await api.users.remove()
    })
    forgetAccount(account.email)
    setBusy(false)
    sync()
    await onChanged()
  }

  const removeAll = async () => {
    if (!window.confirm(`더미 계정 ${roster.length}개와 그 사람들의 플레이리스트·좋아요를 전부 지운다. 진행할까?`)) return
    setBusy(true)
    for (const account of roster) {
      await run(async () => {
        await api.users.login({ email: account.email, password: account.password })
        await api.users.remove()
      })
      forgetAccount(account.email)
    }
    setBusy(false)
    sync()
    await onChanged()
  }

  const submitAuth = async (e) => {
    e.preventDefault()
    const body = mode === 'signup' ? form : { email: form.email, password: form.password }
    const ok = await run(() => (mode === 'signup' ? api.users.signup(body) : api.users.login(body)))
    if (ok) {
      saveAccount({
        nickname: ok.nickname,
        email: form.email.trim().toLowerCase(),
        password: form.password,
        id: ok.id,
      })
      sync()
      await onChanged()
    }
  }

  const submitPatch = async (e) => {
    e.preventDefault()
    const body = Object.fromEntries(Object.entries(patch).filter(([, v]) => v.trim()))
    if (!Object.keys(body).length) return
    const ok = await run(() => api.users.update(body))
    if (ok && me?.email) {
      updateAccount(me.email, {
        ...(body.nickname ? { nickname: body.nickname.trim() } : {}),
        ...(body.email ? { email: body.email.trim().toLowerCase() } : {}),
        ...(body.password ? { password: body.password } : {}),
      })
      sync()
    }
    setPatch({ nickname: '', email: '', password: '' })
    await onChanged()
  }

  return (
    <>
      <Panel
        title="더미 계정"
        hint="유저 관련 동작을 눌러보려면 계정이 여러 개 필요하다. 여기서 만든다."
      >
        <div className="row-form">
          <button className="btn-primary" disabled={busy} onClick={() => createDummies(1)}>
            1명 만들기
          </button>
          <button className="btn-ghost" disabled={busy} onClick={() => createDummies(3)}>
            3명 만들기
          </button>
          {roster.length > 0 && (
            <button className="btn-ghost danger" disabled={busy} onClick={removeAll}>
              전부 삭제 ({roster.length})
            </button>
          )}
        </div>

        <p className="muted small">
          닉네임 <code className="mono">테스터N</code>, 이메일{' '}
          <code className="mono">testerN@devlab.test</code>, 비밀번호는 전부{' '}
          <code className="mono">{DEV_PASSWORD}</code> 로 고정이다. curl 이나 Swagger 에서도
          같은 값으로 로그인할 수 있다. <b>만들면 마지막에 만든 계정으로 로그인된다.</b>
        </p>
        <p className="muted small">
          이 목록은 <code className="mono">localStorage</code> 라 <b>포트가 다르면 따로 논다</b> —
          쿠키는 포트를 무시하므로 5173 과 8000 사이에서 로그인은 유지되는데 목록만 비어 보인다.
          그때는 로그인한 더미 계정이 자동으로 다시 등록되고, 나머지는 같은 비밀번호로
          아래 로그인 폼에서 되찾으면 된다.
        </p>

        {roster.length === 0 ? (
          <p className="empty muted">아직 만든 계정이 없다.</p>
        ) : (
          <ul className="lab-list">
            {roster.map((account) => {
              const current = me?.loggedIn && me.email === account.email
              return (
                <li key={account.email} className={current ? 'active' : undefined}>
                  <div className="meta">
                    <div className="title">
                      {account.nickname || account.email.split('@')[0]}
                      {current && <span className="tag">현재</span>}
                    </div>
                    <div className="sub mono">
                      id {account.id ?? '?'} · {account.email}
                    </div>
                  </div>
                  <button
                    className="btn-ghost"
                    disabled={busy || current}
                    onClick={() => switchTo(account)}
                  >
                    전환
                  </button>
                  <button
                    className="btn-ghost danger"
                    disabled={busy}
                    onClick={() => removeAccount(account)}
                  >
                    삭제
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        <p className="muted small">
          쿠키는 브라우저당 하나라 두 계정을 동시에 붙일 수 없다. <b>전환</b>은 로그아웃 후
          다시 로그인하는 것이고, 이걸로 403 · <code className="mono">viewCount</code> 증가 ·
          남의 공개 플레이리스트 좋아요를 확인한다. 정말 동시에 보려면 시크릿 창을 띄운다.
        </p>
        <p className="muted small">
          <b>삭제</b>는 그 계정으로 로그인한 뒤 <code className="mono">DELETE /api/users/me</code> 를
          부른다. 그 사람의 플레이리스트와 좋아요가 CASCADE 로 함께 사라지고,
          <code className="mono">tracks</code> · <code className="mono">albums</code> 는 공용이라
          남는다.
        </p>
      </Panel>

      <Panel
        title="유저 정보 API"
        hint="이 서비스의 자체 계정이다. 세션은 서버 메모리에 살고 쿠키 이름은 uid 다."
      >
        {!me?.loggedIn && (
          <>
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

            <form className="stack-form" onSubmit={submitAuth}>
              {mode === 'signup' && (
                <Field label="nickname" hint="1–30자, 중복이면 409">
                  <input {...signupField('nickname')} maxLength={30} required />
                </Field>
              )}
              <Field label="email" hint="형식 틀리면 422, 중복이면 409">
                <input {...signupField('email')} type="email" required />
              </Field>
              <Field label="password" hint="8자 미만이면 422">
                <input {...signupField('password')} type="password" minLength={8} required />
              </Field>
              <button className="btn-primary" type="submit">
                {mode === 'signup' ? 'POST /api/users/signup' : 'POST /api/users/login'}
              </button>
            </form>
          </>
        )}

        {me?.loggedIn && (
          <>
            <dl className="kv">
              <dt>id</dt><dd className="mono">{me.id}</dd>
              <dt>nickname</dt><dd>{me.nickname}</dd>
              <dt>email</dt><dd className="mono">{me.email}</dd>
              <dt>createdAt</dt><dd className="mono">{me.createdAt}</dd>
              <dt>counts</dt>
              <dd className="mono">
                playlists {me.counts.playlists} · likes {me.counts.likes}
              </dd>
            </dl>

            <h4 className="section-title">PATCH /api/users/me</h4>
            <p className="muted small">
              채운 필드만 보낸다. 셋 다 비우면 아무것도 안 바뀐다. 더미 계정을 고치면
              위 목록의 저장된 값도 함께 갱신된다.
            </p>
            <form className="stack-form" onSubmit={submitPatch}>
              <Field label="nickname"><input {...patchField('nickname')} maxLength={30} /></Field>
              <Field label="email"><input {...patchField('email')} /></Field>
              <Field label="password"><input {...patchField('password')} type="password" /></Field>
              <button className="btn-primary" type="submit">보낸 필드만 수정</button>
            </form>

            <div className="row-form">
              <button
                className="btn-ghost"
                onClick={async () => {
                  await run(() => api.users.logout())
                  await onChanged()
                }}
              >
                POST /logout
              </button>
              <button
                className="btn-ghost danger"
                onClick={async () => {
                  if (!window.confirm('계정과 그 사람의 플레이리스트·좋아요가 전부 사라진다. 진행할까?')) return
                  const ok = await run(() => api.users.remove())
                  if (ok && me.email) {
                    forgetAccount(me.email)
                    sync()
                  }
                  await onChanged()
                }}
              >
                DELETE /me
              </button>
            </div>
          </>
        )}
      </Panel>

      <Reference section="user" keys={['user']} />
    </>
  )
}

export function CatalogPanel({ playlists, likes, run, onTrackAdded, onLiked }) {
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(10)
  const [source, setSource] = useState('all')
  const [found, setFound] = useState({ tracks: [], albums: [], errors: [] })
  const [target, setTarget] = useState('')
  const [busy, setBusy] = useState(false)

  const likedAlbums = new Set(likes.albums.map((l) => l.album?.id))
  const selected = target || playlists[0]?.id || ''

  return (
    <>
      <Panel
        title="곡 · 앨범"
        hint="제품 API 인 /api/search · /api/albums · /api/tracks 를 그대로 부른다. 검색하면 tracks/albums 에 행이 생기므로, 플레이리스트·좋아요를 눌러보려면 이게 먼저다."
      >
        <form
          className="row-form"
          onSubmit={async (e) => {
            e.preventDefault()
            const q = query.trim()
            if (!q) return
            setBusy(true)
            await run(async () => {
              // 앨범 검색은 iTunes 만 지원한다. youtube 로 좁히면 502 가 나므로 트랙만 부른다.
              const wantAlbums = source !== 'youtube'
              const [tracks, albums] = await Promise.all([
                catalogApi.searchTracks(q, limit, source),
                wantAlbums ? catalogApi.searchAlbums(q, limit, source) : null,
              ])
              setFound({
                tracks: tracks.tracks,
                albums: albums?.albums ?? [],
                errors: [...(tracks.errors ?? []), ...(albums?.errors ?? [])],
              })
            })
            setBusy(false)
          }}
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="곡 제목 / 아티스트"
          />
          <input
            type="number"
            min="1"
            max="50"
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            style={{ maxWidth: 80 }}
          />
          <select value={source} onChange={(e) => setSource(e.target.value)} style={{ maxWidth: 110 }}>
            <option value="all">all</option>
            <option value="itunes">itunes</option>
            <option value="youtube">youtube</option>
          </select>
          <button className="btn-primary" type="submit" disabled={busy}>
            {busy ? '검색 중…' : 'GET /search'}
          </button>
        </form>

        {found.errors.length > 0 && (
          <ul className="lab-log">
            {found.errors.map((e) => (
              <li key={e.source} className="muted small">
                <b className="mono">{e.source}</b> — {e.error}
              </li>
            ))}
          </ul>
        )}

        <div className="row-form">
          <button
            className="btn-ghost"
            onClick={() => run(async () => setFound({ ...found, ...(await catalogApi.tracks()), errors: [] }))}
          >
            GET /tracks
          </button>
          <button
            className="btn-ghost"
            onClick={() => run(async () => setFound({ ...found, ...(await catalogApi.albums()), errors: [] }))}
          >
            GET /albums
          </button>
        </div>

        {playlists.length > 0 && (
          <Field label="담을 플레이리스트">
            <select value={selected} onChange={(e) => setTarget(e.target.value)}>
              {playlists.map((p) => (
                <option key={p.id} value={p.id}>{p.name} (#{p.id})</option>
              ))}
            </select>
          </Field>
        )}

        {found.tracks.length === 0 ? (
          <p className="empty muted">검색하면 결과가 tracks 테이블에 upsert 된다.</p>
        ) : (
          <ul className="lab-list">
            {found.tracks.map((t) => (
              <li key={t.id}>
                {t.thumbnailUrl ? (
                  <img src={t.thumbnailUrl} alt="" width="40" height="40" />
                ) : (
                  <div className="ph40" />
                )}
                <div className="meta">
                  <div className="title">{t.title}</div>
                  <div className="sub mono">id {t.id} · {t.source} · album {t.album?.id ?? 'null'}</div>
                </div>
                {t.playUrl && <audio src={t.playUrl} controls preload="none" />}
                <button
                  className="btn-ghost"
                  disabled={!selected}
                  onClick={async () => {
                    await run(() => api.playlists.addTrack(Number(selected), t.id))
                    await onTrackAdded()
                  }}
                >
                  담기
                </button>
              </li>
            ))}
          </ul>
        )}

        {found.albums.length > 0 && (
          <>
            <h4 className="section-title">앨범 — 좋아요 대상</h4>
            <ul className="lab-list">
              {found.albums.map((a) => (
                <li key={a.id}>
                  {a.thumbnailUrl ? (
                    <img src={a.thumbnailUrl} alt="" width="40" height="40" />
                  ) : (
                    <div className="ph40" />
                  )}
                  <div className="meta">
                    <div className="title">{a.name}</div>
                    <div className="sub mono">id {a.id} · {a.artist}</div>
                  </div>
                  <button className="btn-ghost" onClick={() => run(() => catalogApi.album(a.id))}>
                    GET /albums/{a.id}
                  </button>
                  <button
                    className="btn-ghost"
                    onClick={async () => {
                      const liked = likedAlbums.has(a.id)
                      await run(() =>
                        liked ? api.likes.unlikeAlbum(a.id) : api.likes.likeAlbum(a.id),
                      )
                      await onLiked()
                    }}
                  >
                    {likedAlbums.has(a.id) ? '♥ 취소' : '♡ 좋아요'}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </Panel>

      <Reference section="catalog" keys={['track', 'album']} />
    </>
  )
}

export function PlaylistPanel({
  playlists,
  publicList,
  detail,
  run,
  onOpen,
  onChanged,
  onClosed,
  onLoadPublic,
}) {
  const [create, setCreate] = useState({ name: '', description: '', isPublic: false })
  const [edit, setEdit] = useState({ name: '', description: '' })
  const [lookup, setLookup] = useState('')

  const move = async (index, delta) => {
    const ids = detail.items.map((i) => i.itemId)
    const next = index + delta
    if (next < 0 || next >= ids.length) return
    ;[ids[index], ids[next]] = [ids[next], ids[index]]
    await run(() => api.playlists.reorder(detail.id, ids))
    await onChanged()
  }

  return (
    <>
      <Panel title="플레이리스트 API" hint="곡은 '곡 · 앨범 (임시)' 탭에서 담는다.">
        <form
          className="stack-form"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!create.name.trim()) return
            await run(() => api.playlists.create({ ...create, name: create.name.trim() }))
            setCreate({ name: '', description: '', isPublic: false })
            await onChanged()
          }}
        >
          <Field label="name" hint="1–100자, 필수">
            <input
              value={create.name}
              onChange={(e) => setCreate((c) => ({ ...c, name: e.target.value }))}
              maxLength={100}
            />
          </Field>
          <Field label="description" hint="생략 가능">
            <input
              value={create.description}
              onChange={(e) => setCreate((c) => ({ ...c, description: e.target.value }))}
            />
          </Field>
          <label className="check">
            <input
              type="checkbox"
              checked={create.isPublic}
              onChange={(e) => setCreate((c) => ({ ...c, isPublic: e.target.checked }))}
            />
            isPublic
          </label>
          <button className="btn-primary" type="submit">POST /api/playlists</button>
        </form>

        <div className="row-form">
          <button className="btn-ghost" onClick={onLoadPublic}>GET /api/playlists/public</button>
        </div>

        <form
          className="row-form"
          onSubmit={(e) => {
            e.preventDefault()
            if (lookup) onOpen(Number(lookup))
          }}
        >
          <input
            value={lookup}
            onChange={(e) => setLookup(e.target.value)}
            placeholder="playlistId"
            type="number"
          />
          <button className="btn-ghost" type="submit">id 로 열기</button>
        </form>
        <p className="muted small">
          남의 id 를 넣어보면 공개면 200(그리고 <code className="mono">viewCount</code> +1),
          비공개면 403, 없으면 404 다. 더미 계정 탭에서 전환해 가며 확인한다.
        </p>

        {publicList.length > 0 && (
          <>
            <h4 className="section-title">공개 목록 — viewCount 내림차순</h4>
            <ul className="lab-list">
              {publicList.map((p) => (
                <li key={p.id}>
                  <div className="meta">
                    <div className="title">{p.name}</div>
                    <div className="sub mono">
                      id {p.id} · userId {p.userId} · views {p.viewCount} · tracks {p.totalTracks}
                    </div>
                  </div>
                  <button className="btn-ghost" onClick={() => onOpen(p.id)}>열기</button>
                  <button
                    className="btn-ghost"
                    onClick={async () => {
                      await run(() => api.likes.likePlaylist(p.id))
                      await onChanged()
                    }}
                  >
                    ♡ 좋아요
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        <h4 className="section-title">내 플레이리스트</h4>
        {playlists.length === 0 ? (
          <p className="empty muted">아직 없다.</p>
        ) : (
          <ul className="lab-list">
            {playlists.map((p) => (
              <li key={p.id} className={detail?.id === p.id ? 'active' : undefined}>
                <div className="meta">
                  <div className="title">{p.name}</div>
                  <div className="sub mono">
                    id {p.id} · tracks {p.totalTracks} · views {p.viewCount} ·{' '}
                    {p.isPublic ? 'public' : 'private'}
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
                  isPublic 토글
                </button>
                <button
                  className="btn-ghost danger"
                  onClick={async () => {
                    await run(() => api.playlists.remove(p.id))
                    onClosed()
                    await onChanged()
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
              <span className="muted small mono">
                totalTracks {detail.totalTracks} · items {detail.items.length} · isOwner{' '}
                {String(detail.isOwner)} · viewCount {detail.viewCount}
              </span>
              <button className="btn-ghost" onClick={onClosed}>닫기</button>
            </div>

            {detail.isOwner && (
              <form
                className="row-form"
                onSubmit={async (e) => {
                  e.preventDefault()
                  const body = Object.fromEntries(
                    Object.entries(edit).filter(([, v]) => v.trim()),
                  )
                  if (!Object.keys(body).length) return
                  await run(() => api.playlists.update(detail.id, body))
                  setEdit({ name: '', description: '' })
                  await onChanged()
                }}
              >
                <input
                  value={edit.name}
                  onChange={(e) => setEdit((c) => ({ ...c, name: e.target.value }))}
                  placeholder="새 name"
                  maxLength={100}
                />
                <input
                  value={edit.description}
                  onChange={(e) => setEdit((c) => ({ ...c, description: e.target.value }))}
                  placeholder="새 description"
                />
                <button className="btn-primary" type="submit">PATCH</button>
              </form>
            )}

            {detail.items.length === 0 ? (
              <p className="empty muted">비어 있다.</p>
            ) : (
              <ol className="lab-list ordered">
                {detail.items.map((item, index) => (
                  <li key={item.itemId}>
                    <span className="idx">{item.position}</span>
                    <div className="meta">
                      <div className="title">{item.track.title}</div>
                      <div className="sub mono">
                        itemId {item.itemId} · trackId {item.track.id}
                      </div>
                    </div>
                    {detail.isOwner && (
                      <>
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
                      </>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </Panel>

      <Reference section="playlists" keys={['playlist', 'playlistItem', 'track']} />
    </>
  )
}

export function LikePanel({ likes, run, onChanged, onOpen }) {
  const [albumId, setAlbumId] = useState('')
  const empty = likes.albums.length === 0 && likes.playlists.length === 0

  return (
    <>
      <Panel
        title="좋아요 API"
        hint="앨범과 플레이리스트만 담긴다. 곡 좋아요는 스키마에 없다 (likes 는 album_id / playlist_id 중 정확히 하나)."
      >
        <form
          className="row-form"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!albumId) return
            await run(() => api.likes.likeAlbum(Number(albumId)))
            await onChanged()
          }}
        >
          <input
            value={albumId}
            onChange={(e) => setAlbumId(e.target.value)}
            placeholder="albumId"
            type="number"
          />
          <button className="btn-primary" type="submit">PUT /api/likes/albums/:id</button>
          <button
            className="btn-ghost"
            type="button"
            onClick={async () => {
              if (!albumId) return
              await run(() => api.likes.unlikeAlbum(Number(albumId)))
              await onChanged()
            }}
          >
            DELETE
          </button>
        </form>
        <p className="muted small">
          같은 id 로 PUT 을 두 번 보내면 두 번째는 <code className="mono">created: false</code> 다.
          중복 체크를 앱이 아니라 UNIQUE 제약에 맡긴 결과라 에러가 아니다.
        </p>

        {empty && <p className="empty muted">아직 좋아요가 없다.</p>}

        {likes.albums.length > 0 && (
          <>
            <h4 className="section-title">앨범 {likes.albums.length}건</h4>
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
                    <div className="sub mono">albumId {like.album.id} · {like.createdAt}</div>
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
          </>
        )}

        {likes.playlists.length > 0 && (
          <>
            <h4 className="section-title">플레이리스트 {likes.playlists.length}건</h4>
            <ul className="lab-list">
              {likes.playlists.map((like) => (
                <li key={like.id}>
                  <div className="meta">
                    <div className="title">{like.playlist.name}</div>
                    <div className="sub mono">
                      playlistId {like.playlist.id} · isPublic {String(like.playlist.isPublic)}
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
          </>
        )}
      </Panel>

      <Reference section="likes" keys={['like', 'album', 'playlist']} />
    </>
  )
}

export function ErrorPanel({ me, playlists, run, onChanged }) {
  const mine = playlists[0]

  const cases = [
    {
      status: 409,
      label: '이미 쓰는 이메일로 가입',
      disabled: !me?.loggedIn,
      call: () =>
        api.users.signup({ nickname: `dup${Date.now() % 100000}`, email: me.email, password: 'pw12345678' }),
    },
    {
      status: 422,
      label: '이메일 형식 위반',
      call: () => api.users.signup({ nickname: 'bad', email: 'not-an-email', password: 'pw12345678' }),
    },
    {
      status: 422,
      label: '비밀번호 8자 미만',
      call: () => api.users.signup({ nickname: 'bad', email: `x${Date.now()}@ex.com`, password: 'short' }),
    },
    { status: 404, label: '없는 플레이리스트 조회', call: () => api.playlists.detail(99999999) },
    {
      status: 404,
      label: '없는 곡 담기',
      disabled: !mine,
      call: () => api.playlists.addTrack(mine.id, 99999999),
    },
    { status: 404, label: '없는 앨범 좋아요', call: () => api.likes.likeAlbum(99999999) },
    {
      status: 400,
      label: '순서 배열에 항목 누락',
      disabled: !mine,
      call: () => api.playlists.reorder(mine.id, []),
    },
  ]

  return (
    <>
      <Panel
        title="실패 응답 모아보기"
        hint="일부러 실패시키는 버튼이다. 누른 뒤 오른쪽 로그에서 행을 펼치면 실제 응답 본문이 보인다."
      >
        <ul className="lab-list">
          {cases.map((c) => (
            <li key={c.label}>
              <span className="code fail-code">{c.status}</span>
              <div className="meta"><div className="title">{c.label}</div></div>
              <button
                className="btn-ghost"
                disabled={c.disabled}
                onClick={() => run(c.call).catch(() => {})}
              >
                호출
              </button>
            </li>
          ))}
        </ul>

        <h4 className="section-title">401 · 403 은 상태를 바꿔야 나온다</h4>
        <ul className="lab-list">
          <li>
            <span className="code fail-code">401</span>
            <div className="meta">
              <div className="title">로그아웃한 채로 GET /api/playlists</div>
              <div className="sub">누르면 실제로 로그아웃된다. 다시 로그인해야 한다.</div>
            </div>
            <button
              className="btn-ghost danger"
              disabled={!me?.loggedIn}
              onClick={async () => {
                await run(() => api.users.logout())
                await run(() => api.playlists.list())
                await onChanged()
              }}
            >
              호출
            </button>
          </li>
          <li>
            <span className="code fail-code">403</span>
            <div className="meta">
              <div className="title">남의 비공개 플레이리스트 열기</div>
              <div className="sub">
                유저 탭에서 더미 계정을 만들어 전환한 뒤, 플레이리스트 탭의
                'id 로 열기' 에 앞 계정의 비공개 리스트 id 를 넣는다.
              </div>
            </div>
          </li>
        </ul>
      </Panel>

      <Reference section="errors" keys={[]} />
    </>
  )
}

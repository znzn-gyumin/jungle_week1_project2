import { useState } from 'react'
import { api } from '../api.js'
import { catalogApi } from './catalogApi.js'
import { Field, Panel, Reference } from './parts.jsx'

const SAVED_ACCOUNTS = 'devlab:accounts'

function readAccounts() {
  try {
    return JSON.parse(localStorage.getItem(SAVED_ACCOUNTS) ?? '[]')
  } catch {
    return []
  }
}

function rememberAccount(email, password) {
  const kept = readAccounts().filter((a) => a.email !== email)
  localStorage.setItem(SAVED_ACCOUNTS, JSON.stringify([{ email, password }, ...kept].slice(0, 4)))
}

export function AccountPanel({ me, run, onChanged }) {
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({ nickname: '', email: '', password: '' })
  const [patch, setPatch] = useState({ nickname: '', email: '', password: '' })
  const accounts = readAccounts()

  const field = (state, setState) => (key) => ({
    value: state[key],
    onChange: (e) => setState((f) => ({ ...f, [key]: e.target.value })),
  })
  const signupField = field(form, setForm)
  const patchField = field(patch, setPatch)

  const submitAuth = async (e) => {
    e.preventDefault()
    const body = mode === 'signup' ? form : { email: form.email, password: form.password }
    const ok = await run(() => (mode === 'signup' ? api.users.signup(body) : api.users.login(body)))
    if (ok) {
      rememberAccount(form.email.trim().toLowerCase(), form.password)
      await onChanged()
    }
  }

  const switchTo = async (account) => {
    await run(() => api.users.logout())
    const ok = await run(() => api.users.login(account))
    if (ok) await onChanged()
  }

  return (
    <>
      <Panel
        title="유저 정보 API"
        hint="이 서비스의 자체 계정이다. Spotify 로그인과 별개이고 쿠키 이름이 uid 다."
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
            <p className="muted small">채운 필드만 보낸다. 셋 다 비우면 아무것도 안 바뀐다.</p>
            <form
              className="stack-form"
              onSubmit={async (e) => {
                e.preventDefault()
                const body = Object.fromEntries(
                  Object.entries(patch).filter(([, v]) => v.trim()),
                )
                if (!Object.keys(body).length) return
                await run(() => api.users.update(body))
                setPatch({ nickname: '', email: '', password: '' })
                await onChanged()
              }}
            >
              <Field label="nickname"><input {...patchField('nickname')} maxLength={30} /></Field>
              <Field label="email"><input {...patchField('email')} /></Field>
              <Field label="password" hint="바꾸면 저장해둔 비밀번호와 달라진다">
                <input {...patchField('password')} type="password" />
              </Field>
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
                  await run(() => api.users.remove())
                  await onChanged()
                }}
              >
                DELETE /me
              </button>
            </div>
          </>
        )}

        {accounts.length > 0 && (
          <>
            <h4 className="section-title">계정 전환</h4>
            <p className="muted small">
              쿠키는 브라우저당 하나라 두 계정을 동시에 붙일 수 없다. 여기서 갈아타면
              403 · viewCount · 남의 플레이리스트 좋아요를 확인할 수 있다.
              동시에 보려면 시크릿 창을 따로 띄운다.
            </p>
            <div className="row-form">
              {accounts.map((a) => (
                <button
                  key={a.email}
                  className="btn-ghost"
                  disabled={me?.email === a.email}
                  onClick={() => switchTo(a)}
                >
                  {a.email}
                  {me?.email === a.email ? ' (현재)' : ''}
                </button>
              ))}
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
  const [country, setCountry] = useState('KR')
  const [found, setFound] = useState({ tracks: [], albums: [], cached: null })
  const [target, setTarget] = useState('')
  const [busy, setBusy] = useState(false)

  const likedAlbums = new Set(likes.albums.map((l) => l.album?.id))
  const selected = target || playlists[0]?.id || ''

  return (
    <>
      <Panel
        title="곡 · 앨범 (임시)"
        hint="배포 전 삭제 대상. tracks/albums 에 행을 만들어 두는 용도다 — 플레이리스트·좋아요를 눌러보려면 이게 먼저다."
      >
        <form
          className="row-form"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!query.trim()) return
            setBusy(true)
            await run(async () => setFound(await catalogApi.search(query.trim(), limit, country)))
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
          <input
            value={country}
            onChange={(e) => setCountry(e.target.value.toUpperCase())}
            maxLength={2}
            style={{ maxWidth: 70 }}
          />
          <button className="btn-primary" type="submit" disabled={busy}>
            {busy ? '검색 중…' : 'GET /search'}
          </button>
        </form>

        {found.cached !== null && (
          <p className="muted small">
            <b className="mono">cached: {String(found.cached)}</b> — true 면 24시간 캐시에서 꺼낸
            것이라 iTunes 를 호출하지 않았다 (IP 당 약 20회/분 제한 회피).
          </p>
        )}

        <div className="row-form">
          <button
            className="btn-ghost"
            onClick={() => run(async () => setFound({ ...(await catalogApi.tracks()), albums: found.albums, cached: null }))}
          >
            GET /tracks
          </button>
          <button
            className="btn-ghost"
            onClick={() => run(async () => setFound({ tracks: found.tracks, ...(await catalogApi.albums()), cached: null }))}
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
                  <div className="sub mono">id {t.id} · {t.source} · album {t.albumId ?? 'null'}</div>
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
                유저 탭의 '계정 전환' 으로 다른 계정이 된 뒤, 플레이리스트 탭에서 앞 계정의
                비공개 리스트 id 를 연다.
              </div>
            </div>
          </li>
        </ul>
      </Panel>

      <Reference section="errors" keys={[]} />
    </>
  )
}

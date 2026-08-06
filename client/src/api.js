const listeners = new Set()

export function onApiEvent(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function emit(event) {
  for (const fn of listeners) fn(event)
}

async function request(path, init) {
  const method = init?.method ?? 'GET'
  const startedAt = performance.now()
  let res
  try {
    res = await fetch(path, { credentials: 'same-origin', ...init })
  } catch (e) {
    emit({ method, path, status: 0, ms: 0, ok: false, error: e.message })
    throw e
  }

  const text = await res.text()
  const data = text ? JSON.parse(text) : null
  const event = {
    method,
    path,
    status: res.status,
    ms: Math.round(performance.now() - startedAt),
    ok: res.ok,
    error: res.ok ? null : (data?.error ?? res.statusText),
  }
  emit(event)

  if (!res.ok) {
    throw Object.assign(new Error(event.error), { status: res.status, data })
  }
  return data
}

const json = (method, body) => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

const qs = (params) =>
  new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null),
  ).toString()

export const api = {
  me: () => request('/api/auth/me'),
  token: () => request('/api/auth/token'),
  logout: () => request('/api/auth/logout', { method: 'POST' }),

  search: (q, type) => request(`/api/search?${qs({ q, type })}`),

  artistTopTracks: (id) => request(`/api/artists/${id}/top-tracks`),

  transfer: (deviceId) => request('/api/player/transfer', json('PUT', { deviceId })),

  play: (deviceId, uris) => request('/api/player/play', json('PUT', { deviceId, uris })),

  pause: (deviceId) => request(`/api/player/pause?${qs({ deviceId })}`, { method: 'PUT' }),

  health: () => request('/api/health'),

  users: {
    signup: (body) => request('/api/users/signup', json('POST', body)),
    login: (body) => request('/api/users/login', json('POST', body)),
    logout: () => request('/api/users/logout', { method: 'POST' }),
    me: () => request('/api/users/me'),
    update: (body) => request('/api/users/me', json('PATCH', body)),
    remove: () => request('/api/users/me', { method: 'DELETE' }),
  },

  playlists: {
    list: () => request('/api/playlists'),
    public: () => request('/api/playlists/public'),
    create: (body) => request('/api/playlists', json('POST', body)),
    detail: (id) => request(`/api/playlists/${id}`),
    update: (id, body) => request(`/api/playlists/${id}`, json('PATCH', body)),
    remove: (id) => request(`/api/playlists/${id}`, { method: 'DELETE' }),
    addTrack: (id, trackId) =>
      request(`/api/playlists/${id}/tracks`, json('POST', { trackId })),
    removeTrack: (id, itemId) =>
      request(`/api/playlists/${id}/tracks/${itemId}`, { method: 'DELETE' }),
    reorder: (id, itemIds) =>
      request(`/api/playlists/${id}/tracks/order`, json('PUT', { itemIds })),
  },

  likes: {
    list: () => request('/api/likes'),
    likeAlbum: (id) => request(`/api/likes/albums/${id}`, { method: 'PUT' }),
    unlikeAlbum: (id) => request(`/api/likes/albums/${id}`, { method: 'DELETE' }),
    likePlaylist: (id) => request(`/api/likes/playlists/${id}`, { method: 'PUT' }),
    unlikePlaylist: (id) => request(`/api/likes/playlists/${id}`, { method: 'DELETE' }),
  },
}

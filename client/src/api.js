async function request(path, init) {
  const res = await fetch(path, { credentials: 'same-origin', ...init })
  const text = await res.text()

  let data = null
  let parseFailed = false
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      parseFailed = true
    }
  }

  if (!res.ok) {
    const message = data?.error ?? (parseFailed ? text.slice(0, 200) : '') ?? ''
    throw Object.assign(new Error(message || res.statusText), { status: res.status, data })
  }
  if (parseFailed) {
    throw Object.assign(new Error('JSON 이 아닌 응답'), { status: res.status, data: text })
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
  health: {
    check: () => request('/api/health'),
    db: () => request('/api/health/db'),
  },

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

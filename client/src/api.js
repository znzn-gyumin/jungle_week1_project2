async function request(path, init) {
  const res = await fetch(path, { credentials: 'same-origin', ...init })
  const text = await res.text()
  const data = text ? JSON.parse(text) : null
  if (!res.ok) throw Object.assign(new Error(data?.error ?? res.statusText), { status: res.status, data })
  return data
}

export const api = {
  me: () => request('/api/auth/me'),
  token: () => request('/api/auth/token'),
  logout: () => request('/api/auth/logout', { method: 'POST' }),

  search: (q, type) =>
    request(`/api/search?q=${encodeURIComponent(q)}&type=${encodeURIComponent(type)}`),

  artistTopTracks: (id) => request(`/api/artists/${id}/top-tracks`),

  transfer: (deviceId) =>
    request('/api/player/transfer', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId }),
    }),

  play: (deviceId, uris) =>
    request('/api/player/play', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId, uris }),
    }),

  pause: (deviceId) =>
    request(`/api/player/pause?deviceId=${encodeURIComponent(deviceId)}`, { method: 'PUT' }),
}

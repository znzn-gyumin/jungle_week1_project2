async function request(path, init) {
  const res = await fetch(path, { credentials: 'same-origin', ...init })
  const text = await res.text()
  const data = text ? JSON.parse(text) : null
  if (!res.ok) throw Object.assign(new Error(data?.error ?? res.statusText), { status: res.status, data })
  return data
}

export const api = {
  health: () => request('/api/health'),

  search: (q, source = 'all', limit = 25) =>
    request(
      `/api/search?q=${encodeURIComponent(q)}&source=${encodeURIComponent(source)}&limit=${limit}`,
    ),

  recentTracks: (source) =>
    request(`/api/tracks${source ? `?source=${encodeURIComponent(source)}` : ''}`),
}

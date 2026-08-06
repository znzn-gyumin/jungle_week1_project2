async function request(path) {
  const res = await fetch(path, { credentials: 'same-origin' })
  const text = await res.text()
  const data = text ? JSON.parse(text) : null
  if (!res.ok) throw Object.assign(new Error(data?.error ?? res.statusText), { status: res.status, data })
  return data
}

const qs = (params) =>
  new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  ).toString()

export const catalogApi = {
  searchTracks: (q, limit, source) =>
    request(`/api/search?${qs({ q, limit, source, type: 'track' })}`),
  searchAlbums: (q, limit, source) =>
    request(`/api/search?${qs({ q, limit, source, type: 'album' })}`),
  tracks: (limit = 20) => request(`/api/tracks?${qs({ limit })}`),
  albums: (limit = 20) => request(`/api/albums?${qs({ limit })}`),
  album: (id) => request(`/api/albums/${id}`),
  track: (id) => request(`/api/tracks/${id}`),
}

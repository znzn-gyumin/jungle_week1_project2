async function request(path) {
  const res = await fetch(path, { credentials: 'same-origin' })
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

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
  search: (q, limit, country) => request(`/api/catalog/search?${qs({ q, limit, country })}`),
  tracks: (limit = 20) => request(`/api/catalog/tracks?${qs({ limit })}`),
  albums: (limit = 20) => request(`/api/catalog/albums?${qs({ limit })}`),
  album: (id) => request(`/api/catalog/albums/${id}`),
}

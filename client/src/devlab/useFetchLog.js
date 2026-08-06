import { useEffect, useState } from 'react'

const LIMIT = 100

const listeners = new Set()
let installed = false

function install() {
  if (installed) return
  installed = true

  const original = window.fetch
  window.fetch = async (input, init) => {
    const raw = typeof input === 'string' ? input : input.url
    const url = new URL(raw, window.location.origin)
    if (!url.pathname.startsWith('/api/')) return original(input, init)

    const method = (init?.method ?? (typeof input === 'string' ? 'GET' : input.method) ?? 'GET')
      .toUpperCase()

    let requestBody = null
    try {
      requestBody = init?.body ? JSON.parse(init.body) : null
    } catch {
      requestBody = String(init.body)
    }

    const startedAt = performance.now()
    let res
    try {
      res = await original(input, init)
    } catch (e) {
      emit({ method, path: url.pathname + url.search, status: 0, ok: false, ms: 0, requestBody, responseBody: null, error: e.message })
      throw e
    }

    let responseBody = null
    try {
      responseBody = await res.clone().json()
    } catch {
      responseBody = null
    }

    emit({
      method,
      path: url.pathname + url.search,
      status: res.status,
      ok: res.ok,
      ms: Math.round(performance.now() - startedAt),
      requestBody,
      responseBody,
      error: res.ok ? null : (responseBody?.error ?? res.statusText),
    })
    return res
  }
}

function emit(entry) {
  const full = { ...entry, id: crypto.randomUUID() }
  for (const fn of listeners) fn(full)
}

install()

export function useFetchLog() {
  const [log, setLog] = useState([])

  useEffect(() => {
    const push = (entry) => setLog((prev) => [entry, ...prev].slice(0, LIMIT))
    listeners.add(push)
    return () => listeners.delete(push)
  }, [])

  return [log, () => setLog([])]
}

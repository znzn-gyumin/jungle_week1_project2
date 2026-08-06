import { useCallback, useEffect, useState } from 'react'
import { api } from '../api.js'

const PENDING = { state: 'pending', label: '확인 중…' }

function Badge({ name, path, status }) {
  return (
    <span className={`hbadge ${status.state}`} title={path}>
      <b>{name}</b>
      <span>{status.label}</span>
    </span>
  )
}

export default function HealthBar() {
  const [server, setServer] = useState(PENDING)
  const [youtube, setYoutube] = useState(PENDING)
  const [db, setDb] = useState(PENDING)

  const check = useCallback(async () => {
    setServer(PENDING)
    setYoutube(PENDING)
    setDb(PENDING)

    try {
      const res = await api.health.check()
      setServer({ state: 'ok', label: 'up' })
      setYoutube(
        res.youtube
          ? { state: 'ok', label: 'on' }
          : { state: 'warn', label: 'off — iTunes 만' },
      )
    } catch (e) {
      const label = e.status ? `${e.status}` : '연결 실패'
      setServer({ state: 'bad', label })
      setYoutube({ state: 'bad', label: '확인 불가' })
    }

    try {
      const res = await api.health.db()
      setDb(
        res.tables > 0
          ? { state: 'ok', label: `${res.tables} tables` }
          : { state: 'warn', label: '0 tables — 마이그레이션 필요' },
      )
    } catch (e) {
      setDb({ state: 'bad', label: e.status ? `${e.status}` : '연결 실패' })
    }
  }, [])

  useEffect(() => {
    check()
  }, [check])

  return (
    <div className="healthbar">
      <Badge name="api" path="GET /api/health" status={server} />
      <Badge name="db" path="GET /api/health/db" status={db} />
      <Badge name="youtube" path="GET /api/health — youtube 필드" status={youtube} />
      <button className="btn-ghost" onClick={check}>다시 확인</button>
    </div>
  )
}

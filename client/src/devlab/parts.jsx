import { useState } from 'react'
import { ENDPOINTS, ERROR_SHAPE, RESPONSE_KEYS } from './meta.js'

export function Panel({ title, hint, children }) {
  return (
    <section className="panel">
      <h3>{title}</h3>
      {hint && <p className="muted small">{hint}</p>}
      {children}
    </section>
  )
}

export function Reference({ section, keys }) {
  const [tab, setTab] = useState('endpoints')

  return (
    <section className="panel reference">
      <div className="tabs">
        {[
          ['endpoints', '엔드포인트'],
          ['keys', '응답 키 사전'],
          ['errors', '에러 형식'],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={tab === key ? 'tab active' : 'tab'}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'endpoints' && <EndpointTable rows={ENDPOINTS[section] ?? []} />}
      {tab === 'keys' && (keys ?? []).map((k) => <KeyTable key={k} spec={RESPONSE_KEYS[k]} />)}
      {tab === 'errors' && <ErrorNote />}
    </section>
  )
}

function EndpointTable({ rows }) {
  if (!rows.length) return <p className="empty muted">해당 없음.</p>
  return (
    <table className="reftable">
      <thead>
        <tr><th>Method</th><th>Path</th><th>Body</th><th>메모</th></tr>
      </thead>
      <tbody>
        {rows.map(([method, path, body, note]) => (
          <tr key={method + path}>
            <td className="mono">{method}</td>
            <td className="mono">{path}</td>
            <td className="mono">{body || '—'}</td>
            <td>{note || '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function KeyTable({ spec }) {
  if (!spec) return null
  return (
    <>
      <h4 className="section-title">{spec.title}</h4>
      <table className="reftable">
        <thead>
          <tr><th>키</th><th>타입</th><th>메모</th></tr>
        </thead>
        <tbody>
          {spec.rows.map(([key, type, note]) => (
            <tr key={key}>
              <td className="mono">{key}</td>
              <td className="mono muted">{type}</td>
              <td>{note || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

function ErrorNote() {
  return (
    <div className="block">
      <p className="muted small">
        실패 응답은 status 와 무관하게 항상 같은 모양이다. FastAPI 기본 <code>detail</code> 이
        아니라 <code>error</code> 키를 쓴다.
      </p>
      <pre>{ERROR_SHAPE}</pre>
      <table className="reftable">
        <thead><tr><th>status</th><th>언제</th></tr></thead>
        <tbody>
          <tr><td className="mono">401</td><td>쿠키가 없거나 세션이 끊김. <code>credentials</code> 빠뜨렸을 때도 이것</td></tr>
          <tr><td className="mono">403</td><td>남의 리소스. 존재는 하지만 권한이 없음</td></tr>
          <tr><td className="mono">404</td><td>없는 id</td></tr>
          <tr><td className="mono">409</td><td>닉네임·이메일 중복</td></tr>
          <tr><td className="mono">422</td><td>형식 위반. <code>error</code> 에 필드명이 들어간다</td></tr>
        </tbody>
      </table>
    </div>
  )
}

export function Field({ label, hint, children }) {
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {hint && <em className="muted small"> {hint}</em>}
      </span>
      {children}
    </label>
  )
}

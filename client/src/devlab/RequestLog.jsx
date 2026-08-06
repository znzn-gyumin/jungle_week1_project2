import { useState } from 'react'
import { buildSnippet } from './meta.js'

export function RequestLog({ log, onClear }) {
  const [openId, setOpenId] = useState(null)

  return (
    <aside className="lab-log">
      <div className="row-form">
        <h3>요청 로그</h3>
        <span className="muted small">{log.length}건</span>
        <button className="btn-ghost" onClick={onClear}>지우기</button>
      </div>
      <p className="muted small">행을 누르면 요청·응답 본문과 fetch 코드가 펼쳐진다.</p>

      {log.length === 0 ? (
        <p className="empty muted">아직 호출 없음.</p>
      ) : (
        <ol className="loglist">
          {log.map((e) => (
            <li key={e.id} className={e.ok ? 'ok' : 'fail'}>
              <button
                className="logrow"
                onClick={() => setOpenId(openId === e.id ? null : e.id)}
              >
                <span className="code">{e.status || 'ERR'}</span>
                <span className="method">{e.method}</span>
                <span className="path">{e.path}</span>
                <span className="ms">{e.ms}ms</span>
              </button>
              {e.error && <div className="err">{e.error}</div>}
              {openId === e.id && <LogDetail entry={e} />}
            </li>
          ))}
        </ol>
      )}
    </aside>
  )
}

function LogDetail({ entry }) {
  return (
    <div className="logdetail">
      {entry.requestBody && <Block label="요청 body" value={pretty(entry.requestBody)} />}
      <Block label="응답 body" value={entry.responseBody ? pretty(entry.responseBody) : '(본문 없음)'} />
      <Block
        label="이 호출의 fetch 코드"
        value={buildSnippet(entry.method, entry.path, entry.requestBody)}
      />
    </div>
  )
}

function Block({ label, value }) {
  const [copied, setCopied] = useState(false)

  return (
    <div className="block">
      <div className="block-head">
        <span className="muted small">{label}</span>
        <button
          className="btn-ghost tiny"
          onClick={() => {
            navigator.clipboard?.writeText(value)
            setCopied(true)
            setTimeout(() => setCopied(false), 1200)
          }}
        >
          {copied ? '복사됨' : '복사'}
        </button>
      </div>
      <pre>{value}</pre>
    </div>
  )
}

function pretty(value) {
  return JSON.stringify(value, null, 2)
}

import { useState } from 'react'
import ApiLab from './ApiLab.jsx'
import './devlab.css'

const VIEWS = [
  { key: 'app', label: 'Spotify 플레이어' },
  { key: 'lab', label: 'API 확인' },
]

const VIEW_KEY = 'devlab:view'

export default function DevLabRoot({ app }) {
  const [view, setView] = useState(() => localStorage.getItem(VIEW_KEY) ?? 'app')

  const choose = (key) => {
    localStorage.setItem(VIEW_KEY, key)
    setView(key)
  }

  return (
    <>
      <nav className="viewswitch">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            type="button"
            className={v.key === view ? 'tab active' : 'tab'}
            onClick={() => choose(v.key)}
          >
            {v.label}
          </button>
        ))}
      </nav>
      {view === 'lab' ? <ApiLab /> : app}
    </>
  )
}

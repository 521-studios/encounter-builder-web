import { useEffect, useRef, useState } from 'react'
import { pfsrd2 } from '../api/pfsrd2.js'
import { errorMessage } from '../api/errors.js'

// Debounced autocomplete over pfsrd2 monsters/NPCs. Calls onPick(suggestion)
// where suggestion = { game_id, name, level, edition, ... }.
export default function MonsterSearch({ onPick, disabled }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [error, setError] = useState(null)
  const seq = useRef(0)

  useEffect(() => {
    const query = q.trim()
    if (query.length < 2) {
      setResults([])
      return
    }
    const mine = ++seq.current
    const t = setTimeout(() => {
      pfsrd2
        .suggestMonsters(query)
        .then((r) => {
          if (mine === seq.current) setResults(Array.isArray(r) ? r : [])
        })
        .catch((e) => mine === seq.current && setError(errorMessage(e)))
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  return (
    <div className="monster-search grow">
      <input
        placeholder="search a monster…"
        value={q}
        disabled={disabled}
        onChange={(e) => {
          setError(null)
          setQ(e.target.value)
        }}
      />
      {error && <p className="error">{error}</p>}
      {results.length > 0 && (
        <ul className="suggestions">
          {results.map((r) => (
            <li key={r.game_id}>
              <button
                type="button"
                onClick={() => {
                  onPick(r)
                  setQ('')
                  setResults([])
                }}
              >
                {r.name}
                {r.level != null && <span className="muted"> · lvl {r.level}</span>}
                {r.edition && <span className="muted"> · {r.edition}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

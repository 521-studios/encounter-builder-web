import { useState } from 'react'
import { ADJUSTMENTS } from '../model.js'
import MonsterSearch from './MonsterSearch.jsx'
import CreatureView from './CreatureView.jsx'

// One monster row. Before a monster is chosen, a pfsrd2 search picker fills the
// ref (and seeds the nickname with the monster's name). Once chosen: count,
// elite/weak, an editable nickname, and a toggleable stat-block preview.
export default function MonsterLine({ monster, disabled, onChange, onRemove }) {
  const set = (fields) => onChange({ ...monster, ...fields })
  const gameId = monster.ref?.game_id || ''
  const [showBlock, setShowBlock] = useState(false)

  if (!gameId) {
    return (
      <div className="line monster-line">
        <MonsterSearch
          disabled={disabled}
          onPick={(m) => set({ ref: { game_id: m.game_id }, nickname: monster.nickname || m.name })}
        />
        {!disabled && (
          <button type="button" className="link danger" onClick={onRemove}>Remove</button>
        )}
      </div>
    )
  }

  return (
    <div className="monster-line-wrap">
      <div className="line monster-line">
        <span className="picked grow">{monster.nickname || gameId}</span>
        {!disabled && (
          <button type="button" className="link" onClick={() => set({ ref: { game_id: '' } })}>change</button>
        )}
        <input
          type="number"
          min="1"
          aria-label="count"
          value={monster.count}
          disabled={disabled}
          onChange={(e) => set({ count: Number(e.target.value) })}
        />
        <select
          aria-label="adjustment"
          value={monster.adjustment}
          disabled={disabled}
          onChange={(e) => set({ adjustment: e.target.value })}
        >
          {ADJUSTMENTS.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <input
          placeholder="nickname"
          value={monster.nickname || ''}
          disabled={disabled}
          onChange={(e) => set({ nickname: e.target.value })}
        />
        <button type="button" className="link" onClick={() => setShowBlock((s) => !s)}>
          {showBlock ? 'hide' : 'stat block'}
        </button>
        {!disabled && (
          <button type="button" className="link danger" onClick={onRemove}>Remove</button>
        )}
      </div>
      {showBlock && <CreatureView gameId={gameId} />}
    </div>
  )
}

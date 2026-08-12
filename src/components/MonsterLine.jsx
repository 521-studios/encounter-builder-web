import { ADJUSTMENTS } from '../model.js'

// One monster row. The ref is a pfsrd2 game_id for now (slice 4 adds a search
// picker that fills it); count + elite/weak adjustment + an optional nickname.
export default function MonsterLine({ monster, disabled, onChange, onRemove }) {
  const set = (fields) => onChange({ ...monster, ...fields })
  return (
    <div className="line monster-line">
      <input
        className="grow"
        placeholder="monster game_id"
        value={monster.ref?.game_id || ''}
        disabled={disabled}
        onChange={(e) => set({ ref: { game_id: e.target.value } })}
      />
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
      {!disabled && (
        <button type="button" className="link danger" onClick={onRemove}>Remove</button>
      )}
    </div>
  )
}

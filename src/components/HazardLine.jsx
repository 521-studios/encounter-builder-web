import { useState } from 'react'
import { CreatureSearch } from '@521studios/pfsrd2-display'
import { pfsrd2 } from '../api/pfsrd2.js'
import { gameIdOf } from '../model.js'
import HazardView from './HazardView.jsx'

// One hazard row — the encounter's SEPARATE "add hazard" slot (not the monster
// search). Before a hazard is chosen, a pfsrd2 search over hazards + weather hazards
// fills the ref (seeding the nickname). Once chosen it reads like a hazard header —
// name (+count for e.g. 2 Web Lurker Nooses) and HAZARD level — over count / stat
// block / remove. Reuses the library CreatureSearch (a generic typeahead) pointed at
// the hazard search, and HazardView for the stat block.
export default function HazardLine({ hazard, entryOf, disabled, onChange, onRemove }) {
  const set = (fields) => onChange({ ...hazard, ...fields })
  const gameId = gameIdOf(hazard)
  const [showBlock, setShowBlock] = useState(false)

  if (!gameId) {
    return (
      <div className="line hazard-line">
        {disabled ? (
          <span className="picked grow muted">— no hazard</span>
        ) : (
          <div className="hazard-search grow">
            <CreatureSearch
              search={pfsrd2.suggestHazards}
              levelFilter
              onSelect={(h) => set({ ref: { game_id: h.game_id }, nickname: hazard.nickname || h.name })}
              placeholder="search a hazard…"
            />
          </div>
        )}
        {!disabled && (
          <button type="button" className="link danger" onClick={onRemove}>Remove</button>
        )}
      </div>
    )
  }

  const entry = entryOf ? entryOf(gameId) : null
  const count = hazard.count || 1
  const name = hazard.nickname || entry?.name || gameId
  // The full entry is flat under `hazard` (not stat_block); level lives there.
  const level = entry ? (entry.hazard || entry).level : undefined

  return (
    <div className="hazard-line-wrap">
      <div className="line hazard-line">
        <div className="picked grow monster-header" data-testid="hazard-header">
          <div className="monster-header-top">
            <span className="monster-header-name">
              {name}{count > 1 ? ` (${count})` : ''}
            </span>
            {level != null && (
              <span className="monster-header-level" data-testid="hazard-header-level">HAZARD {level}</span>
            )}
          </div>
          {entry == null && <div className="muted monster-header-loading">Loading…</div>}
        </div>
        {!disabled && (
          <button type="button" className="link" onClick={() => set({ ref: { game_id: '' } })}>change</button>
        )}
        <input
          type="number"
          min="1"
          aria-label="count"
          value={hazard.count}
          disabled={disabled}
          onChange={(e) => set({ count: Number(e.target.value) })}
        />
        <button type="button" className="link" onClick={() => setShowBlock((s) => !s)}>
          {showBlock ? 'hide' : 'stat block'}
        </button>
        {!disabled && (
          <button type="button" className="link danger" onClick={onRemove}>Remove</button>
        )}
      </div>
      {showBlock && <HazardView gameId={gameId} />}
    </div>
  )
}

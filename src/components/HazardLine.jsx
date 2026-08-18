import { CreatureSearch } from '@521studios/pfsrd2-display'
import { pfsrd2 } from '../api/pfsrd2.js'
import { gameIdOf } from '../model.js'
import HazardView from './HazardView.jsx'
import RemoveButton from './RemoveButton.jsx'
import CreatureCard from './CreatureCard.jsx'

// One hazard row — the encounter's SEPARATE "add hazard" slot (not the monster
// search). Before a hazard is chosen, a pfsrd2 search over hazards + weather hazards
// fills the ref (seeding the nickname). Once chosen it reads like a hazard header —
// name (+count for e.g. 2 Web Lurker Nooses) and HAZARD level — over count / stat
// block / remove. Reuses the library CreatureSearch (a generic typeahead) pointed at
// the hazard search, and HazardView for the stat block.
export default function HazardLine({ hazard, entryOf, disabled, onChange, onRemove }) {
  const set = (fields) => onChange({ ...hazard, ...fields })
  const gameId = gameIdOf(hazard)

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
              // No nickname seed: a hazard is shown by its real name (entry.name), so
              // re-picking after "change" never carries a stale name forward.
              onSelect={(h) => set({ ref: { game_id: h.game_id } })}
              placeholder="search a hazard…"
            />
          </div>
        )}
        {!disabled && (
          <RemoveButton label="hazard" onRemove={onRemove} />
        )}
      </div>
    )
  }

  const entry = entryOf ? entryOf(gameId) : null
  const bookName = entry?.name || ''
  // The full entry is flat under `hazard` (not stat_block); level lives there.
  const level = entry ? (entry.hazard || entry).level : undefined

  return (
    <CreatureCard
      entity={hazard}
      bookName={bookName}
      fallbackTitle={gameId}
      label="hazard"
      disabled={disabled}
      onChange={onChange}
      onRemove={onRemove}
      levelNode={
        level != null && (
          <span className="monster-header-level" data-testid="hazard-header-level">HAZARD {level}</span>
        )
      }
      lines={entry == null && <div className="muted monster-header-loading">Loading…</div>}
      statView={<HazardView gameId={gameId} />}
    />
  )
}

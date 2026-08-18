import { CreatureSearch } from '@521studios/pfsrd2-display'
import { pfsrd2 } from '../api/pfsrd2.js'
import { gameIdOf } from '../model.js'
import AfflictionView from './AfflictionView.jsx'
import RemoveButton from './RemoveButton.jsx'
import CreatureCard from './CreatureCard.jsx'

// One affliction row — the encounter's SEPARATE "add affliction" slot (its own thing,
// not the monster/hazard search). Before an affliction is chosen, a pfsrd2 search over
// curses + diseases fills the ref. Once chosen it reads like an affliction header —
// name (+count) and "Curse N" / "Disease N" (or a level_text like "Varies") — over
// count / stat block / remove. Reuses the library CreatureSearch and AfflictionView.
export default function AfflictionLine({ affliction, entryOf, disabled, onChange, onRemove }) {
  const set = (fields) => onChange({ ...affliction, ...fields })
  const gameId = gameIdOf(affliction)

  if (!gameId) {
    return (
      <div className="line affliction-line">
        {disabled ? (
          <span className="picked grow muted">— no affliction</span>
        ) : (
          <div className="affliction-search grow">
            <CreatureSearch
              search={pfsrd2.suggestAfflictions}
              levelFilter
              onSelect={(a) => set({ ref: { game_id: a.game_id } })}
              placeholder="search a curse or disease…"
            />
          </div>
        )}
        {!disabled && (
          <RemoveButton label="affliction" onRemove={onRemove} />
        )}
      </div>
    )
  }

  const entry = entryOf ? entryOf(gameId) : null
  // The full entry is flat under `affliction` (not stat_block).
  const af = entry ? entry.affliction || entry : null
  const bookName = entry?.name || ''
  const kind = af ? capitalize(af.affliction_type || 'affliction') : null
  const levelLabel = af ? (af.level != null ? `${kind} ${af.level}` : af.level_text ? `${kind} ${af.level_text}` : kind) : null

  return (
    <CreatureCard
      entity={affliction}
      bookName={bookName}
      fallbackTitle={gameId}
      label="affliction"
      disabled={disabled}
      onChange={onChange}
      onRemove={onRemove}
      levelNode={
        levelLabel && (
          <span className="monster-header-level" data-testid="affliction-header-level">{levelLabel}</span>
        )
      }
      lines={entry == null && <div className="muted monster-header-loading">Loading…</div>}
      statView={<AfflictionView gameId={gameId} />}
    />
  )
}

const capitalize = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s)

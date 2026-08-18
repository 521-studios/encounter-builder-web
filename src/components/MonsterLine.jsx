import { CreatureSearch } from '@521studios/pfsrd2-display'
import { pfsrd2 } from '../api/pfsrd2.js'
import { gameIdOf } from '../model.js'
import { creatureHeader } from '../creatureHeader.js'
import MonsterView from './MonsterView.jsx'
import RemoveButton from './RemoveButton.jsx'
import CreatureCard from './CreatureCard.jsx'

// One monster row. Before a monster is chosen, a pfsrd2 search picker fills the ref.
// Once chosen it reads like the book's creature stat header — name (+count), CREATURE
// level, source book + page, Perception-based initiative — via the shared CreatureCard.
export default function MonsterLine({ monster, entryOf, disabled, onChange, onRemove }) {
  const set = (fields) => onChange({ ...monster, ...fields })
  const gameId = gameIdOf(monster) // pristine game_id, or a templated ref's base.game_id

  if (!gameId) {
    return (
      <div className="line monster-line">
        {disabled ? (
          // Released/read-only: the library CreatureSearch has no `disabled`
          // passthrough, so render an inert placeholder instead of a live picker
          // (an interactive one would let a viewer mutate a read-only encounter).
          <span className="picked grow muted">— no monster</span>
        ) : (
          <div className="monster-search grow">
            <CreatureSearch
              search={pfsrd2.suggestMonsters}
              suggestTraits={pfsrd2.suggestMonsterTraits}
              levelFilter
              onSelect={(m) => set({ ref: { game_id: m.game_id } })}
              placeholder="search a monster…"
            />
          </div>
        )}
        {!disabled && <RemoveButton label="monster" onRemove={onRemove} />}
      </div>
    )
  }

  const entry = entryOf ? entryOf(gameId) : null
  // A templated monster carries its resolved creature in ref.json — the line reads
  // from that snapshot (name here, everything else via creatureHeader) instead of the
  // base entry, which gameIdsInEncounter never prefetches for a derived ref.
  const snapshot = monster.ref?.json || null
  const hdr = creatureHeader(entry, monster)
  const bookName = entry?.name || snapshot?.name || snapshot?.stat_block?.name || ''

  return (
    <CreatureCard
      entity={monster}
      bookName={bookName}
      fallbackTitle={gameId}
      label="monster"
      disabled={disabled}
      onChange={onChange}
      onRemove={onRemove}
      levelNode={
        hdr.level != null && (
          <span className="monster-header-level" data-testid="monster-header-level">CREATURE {hdr.level}</span>
        )
      }
      lines={
        <>
          {hdr.source && <div className="monster-header-source">{hdr.source}</div>}
          {hdr.initiative && (
            <div className="monster-header-init" data-testid="monster-header-init">Initiative {hdr.initiative}</div>
          )}
          {entry == null && snapshot == null && <div className="muted monster-header-loading">Loading…</div>}
        </>
      }
      statView={<MonsterView monster={monster} onChange={onChange} disabled={disabled} />}
    />
  )
}

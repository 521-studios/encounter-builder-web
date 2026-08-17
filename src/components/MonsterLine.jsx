import { useState } from 'react'
import { CreatureSearch } from '@521studios/pfsrd2-display'
import { pfsrd2 } from '../api/pfsrd2.js'
import { gameIdOf } from '../model.js'
import { creatureHeader } from '../creatureHeader.js'
import MonsterView from './MonsterView.jsx'
import LoadoutView from './LoadoutView.jsx'

// One monster row. Before a monster is chosen, a pfsrd2 search picker fills the
// ref (and seeds the nickname with the monster's name). Once chosen it reads like
// the book's creature stat header — name (+count), CREATURE level, source book +
// page, Perception-based initiative — over the count/nickname/stat-block controls.
export default function MonsterLine({ monster, entryOf, disabled, onChange, onRemove, onAddToTreasure }) {
  const set = (fields) => onChange({ ...monster, ...fields })
  const gameId = gameIdOf(monster) // pristine game_id, or a templated ref's base.game_id
  const [showBlock, setShowBlock] = useState(false)
  const [showLoadout, setShowLoadout] = useState(false)
  const loadoutCount = (monster.loadout || []).filter(gameIdOf).length

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
              onSelect={(m) => set({ ref: { game_id: m.game_id }, nickname: monster.nickname || m.name })}
              placeholder="search a monster…"
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
  // A templated monster carries its resolved creature in ref.json — the line reads
  // from that snapshot (name here, everything else via creatureHeader) instead of the
  // base entry, which gameIdsInEncounter never prefetches for a derived ref. Without
  // this a templated monster showed "Loading…" forever and (absent a nickname) fell
  // back to the raw game_id for its name.
  const snapshot = monster.ref?.json || null
  const hdr = creatureHeader(entry, monster)
  const count = monster.count || 1
  const name = monster.nickname || entry?.name || snapshot?.name || snapshot?.stat_block?.name || gameId

  return (
    <div className="monster-line-wrap">
      <div className="line monster-line">
        <div className="picked grow monster-header" data-testid="monster-header">
          <div className="monster-header-top">
            <span className="monster-header-name">
              {name}{count > 1 ? ` (${count})` : ''}
            </span>
            {hdr.level != null && (
              <span className="monster-header-level" data-testid="monster-header-level">CREATURE {hdr.level}</span>
            )}
          </div>
          {hdr.source && <div className="monster-header-source">{hdr.source}</div>}
          {hdr.initiative && (
            <div className="monster-header-init" data-testid="monster-header-init">Initiative {hdr.initiative}</div>
          )}
          {entry == null && snapshot == null && <div className="muted monster-header-loading">Loading…</div>}
        </div>
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
        <input
          placeholder="nickname"
          value={monster.nickname || ''}
          disabled={disabled}
          onChange={(e) => set({ nickname: e.target.value })}
        />
        <button type="button" className="link" onClick={() => setShowBlock((s) => !s)}>
          {showBlock ? 'hide' : 'stat block'}
        </button>
        <button type="button" className="link" onClick={() => setShowLoadout((s) => !s)}>
          {showLoadout ? 'hide equipment' : `equipment${loadoutCount ? ` (${loadoutCount})` : ''}`}
        </button>
        {!disabled && (
          <button type="button" className="link danger" onClick={onRemove}>Remove</button>
        )}
      </div>
      {showBlock && <MonsterView monster={monster} onChange={onChange} disabled={disabled} />}
      {showLoadout && (
        <LoadoutView
          loadout={monster.loadout || []}
          disabled={disabled}
          onChange={(lo) => set({ loadout: lo })}
          onSendToTreasure={(items) => onAddToTreasure && onAddToTreasure(items)}
        />
      )}
    </div>
  )
}

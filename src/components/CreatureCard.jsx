import { useState } from 'react'
import RemoveButton from './RemoveButton.jsx'

// The picked-state card shared by monster / hazard / affliction lines. The title is
// the creature's book name by default (just shown, not editable clutter); an "edit"
// link in the lower-left reveals a name field where the title sits, plus a count.
// A custom name becomes the title and the book name drops to a line above the
// source. Count > 1 shows as "(N)" in the title. The name doubles as the stat-block
// toggle (caret). Delete is the standard × in the upper-right corner.
// The caller supplies the type-specific `levelNode`, `lines` (source/init/loading),
// and `statView` (the expanded stat block).
export default function CreatureCard({ entity, bookName, fallbackTitle, label, disabled, onChange, onRemove, levelNode, lines, statView }) {
  const [showBlock, setShowBlock] = useState(false)
  const [editing, setEditing] = useState(false)
  const set = (fields) => onChange({ ...entity, ...fields })
  const count = entity.count || 1
  const nick = (entity.nickname || '').trim()
  // `bookName` is the resolved creature name (empty while the entry loads). Only call the
  // name custom once we have a real book name to compare against — otherwise a monster
  // with a nickname would flash its game_id as a "real name" line during loading.
  const custom = nick && bookName && nick !== bookName
  const title = nick || bookName || fallbackTitle

  return (
    <div className="creature-card">
      {!disabled && <RemoveButton className="remove-x-abs" label={label} onRemove={onRemove} />}
      <div className="monster-header" data-testid={`${label}-header`}>
        <div className="monster-header-top">
          {editing && !disabled ? (
            <>
              <input
                className="monster-name-input"
                aria-label={`${label} name`}
                value={entity.nickname || ''}
                placeholder={bookName}
                autoFocus
                onChange={(e) => set({ nickname: e.target.value })}
              />
              <input
                type="number"
                min="1"
                className="monster-count-input"
                aria-label="count"
                value={entity.count}
                onChange={(e) => set({ count: Number(e.target.value) })}
              />
            </>
          ) : (
            <button
              type="button"
              className="monster-header-name monster-expand"
              aria-expanded={showBlock}
              aria-label={`${showBlock ? 'hide' : 'show'} stat block for ${title}`}
              onClick={() => setShowBlock((s) => !s)}
            >
              <span className="chapter-caret" aria-hidden="true">{showBlock ? '▾' : '▸'}</span> {title}
              {count > 1 ? ` (${count})` : ''}
            </button>
          )}
          {levelNode}
        </div>
        {custom && <div className="monster-header-realname">{bookName}</div>}
        {lines}
        {!disabled && (
          <button type="button" className="link monster-edit" onClick={() => setEditing((e) => !e)}>
            {editing ? 'done' : 'edit'}
          </button>
        )}
      </div>
      {showBlock && statView}
    </div>
  )
}

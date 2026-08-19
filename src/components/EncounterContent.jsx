import { useRef, useState } from 'react'
import { CONTENT_SECTIONS, CONTENT_TYPE_LABELS, emptyContentItem } from '../model.js'
import MonsterLine from './MonsterLine.jsx'
import HazardLine from './HazardLine.jsx'
import AfflictionLine from './AfflictionLine.jsx'
import SkillCheckEditor from './SkillCheckEditor.jsx'
import MarkdownBlock from './MarkdownBlock.jsx'
import TreasureLine from './TreasureLine.jsx'
import { PoolHeaderEditor, CoinEditor, XPAwardEditor, RewardEditor } from './ContentEditors.jsx'

// The unified "Encounter" content list: one ordered, drag-reorderable sequence of
// every item type (text / box-text / monster / hazard / affliction / skill-check /
// treasure-pool header / treasure / coin / XP award / reward), replacing the separate
// Description, Challenges, and Rewards tabs. A single "+ Add" opens a dialog whose
// choices are grouped into Text / Challenges / Rewards; each row has a drag handle.
// The parent owns the data (content) + persistence via the handlers.
export default function EncounterContent({
  content,
  entryOf,
  released,
  siblings,
  onOpenEncounter,
  onSetItem,
  onAdd,
  onRemove,
  onReorder,
  onAddLoadoutToTreasure,
}) {
  const dialogRef = useRef(null)
  const [dragId, setDragId] = useState(null)
  const [mdEditing, setMdEditing] = useState(() => new Set()) // markdown/box_text item ids in edit mode
  const toggleMd = (id, on) =>
    setMdEditing((s) => {
      const n = new Set(s)
      if (on) n.add(id)
      else n.delete(id)
      return n
    })

  const add = (type) => {
    const item = emptyContentItem(type)
    onAdd(item)
    if (item.type === 'markdown' || item.type === 'box_text') toggleMd(item.id, true) // a fresh section opens in edit mode
    dialogRef.current?.close()
  }

  const editorFor = (c) => {
    switch (c.type) {
      case 'monster':
        return <MonsterLine monster={c.monster} entryOf={entryOf} disabled={released} onChange={(m) => onSetItem(c.id, { monster: m })} onRemove={() => onRemove(c.id)} onAddToTreasure={onAddLoadoutToTreasure} />
      case 'hazard':
        return <HazardLine hazard={c.monster} entryOf={entryOf} disabled={released} onChange={(h) => onSetItem(c.id, { monster: h })} onRemove={() => onRemove(c.id)} />
      case 'affliction':
        return <AfflictionLine affliction={c.monster} entryOf={entryOf} disabled={released} onChange={(a) => onSetItem(c.id, { monster: a })} onRemove={() => onRemove(c.id)} />
      case 'skill_check':
        return <SkillCheckEditor value={c.skill_check} disabled={released} siblings={siblings} onOpenEncounter={onOpenEncounter} onChange={(s) => onSetItem(c.id, { skill_check: s })} onRemove={() => onRemove(c.id)} />
      case 'markdown':
      case 'box_text':
        return (
          <MarkdownBlock
            block={c.markdown}
            box={c.type === 'box_text'}
            editing={mdEditing.has(c.id)}
            ariaLabel={c.type === 'box_text' ? 'box text' : 'section'}
            released={released}
            siblings={siblings}
            onOpenEncounter={onOpenEncounter}
            onSet={(fields) => onSetItem(c.id, { markdown: { ...c.markdown, ...fields } })}
            onEdit={() => toggleMd(c.id, true)}
            onDone={() => toggleMd(c.id, false)}
            onRemove={() => onRemove(c.id)}
          />
        )
      case 'pool':
        return <PoolHeaderEditor pool={c.pool} disabled={released} onChange={(p) => onSetItem(c.id, { pool: p })} onRemove={() => onRemove(c.id)} />
      case 'treasure':
        return <TreasureLine treasure={c.treasure} disabled={released} onChange={(t) => onSetItem(c.id, { treasure: t })} onRemove={() => onRemove(c.id)} />
      case 'coin':
        return <CoinEditor coin={c.coin} disabled={released} onChange={(coin) => onSetItem(c.id, { coin })} onRemove={() => onRemove(c.id)} />
      case 'xp_award':
        return <XPAwardEditor award={c.xp_award} disabled={released} onChange={(a) => onSetItem(c.id, { xp_award: a })} onRemove={() => onRemove(c.id)} />
      case 'reward':
        return <RewardEditor reward={c.reward} disabled={released} siblings={siblings} onOpenEncounter={onOpenEncounter} onChange={(r) => onSetItem(c.id, { reward: r })} onRemove={() => onRemove(c.id)} />
      default:
        return null
    }
  }

  return (
    <div className="challenge-list" data-testid="encounter-content">
      {content.map((c) => (
        <div
          key={c.id}
          className="challenge-row"
          data-type={c.type}
          data-dragging={dragId === c.id || undefined}
          onDragOver={released ? undefined : (e) => e.preventDefault()}
          onDrop={
            released
              ? undefined
              : (e) => {
                  e.preventDefault()
                  if (dragId) onReorder(dragId, c.id)
                  setDragId(null)
                }
          }
        >
          {!released && (
            <span
              className="drag-handle"
              draggable
              aria-label="drag to reorder"
              title="Drag to reorder"
              onDragStart={(e) => {
                setDragId(c.id)
                e.dataTransfer.effectAllowed = 'move'
                e.dataTransfer.setData('text/plain', c.id)
              }}
              onDragEnd={() => setDragId(null)}
            >
              ⠿
            </span>
          )}
          <div className="challenge-body">{editorFor(c)}</div>
        </div>
      ))}

      {!released && (
        <>
          <button type="button" className="add-challenge" data-testid="add-content" onClick={() => dialogRef.current?.showModal()}>
            + Add
          </button>
          <dialog ref={dialogRef} className="challenge-dialog" aria-label="Add to the encounter">
            <h3 className="challenge-dialog-title">Add to the encounter</h3>
            {CONTENT_SECTIONS.map((section) => (
              <div key={section.label} className="content-add-section">
                <span className="content-add-section-label">{section.label}</span>
                <div className="challenge-type-grid">
                  {section.types.map((t) => (
                    <button key={t} type="button" className="challenge-type" onClick={() => add(t)}>
                      {CONTENT_TYPE_LABELS[t]}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <button type="button" className="link" onClick={() => dialogRef.current?.close()}>
              Cancel
            </button>
          </dialog>
        </>
      )}
    </div>
  )
}

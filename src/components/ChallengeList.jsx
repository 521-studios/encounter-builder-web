import { useRef, useState } from 'react'
import { CHALLENGE_TYPES, CHALLENGE_TYPE_LABELS, emptyChallenge } from '../model.js'
import MonsterLine from './MonsterLine.jsx'
import HazardLine from './HazardLine.jsx'
import AfflictionLine from './AfflictionLine.jsx'
import SkillCheckEditor from './SkillCheckEditor.jsx'
import MarkdownBlock from './MarkdownBlock.jsx'

// The unified Challenges list: one ordered, drag-reorderable sequence of monster /
// hazard / affliction / skill-check / markdown items (replacing the separate typed
// sections). A single "+ Add" opens a dialog to pick the type; each row has a drag
// handle. The parent owns the data (challenges) + persistence via the handlers.
export default function ChallengeList({
  challenges,
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
  const [mdEditing, setMdEditing] = useState(() => new Set()) // markdown item ids in edit mode
  const toggleMd = (id, on) =>
    setMdEditing((s) => {
      const n = new Set(s)
      if (on) n.add(id)
      else n.delete(id)
      return n
    })

  const add = (type) => {
    const item = emptyChallenge(type)
    onAdd(item)
    if (item.type === 'markdown') toggleMd(item.id, true) // a fresh section opens in edit mode
    dialogRef.current?.close()
  }

  const editorFor = (c) => {
    switch (c.type) {
      case 'monster':
        return (
          <MonsterLine
            monster={c.monster}
            entryOf={entryOf}
            disabled={released}
            onChange={(m) => onSetItem(c.id, { monster: m })}
            onRemove={() => onRemove(c.id)}
            onAddToTreasure={onAddLoadoutToTreasure}
          />
        )
      case 'hazard':
        return (
          <HazardLine
            hazard={c.monster}
            entryOf={entryOf}
            disabled={released}
            onChange={(h) => onSetItem(c.id, { monster: h })}
            onRemove={() => onRemove(c.id)}
          />
        )
      case 'affliction':
        return (
          <AfflictionLine
            affliction={c.monster}
            entryOf={entryOf}
            disabled={released}
            onChange={(a) => onSetItem(c.id, { monster: a })}
            onRemove={() => onRemove(c.id)}
          />
        )
      case 'skill_check':
        return (
          <SkillCheckEditor
            value={c.skill_check}
            disabled={released}
            siblings={siblings}
            onOpenEncounter={onOpenEncounter}
            onChange={(s) => onSetItem(c.id, { skill_check: s })}
            onRemove={() => onRemove(c.id)}
          />
        )
      case 'markdown':
        return (
          <MarkdownBlock
            block={c.markdown}
            editing={mdEditing.has(c.id)}
            ariaLabel="challenge section"
            released={released}
            siblings={siblings}
            onOpenEncounter={onOpenEncounter}
            onSet={(fields) => onSetItem(c.id, { markdown: { ...c.markdown, ...fields } })}
            onEdit={() => toggleMd(c.id, true)}
            onDone={() => toggleMd(c.id, false)}
            onRemove={() => onRemove(c.id)}
          />
        )
      default:
        return null
    }
  }

  return (
    <div className="challenge-list" data-testid="challenge-list">
      {challenges.map((c) => (
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
          <button type="button" className="add-challenge" data-testid="add-challenge" onClick={() => dialogRef.current?.showModal()}>
            + Add
          </button>
          <dialog ref={dialogRef} className="challenge-dialog" aria-label="Add a challenge">
            <h3 className="challenge-dialog-title">Add to Challenges</h3>
            <div className="challenge-type-grid">
              {CHALLENGE_TYPES.map((t) => (
                <button key={t} type="button" className="challenge-type" onClick={() => add(t)}>
                  {CHALLENGE_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
            <button type="button" className="link" onClick={() => dialogRef.current?.close()}>
              Cancel
            </button>
          </dialog>
        </>
      )}
    </div>
  )
}

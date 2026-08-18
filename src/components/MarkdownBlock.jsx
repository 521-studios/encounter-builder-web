import WikiMarkdown from './WikiMarkdown.jsx'

// One titled markdown block: EITHER an editor (title input + markdown textarea) or its
// rendered preview — never both. Released encounters are always preview. Shared by
// MarkdownSections (the Description tab) and the Challenges list, so the two never
// diverge. `ariaLabel` namespaces the field labels; the caller owns the block data +
// edit/preview toggle (onEdit/onDone) so it can key many blocks independently.
export default function MarkdownBlock({ block, editing, ariaLabel, released, siblings, onOpenEncounter, onSet, onEdit, onDone, onRemove }) {
  const b = block || {}
  const isEditing = !released && editing
  return (
    <div className="text-block" data-editing={isEditing || undefined}>
      {isEditing ? (
        <>
          <input
            className="text-block-title"
            aria-label={`${ariaLabel} title`}
            value={b.title || ''}
            placeholder="Section title (optional)"
            onChange={(e) => onSet({ title: e.target.value })}
          />
          <textarea
            className="description-input"
            aria-label={`${ariaLabel} body`}
            value={b.body || ''}
            onChange={(e) => onSet({ body: e.target.value })}
            placeholder="Scene-setting, read-aloud text, GM notes… (markdown)"
          />
          <div className="text-block-actions">
            <button type="button" className="link" onClick={onDone}>Done</button>
            <button type="button" className="link danger" aria-label={`remove ${ariaLabel}`} onClick={onRemove}>Remove</button>
          </div>
        </>
      ) : (
        <>
          {b.title && <h4 className="text-block-heading">{b.title}</h4>}
          {b.body ? (
            <div className="description-preview">
              <WikiMarkdown text={b.body} encounters={siblings} onOpenEncounter={onOpenEncounter} />
            </div>
          ) : (
            <p className="muted">(empty section)</p>
          )}
          {!released && (
            <div className="text-block-actions">
              <button type="button" className="link" aria-label={`edit ${ariaLabel}`} onClick={onEdit}>Edit</button>
              <button type="button" className="link danger" aria-label={`remove ${ariaLabel}`} onClick={onRemove}>Remove</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

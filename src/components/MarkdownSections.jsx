import WikiMarkdown from './WikiMarkdown.jsx'

// A list of titled markdown sections with a per-block edit/preview flip and
// add/remove. Used for both the Description and Challenges tabs (each with its own
// block array + editing set), so the two never diverge. `name` namespaces the
// testids + aria-labels so two instances on one screen don't collide; `h` bundles
// the block operations (set/add/remove/edit/done) the editor wires to `patch`.
export default function MarkdownSections({ name, blocks, editing, released, siblings, onOpenEncounter, addLabel = '+ Add section', h }) {
  return (
    <div className="text-blocks" data-testid={`${name}-blocks`}>
      {blocks.map((b, i) => {
        // Each block is EITHER an editor (title input + markdown textarea) or its
        // rendered preview — never both. Released encounters are always preview.
        const isEditing = !released && editing.has(i)
        return (
          <div className="text-block" key={i} data-editing={isEditing || undefined}>
            {isEditing ? (
              <>
                <input
                  className="text-block-title"
                  aria-label={`${name} section ${i + 1} title`}
                  value={b.title || ''}
                  placeholder="Section title (optional)"
                  onChange={(e) => h.set(i, { title: e.target.value })}
                />
                <textarea
                  className="description-input"
                  aria-label={`${name} section ${i + 1} body`}
                  value={b.body || ''}
                  onChange={(e) => h.set(i, { body: e.target.value })}
                  placeholder="Scene-setting, read-aloud text, GM notes… (markdown)"
                />
                <div className="text-block-actions">
                  <button type="button" className="link" onClick={() => h.done(i)}>Done</button>
                  <button type="button" className="link danger" aria-label={`remove ${name} section ${i + 1}`} onClick={() => h.remove(i)}>Remove</button>
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
                    <button type="button" className="link" aria-label={`edit ${name} section ${i + 1}`} onClick={() => h.edit(i)}>Edit</button>
                    <button type="button" className="link danger" aria-label={`remove ${name} section ${i + 1}`} onClick={() => h.remove(i)}>Remove</button>
                  </div>
                )}
              </>
            )}
          </div>
        )
      })}
      {!released && (
        <button type="button" className="link" data-testid={`add-${name}-section`} onClick={h.add}>
          {addLabel}
        </button>
      )}
    </div>
  )
}

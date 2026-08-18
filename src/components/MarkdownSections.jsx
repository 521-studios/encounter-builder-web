import MarkdownBlock from './MarkdownBlock.jsx'

// A list of titled markdown sections with a per-block edit/preview flip and add/remove.
// Used for the Description tab (its own block array + editing set). `name` namespaces
// testids/aria-labels; `h` bundles the block operations the editor wires to `patch`.
export default function MarkdownSections({ name, blocks, editing, released, siblings, onOpenEncounter, addLabel = '+ Add section', h }) {
  return (
    <div className="text-blocks" data-testid={`${name}-blocks`}>
      {blocks.map((b, i) => (
        <MarkdownBlock
          key={i}
          block={b}
          editing={editing.has(i)}
          ariaLabel={`${name} section ${i + 1}`}
          released={released}
          siblings={siblings}
          onOpenEncounter={onOpenEncounter}
          onSet={(fields) => h.set(i, fields)}
          onEdit={() => h.edit(i)}
          onDone={() => h.done(i)}
          onRemove={() => h.remove(i)}
        />
      ))}
      {!released && (
        <button type="button" className="link" data-testid={`add-${name}-section`} onClick={h.add}>
          {addLabel}
        </button>
      )}
    </div>
  )
}

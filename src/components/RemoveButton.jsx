// The standard delete control: an × sitting at the upper-right of an item's title
// bar, with a confirm before it fires. `label` names the thing in the prompt +
// aria-label; `className` (e.g. "remove-x-abs") tunes placement per container.
export default function RemoveButton({ onRemove, label = 'item', className = '' }) {
  const remove = () => {
    if (window.confirm(`Remove this ${label}?`)) onRemove()
  }
  return (
    <button
      type="button"
      className={['remove-x', className].filter(Boolean).join(' ')}
      aria-label={`Remove ${label}`}
      title="Remove"
      onClick={remove}
    >
      ×
    </button>
  )
}

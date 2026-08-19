import { useState } from 'react'

// A skill combobox backed by the shared #skill-options datalist. A plain datalist
// filters its suggestions by the current input text, so a pre-filled value (e.g. the
// Perception default) hides every other skill until you clear it. This clears the
// DISPLAY on focus — showing the full list — without touching the stored value, so a
// pre-filled skill can be replaced by picking or typing, and reverts if you tab away
// without choosing. onChange receives the string value. Passes className/aria-label/
// placeholder through.
export default function SkillInput({ value, onChange, disabled, ...rest }) {
  const [editing, setEditing] = useState(null) // null = show stored value; else the in-focus text
  return (
    <input
      list="skill-options"
      disabled={disabled}
      value={editing != null ? editing : value || ''}
      onFocus={() => !disabled && setEditing('')}
      onChange={(e) => {
        setEditing(e.target.value)
        onChange(e.target.value)
      }}
      onBlur={() => setEditing(null)}
      {...rest}
    />
  )
}

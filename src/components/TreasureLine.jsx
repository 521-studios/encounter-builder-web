import { SALE_CLASSES, TREASURE_STATES } from '../model.js'

// One treasure row. ref is a pfsrd2 game_id for now; qty, a mask (with the label
// players see + an identify DC), sale class, and post-encounter state.
export default function TreasureLine({ treasure, disabled, onChange, onRemove }) {
  const set = (fields) => onChange({ ...treasure, ...fields })
  return (
    <div className="line treasure-line">
      <input
        className="grow"
        placeholder="item game_id"
        value={treasure.ref?.game_id || ''}
        disabled={disabled}
        onChange={(e) => set({ ref: { game_id: e.target.value } })}
      />
      <input
        type="number"
        min="1"
        aria-label="qty"
        value={treasure.qty}
        disabled={disabled}
        onChange={(e) => set({ qty: Number(e.target.value) })}
      />
      <label className="check">
        <input
          type="checkbox"
          checked={treasure.masked}
          disabled={disabled}
          onChange={(e) => set({ masked: e.target.checked })}
        />
        masked
      </label>
      {treasure.masked && (
        <>
          <input
            placeholder="mask label (what players see)"
            value={treasure.mask_label || ''}
            disabled={disabled}
            onChange={(e) => set({ mask_label: e.target.value })}
          />
          <input
            type="number"
            min="0"
            aria-label="identify DC"
            placeholder="DC"
            value={treasure.identify_dc || 0}
            disabled={disabled}
            onChange={(e) => set({ identify_dc: Number(e.target.value) })}
          />
        </>
      )}
      <select
        aria-label="sale class"
        value={treasure.sale_class}
        disabled={disabled}
        onChange={(e) => set({ sale_class: e.target.value })}
      >
        {SALE_CLASSES.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
      <select
        aria-label="state"
        value={treasure.state}
        disabled={disabled}
        onChange={(e) => set({ state: e.target.value })}
      >
        {TREASURE_STATES.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
      {!disabled && (
        <button type="button" className="link danger" onClick={onRemove}>Remove</button>
      )}
    </div>
  )
}

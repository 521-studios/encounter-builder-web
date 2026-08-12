import { ItemSearch } from '@521studios/pfsrd2-display'
import { SALE_CLASSES, TREASURE_STATES } from '../model.js'
import { pfsrd2 } from '../api/pfsrd2.js'
import ItemView from './ItemView.jsx'

// One treasure row. Before an item is chosen, the library ItemSearch picks it by
// name (no more typing raw game_ids). Once chosen: the ItemCard preview (masked-
// aware) plus qty, a mask (label players see + identify DC), sale class, and
// post-encounter state.
export default function TreasureLine({ treasure, disabled, onChange, onRemove }) {
  const set = (fields) => onChange({ ...treasure, ...fields })
  const gameId = treasure.ref?.game_id || ''

  const controls = (
    <div className="line treasure-controls">
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

  if (!gameId) {
    return (
      <div className="line treasure-line">
        {disabled ? (
          <span className="picked grow muted">— no item</span>
        ) : (
          <div className="item-search grow">
            <ItemSearch
              search={pfsrd2.suggestItems}
              onSelect={(it) => set({ ref: { game_id: it.game_id }, variant: '' })}
              placeholder="search an item…"
            />
          </div>
        )}
        {!disabled && (
          <button type="button" className="link danger" onClick={onRemove}>Remove</button>
        )}
      </div>
    )
  }

  return (
    <div className="treasure-line-wrap">
      <ItemView
        gameId={gameId}
        variant={treasure.variant}
        onVariantChange={disabled ? undefined : (name) => set({ variant: name })}
      />
      {treasure.masked && (
        <p className="muted mask-note">Players see: {treasure.mask_label || 'Unidentified Item'}</p>
      )}
      {!disabled && (
        <button type="button" className="link" onClick={() => set({ ref: { game_id: '' }, variant: '' })}>change item</button>
      )}
      {controls}
    </div>
  )
}

import { ItemSearch } from '@521studios/pfsrd2-display'
import { SALE_CLASSES, TREASURE_STATES, gameIdOf, customTreasureRef, isCustomTreasure, gpToCp, cpToGp } from '../model.js'
import { pfsrd2 } from '../api/pfsrd2.js'
import ItemComposeView from './ItemComposeView.jsx'

// One treasure row. Before an item is chosen, the library ItemSearch picks it by
// name (no more typing raw game_ids). Once chosen: the ItemCard preview (masked-
// aware) plus qty, a mask (label players see + identify DC), sale class, and
// post-encounter state.
export default function TreasureLine({ treasure, disabled, onChange, onRemove }) {
  const set = (fields) => onChange({ ...treasure, ...fields })
  const gameId = gameIdOf(treasure) // pristine game_id, or a templated ref's base.game_id
  const custom = isCustomTreasure(treasure) // freeform item (name + gp), not in the catalog
  const setCustom = (fields) => set({ ref: { json: { ...treasure.ref.json, ...fields } } })

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
      <label className="check">
        <input
          type="checkbox"
          checked={Boolean(treasure.value_tiers)}
          disabled={disabled}
          onChange={(e) => set({ value_tiers: e.target.checked ? {} : undefined })}
        />
        variable value
      </label>
      {treasure.value_tiers && (
        <span className="value-tiers" data-testid="value-tiers" title="gp by degree of success — the budget counts Success">
          {[
            ['success', 'success'],
            ['failure', 'failure'],
            ['crit_failure', 'crit fail'],
            ['crit_success', 'crit success'],
          ].map(([k, label]) => (
            <label key={k} className="tier">
              {label}
              <input
                type="number"
                min="0"
                step="0.1"
                aria-label={`${label} (gp)`}
                value={cpToGp(treasure.value_tiers[k])}
                disabled={disabled}
                onChange={(e) => set({ value_tiers: { ...treasure.value_tiers, [k]: gpToCp(e.target.value) } })}
              />
            </label>
          ))}
        </span>
      )}
      {!disabled && (
        <button type="button" className="link danger" onClick={onRemove}>Remove</button>
      )}
    </div>
  )

  // Freeform/custom item: a name + gp value for loot not in the pfsrd2 catalog
  // (gems, art, trophies, quest items). Renders inline (no ItemCard) over the shared
  // controls, and its value counts toward the treasure total via budget.js.
  if (custom) {
    return (
      <div className="treasure-line-wrap">
        <div className="line custom-treasure" data-testid="custom-treasure">
          <input
            className="grow"
            aria-label="custom item name"
            placeholder="custom item name (e.g. peridot bead)"
            value={treasure.ref.json.name || ''}
            disabled={disabled}
            onChange={(e) => setCustom({ name: e.target.value })}
          />
          <label className="custom-value">
            <input
              type="number"
              min="0"
              step="0.1"
              aria-label="value (gp)"
              placeholder="gp"
              value={cpToGp(treasure.ref.json.value_cp)}
              disabled={disabled}
              onChange={(e) => setCustom({ value_cp: gpToCp(e.target.value) })}
            />{' '}
            gp
          </label>
          {!disabled && (
            <button type="button" className="link" onClick={() => set({ ref: { game_id: '' }, variant: '' })}>
              choose a catalog item instead
            </button>
          )}
        </div>
        {treasure.masked && (
          <p className="muted mask-note">Players see: {treasure.mask_label || 'Unidentified Item'}</p>
        )}
        {controls}
      </div>
    )
  }

  if (!gameId) {
    return (
      <div className="line treasure-line">
        {disabled ? (
          <span className="picked grow muted">— no item</span>
        ) : (
          <>
            <div className="item-search grow">
              <ItemSearch
                search={pfsrd2.suggestItems}
                suggestTraits={pfsrd2.suggestItemTraits}
                loadFacets={pfsrd2.loadItemFacets}
                levelFilter
                onSelect={(it) => set({ ref: { game_id: it.game_id }, variant: '' })}
                placeholder="search an item…"
              />
            </div>
            <button
              type="button"
              className="link add-custom-treasure"
              onClick={() => set({ ref: customTreasureRef(), variant: '' })}
            >
              + custom item
            </button>
          </>
        )}
        {!disabled && (
          <button type="button" className="link danger" onClick={onRemove}>Remove</button>
        )}
      </div>
    )
  }

  return (
    <div className="treasure-line-wrap">
      <ItemComposeView treasure={treasure} onChange={onChange} disabled={disabled} />
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

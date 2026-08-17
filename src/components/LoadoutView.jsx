import { ItemSearch } from '@521studios/pfsrd2-display'
import { pfsrd2 } from '../api/pfsrd2.js'
import { gameIdOf, emptyLoadoutItem } from '../model.js'
import ItemComposeView from './ItemComposeView.jsx'

// A creature's equipment loadout (0o77 phase 1): compose catalog / runed weapons +
// armor and send them into the encounter loot. A loadout item is the same
// { ref, qty, variant } shape as treasure, so it reuses ItemComposeView (the runed-
// item authoring) verbatim; "→ treasure" hands the item(s) up to the editor, which
// drops them into the default treasure pool where budget.js prices them.
export default function LoadoutView({ loadout, disabled, onChange, onSendToTreasure }) {
  const setItem = (i, item) => onChange(loadout.map((x, j) => (j === i ? item : x)))
  const removeItem = (i) => onChange(loadout.filter((_, j) => j !== i))
  const equipped = loadout.filter(gameIdOf)

  return (
    <div className="loadout" data-testid="loadout">
      {loadout.map((item, i) => (
        <div className="loadout-line" data-testid="loadout-line" key={item._key}>
          {gameIdOf(item) ? (
            <>
              <ItemComposeView treasure={item} onChange={(it) => setItem(i, it)} disabled={disabled} />
              <div className="loadout-controls">
                <input
                  type="number"
                  min="1"
                  aria-label="loadout qty"
                  value={item.qty || 1}
                  disabled={disabled}
                  onChange={(e) => setItem(i, { ...item, qty: Number(e.target.value) })}
                />
                {!disabled && (
                  <>
                    <button type="button" className="link" onClick={() => onSendToTreasure([item])}>→ treasure</button>
                    <button type="button" className="link" onClick={() => setItem(i, { ...item, ref: { game_id: '' }, variant: '' })}>change item</button>
                    <button type="button" className="link danger" onClick={() => removeItem(i)}>remove</button>
                  </>
                )}
              </div>
            </>
          ) : (
            !disabled && (
              <div className="loadout-search">
                <div className="item-search grow">
                  <ItemSearch
                    search={pfsrd2.suggestItems}
                    suggestTraits={pfsrd2.suggestItemTraits}
                    loadFacets={pfsrd2.loadItemFacets}
                    levelFilter
                    onSelect={(it) => setItem(i, { ...item, ref: { game_id: it.game_id }, variant: '' })}
                    placeholder="search a weapon / armor…"
                  />
                </div>
                <button type="button" className="link danger" onClick={() => removeItem(i)}>remove</button>
              </div>
            )
          )}
        </div>
      ))}
      {!disabled && (
        <div className="loadout-actions">
          <button type="button" className="link add-loadout" onClick={() => onChange([...loadout, emptyLoadoutItem()])}>+ equipment</button>
          {equipped.length > 0 && (
            <button type="button" className="link" onClick={() => onSendToTreasure(equipped)}>send all to treasure</button>
          )}
        </div>
      )}
    </div>
  )
}

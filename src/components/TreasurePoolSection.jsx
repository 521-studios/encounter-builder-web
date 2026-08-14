import { Markdown } from '@521studios/pfsrd2-display'
import TreasureLine from './TreasureLine.jsx'

// One treasure pool: where a group of loot is found. Carries an editable name, a
// GM markdown description, and an optional discovery gate (skill + DC — informational
// in the builder; the budget counts every pool at best case). Its treasure lines
// render beneath. `lines` are {t, i} pairs carrying each line's index in the flat
// encounter.treasure array so edits/removals map back.
export default function TreasurePoolSection({
  pool,
  lines,
  disabled,
  canRemove,
  onPoolChange,
  onPoolRemove,
  onLineChange,
  onLineRemove,
  onAddLine,
}) {
  const gate = pool.gate
  return (
    <div className="treasure-pool" data-testid="treasure-pool">
      <div className="pool-header">
        <input
          className="pool-name"
          aria-label="pool name"
          placeholder="Treasure"
          value={pool.name || ''}
          disabled={disabled}
          onChange={(e) => onPoolChange({ name: e.target.value })}
        />
        {canRemove && !disabled && (
          <button type="button" className="link danger" onClick={onPoolRemove}>
            remove pool
          </button>
        )}
      </div>

      {!disabled ? (
        <textarea
          className="pool-description"
          aria-label="pool description"
          placeholder="Where it's found — GM notes (markdown)"
          value={pool.description || ''}
          onChange={(e) => onPoolChange({ description: e.target.value })}
        />
      ) : pool.description ? (
        <Markdown block text={pool.description} />
      ) : null}

      <div className="pool-gate">
        <label className="check">
          <input
            type="checkbox"
            checked={Boolean(gate)}
            disabled={disabled}
            onChange={(e) => onPoolChange({ gate: e.target.checked ? { skill: '', dc: 0 } : null })}
          />
          gated (discovery check)
        </label>
        {gate && (
          <>
            <input
              aria-label="gate skill"
              placeholder="skill (e.g. Perception)"
              value={gate.skill || ''}
              disabled={disabled}
              onChange={(e) => onPoolChange({ gate: { ...gate, skill: e.target.value } })}
            />
            <input
              type="number"
              min="1"
              aria-label="gate DC"
              placeholder="DC"
              value={gate.dc || ''}
              disabled={disabled}
              onChange={(e) => onPoolChange({ gate: { ...gate, dc: Number(e.target.value) } })}
            />
          </>
        )}
      </div>

      {lines.map(({ t, i }) => (
        <TreasureLine
          key={t._key}
          treasure={t}
          disabled={disabled}
          onChange={(t2) => onLineChange(i, t2)}
          onRemove={() => onLineRemove(i)}
        />
      ))}

      {!disabled && (
        <button type="button" className="link add-pool-treasure" onClick={onAddLine}>
          + treasure
        </button>
      )}
    </div>
  )
}

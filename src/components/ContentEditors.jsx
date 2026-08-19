import { CURRENCIES, REWARD_KINDS, REWARD_KIND_LABELS } from '../model.js'
import RemoveButton from './RemoveButton.jsx'
import WikiMarkdown from './WikiMarkdown.jsx'
import SkillInput from './SkillInput.jsx'

// The small reward-section editors for the unified Encounter content list. Each is a
// card with the standard corner ×; all edits flow through onChange with the whole
// updated payload (the parent persists via the autosaving patch).

// A treasure-POOL header: a named group (where loot is found) with an optional
// discovery gate. Loot items placed after it in the list belong to it (positional).
export function PoolHeaderEditor({ pool, disabled, onChange, onRemove }) {
  const set = (fields) => onChange({ ...pool, ...fields })
  const gate = pool?.gate || null
  const setGate = (fields) => set({ gate: { ...(gate || { skill: '', dc: 0 }), ...fields } })
  return (
    <div className="content-pool">
      {!disabled && <RemoveButton className="remove-x-abs" label="pool" onRemove={onRemove} />}
      <input
        className="pool-name"
        aria-label="pool name"
        placeholder="Treasure pool — where it's found (e.g. the altar)"
        value={pool?.name || ''}
        disabled={disabled}
        onChange={(e) => set({ name: e.target.value })}
      />
      <label className="pool-gate" title="Discovery check to find this pool (optional)">
        <span aria-hidden="true">🔒</span>
        <SkillInput
          className="check-skill"
          aria-label="pool gate skill"
          placeholder="Skill (optional)"
          value={gate?.skill}
          disabled={disabled}
          onChange={(v) => setGate({ skill: v })}
        />
        <input
          type="number"
          min="1"
          className="check-dc"
          aria-label="pool gate DC"
          placeholder="DC"
          value={gate?.dc || ''}
          disabled={disabled}
          onChange={(e) => setGate({ dc: Number(e.target.value) })}
        />
      </label>
    </div>
  )
}

// A coin drop — an amount per denomination.
export function CoinEditor({ coin, disabled, onChange, onRemove }) {
  const set = (fields) => onChange({ ...coin, ...fields })
  return (
    <div className="content-coin">
      {!disabled && <RemoveButton className="remove-x-abs" label="coin" onRemove={onRemove} />}
      <span className="content-item-label">Coin</span>
      {CURRENCIES.map((c) => (
        <label key={c} className="coin">
          {c}
          <input
            type="number"
            min="0"
            aria-label={c}
            value={coin?.[c] || 0}
            disabled={disabled}
            onChange={(e) => set({ [c]: Number(e.target.value) })}
          />
        </label>
      ))}
    </div>
  )
}

// A flat non-combat XP award (amount + reason).
export function XPAwardEditor({ award, disabled, onChange, onRemove }) {
  const set = (fields) => onChange({ ...award, ...fields })
  return (
    <div className="content-xp" data-testid="xp-award">
      {!disabled && <RemoveButton className="remove-x-abs" label="XP award" onRemove={onRemove} />}
      <input
        type="number"
        min="1"
        step="1"
        className="award-amount"
        aria-label="XP amount"
        placeholder="XP"
        value={award?.amount || ''}
        disabled={disabled}
        onChange={(e) => set({ amount: Number(e.target.value) })}
      />
      <input
        className="award-reason"
        aria-label="award reason"
        placeholder="Reason (e.g. gained Augrael as an ally)"
        value={award?.reason || ''}
        disabled={disabled}
        onChange={(e) => set({ reason: e.target.value })}
      />
    </div>
  )
}

// A non-treasure reward (information / ritual / ally / item) — GM notes, no gp/XP effect.
export function RewardEditor({ reward, disabled, siblings, onOpenEncounter, onChange, onRemove }) {
  const set = (fields) => onChange({ ...reward, ...fields })
  return (
    <div className="content-reward" data-testid="reward">
      {!disabled && <RemoveButton className="remove-x-abs" label="reward" onRemove={onRemove} />}
      <div className="reward-head">
        <select
          aria-label="reward kind"
          value={reward?.kind || 'information'}
          disabled={disabled}
          onChange={(e) => set({ kind: e.target.value })}
        >
          {REWARD_KINDS.map((k) => (
            <option key={k} value={k}>{REWARD_KIND_LABELS[k]}</option>
          ))}
        </select>
        <input
          className="reward-label"
          aria-label="reward label"
          placeholder="Name (e.g. The Whispering Reeds)"
          value={reward?.label || ''}
          disabled={disabled}
          onChange={(e) => set({ label: e.target.value })}
        />
      </div>
      {!disabled ? (
        <textarea
          className="reward-description description-input"
          aria-label="reward description"
          placeholder="Details — GM notes (markdown)"
          value={reward?.description || ''}
          onChange={(e) => set({ description: e.target.value })}
        />
      ) : reward?.description ? (
        <WikiMarkdown text={reward.description} encounters={siblings} onOpenEncounter={onOpenEncounter} />
      ) : null}
    </div>
  )
}

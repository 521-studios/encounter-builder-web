import { formatGp } from '@521studios/pfsrd2-display'
import {
  CURRENCIES,
  EXCLUSION_REASONS,
  EXCLUSION_REASON_LABELS,
  coinCp,
  hasTreasureContent,
  treasureMoving,
} from '../model.js'
import { treasureName } from './EncounterPrintSheet.jsx'

const POOL_NOT_FOUND_NOTE = 'pool not found'

// Is an item/coin exclusion missing its reason or note? Release waits on these.
function missingWhy(state, note) {
  return !state || state === 'intact' || !(note || '').trim()
}

// The close-out treasure package (we5k.2.5): every pool's loot and coin in
// content order, with what moves to the party. The GM sets how many of each line
// move (any shortfall needs a reason + note), excludes coin drops the same way,
// and marks a gated pool not found (its loot + coin stay behind). Release lives
// here — it's the last step of close-out.
export default function TreasurePackage({ content, entryOf, onChange, onRelease, releasing, saving }) {
  const setItem = (id, fields) =>
    onChange(content.map((c) => (c.id === id ? { ...c, ...fields } : c)))

  let unfound = false
  let movingCp = 0
  let excludedCp = 0
  let todo = 0
  const rows = []
  for (const c of content) {
    if (c.type === 'pool') {
      const p = c.pool || {}
      const gated = Boolean(p.gate && (p.gate.skill || p.gate.dc))
      unfound = gated && Boolean(p.not_found)
      if (!p.name && !gated) continue
      rows.push(
        <li key={c.id} className="package-pool" data-testid="package-pool">
          <strong>{p.name || 'Treasure'}</strong>
          {gated && (
            <label className="check">
              <input
                type="checkbox"
                aria-label={`${p.name || 'pool'} found`}
                checked={!p.not_found}
                onChange={(e) => setItem(c.id, { pool: { ...p, not_found: !e.target.checked } })}
              />
              found ({p.gate.skill || 'Skill'}{p.gate.dc ? ` DC ${p.gate.dc}` : ''})
            </label>
          )}
        </li>,
      )
    } else if (c.type === 'treasure') {
      const t = c.treasure || {}
      if (!hasTreasureContent(t)) continue
      const qty = Number(t.qty) || 0
      const moving = unfound ? 0 : treasureMoving(t)
      const short = !unfound && moving < qty
      if (short && missingWhy(t.state, t.state_note)) todo++
      const set = (fields) => setItem(c.id, { treasure: { ...t, ...fields } })
      const setMoving = (n) => {
        n = Math.max(0, Math.min(Math.round(Number(n) || 0), qty))
        if (n >= qty) set({ qty_moving: undefined, state: 'intact', state_note: '' })
        else set({ qty_moving: n, state: t.state && t.state !== 'intact' ? t.state : '' })
      }
      const name = treasureName(t, entryOf)
      rows.push(
        <li key={c.id} className="package-item" data-testid="package-item">
          <label>
            <input
              type="number"
              min={0}
              max={qty}
              aria-label={`${name} moving`}
              value={moving}
              disabled={unfound}
              onChange={(e) => setMoving(e.target.value)}
            />
            {' '}of {qty} × {name}
          </label>
          {unfound && <span className="muted"> — {EXCLUSION_REASON_LABELS.left_behind}: {POOL_NOT_FOUND_NOTE}</span>}
          {short && <Why value={t} label={name} onChange={set} />}
        </li>,
      )
    } else if (c.type === 'coin') {
      const coin = c.coin || {}
      const cp = coinCp(coin)
      if (!cp) continue
      const excluded = unfound || Boolean(coin.state && coin.state !== 'intact')
      if (excluded) excludedCp += cp
      else movingCp += cp
      const label = CURRENCIES.filter((k) => coin[k] > 0).map((k) => `${coin[k]} ${k}`).join(' · ')
      const set = (fields) => setItem(c.id, { coin: { ...coin, ...fields } })
      if (!unfound && excluded && !(coin.state_note || '').trim()) todo++
      rows.push(
        <li key={c.id} className="package-item" data-testid="package-coin">
          <label className="check">
            <input
              type="checkbox"
              aria-label={`${label} moving`}
              checked={!excluded}
              disabled={unfound}
              onChange={(e) => set(e.target.checked ? { state: undefined, state_note: undefined } : { state: 'consumed', state_note: '' })}
            />
            Coin: {label}
          </label>
          {unfound && <span className="muted"> — {EXCLUSION_REASON_LABELS.left_behind}: {POOL_NOT_FOUND_NOTE}</span>}
          {!unfound && excluded && <Why value={coin} label={label} onChange={set} />}
        </li>,
      )
    }
  }

  return (
    <section className="treasure-package" aria-label="Treasure package" data-testid="treasure-package">
      <h3>Treasure package</h3>
      {rows.length ? <ul className="package-list">{rows}</ul> : <p className="muted">No treasure in this encounter.</p>}
      <p className="muted" data-testid="package-coins">
        Coins: {formatGp(movingCp)} moving{excludedCp > 0 && ` · ${formatGp(excludedCp)} excluded`}
      </p>
      {todo > 0 && (
        <p className="error" data-testid="package-todo">
          {todo} {todo === 1 ? 'exclusion needs' : 'exclusions need'} a reason and a note before release.
        </p>
      )}
      <button onClick={onRelease} disabled={releasing || saving || todo > 0}>
        {releasing ? 'Releasing…' : 'Release to party'}
      </button>
    </section>
  )
}

// Reason + note for whatever part of a line/coin drop doesn't move.
function Why({ value, label, onChange }) {
  return (
    <span className="package-why">
      <select
        aria-label={`${label} reason`}
        value={value.state && value.state !== 'intact' ? value.state : ''}
        onChange={(e) => onChange({ state: e.target.value })}
      >
        <option value="" disabled>reason…</option>
        {EXCLUSION_REASONS.map((r) => (
          <option key={r} value={r}>{EXCLUSION_REASON_LABELS[r]}</option>
        ))}
      </select>
      <input
        aria-label={`${label} note`}
        placeholder="what happened"
        value={value.state_note || ''}
        onChange={(e) => onChange({ state_note: e.target.value })}
      />
    </span>
  )
}

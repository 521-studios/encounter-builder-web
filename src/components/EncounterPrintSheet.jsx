import { formatGp } from '@521studios/pfsrd2-display'
import {
  isCombatRoom,
  roomTypeLabel,
  gameIdOf,
  isCustomTreasure,
  REWARD_KIND_LABELS,
  CURRENCIES,
} from '../model.js'
import { BAND_LABELS } from '../pf2eRules.js'
import { creatureHeader } from '../creatureHeader.js'
import WikiMarkdown from './WikiMarkdown.jsx'
import TreasureBudget from './TreasureBudget.jsx'
import MonsterView from './MonsterView.jsx'
import HazardView from './HazardView.jsx'
import AfflictionView from './AfflictionView.jsx'

// A read-only, print-friendly sheet for the CURRENT encounter — the GM's paper
// copy. It reuses the same stat-block components the editor expands lazily
// (MonsterView/HazardView/AfflictionView), but mounts ALL of them up front (no
// showBlock gate) and renders the metadata as static text instead of form
// controls, so browser print / Save-as-PDF produces a clean handout. Rendered as
// a full-screen overlay from the editor (reusing its already-loaded enc + budget);
// the screen-only toolbar triggers window.print() once the blocks have loaded.
// Print CSS in styles.css hides everything but .print-sheet at @media print.
//
// Scope is a single encounter (the chapter map is chapter-level, not per-encounter
// — see u7dd). Value totals come from the shared TreasureBudget panel; the per-item
// list shows name + qty (the reliable, fetch-free fields), not per-line prices.

const noop = () => {}

const capitalize = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s)

// A derived (composed/runed) ref carries a base + modifications; its resolved
// item lives in ref.json. Mirrors budget.js's private isDerived.
const isDerivedRef = (t) => Boolean(t.ref?.base || t.ref?.modifications)

function treasureName(t, entryOf) {
  if (isCustomTreasure(t)) return t.ref?.json?.name || 'Custom item'
  if (isDerivedRef(t)) {
    const j = t.ref?.json
    return j?.name || j?.stat_block?.name || t.ref?.base?.game_id || 'Item'
  }
  const gid = gameIdOf(t)
  return (entryOf && entryOf(gid)?.name) || gid || 'Item'
}

function hazardLevel(gid, entryOf) {
  const e = entryOf ? entryOf(gid) : null
  return e ? (e.hazard || e).level : null
}

function afflictionLabel(gid, entryOf) {
  const e = entryOf ? entryOf(gid) : null
  const af = e ? e.affliction || e : null
  if (!af) return null
  const kind = capitalize(af.affliction_type || 'affliction')
  return af.level != null ? `${kind} ${af.level}` : af.level_text ? `${kind} ${af.level_text}` : kind
}

export default function EncounterPrintSheet({ enc, budget, effectiveParty, siblings = [], onClose }) {
  const monsters = enc.monsters || []
  const hazards = enc.hazards || []
  const afflictions = enc.afflictions || []
  const treasure = enc.treasure || []
  const awards = enc.xp_awards || []
  const rewards = enc.rewards || []
  const skillChecks = enc.skill_checks || []
  const exits = enc.exits || []
  const combat = isCombatRoom(budget.roomType)

  const coins = CURRENCIES.map((c) => [c, enc.currency?.[c] || 0]).filter(([, n]) => n > 0)
  const exitTargetName = (id) => {
    const t = (siblings).find((s) => String(s.id) === String(id))
    return t ? t.name || 'Untitled' : null
  }

  return (
    <div className="print-sheet" data-testid="print-sheet">
      <div className="print-toolbar">
        <button type="button" onClick={() => window.print()}>Save as PDF / Print</button>
        <button type="button" className="link" onClick={onClose}>Close</button>
        <span className="muted">Wait for stat blocks to load, then print.</span>
      </div>

      <header className="print-head">
        <h1 className="print-name">{enc.name || 'Untitled encounter'}</h1>
        <p className="print-meta">
          <span className="print-difficulty" data-testid="print-difficulty">
            {combat ? `${BAND_LABELS[budget.threat]} · level ${effectiveParty.level}` : roomTypeLabel(budget.roomType)}
          </span>
          {' · '}Treasure {formatGp(budget.cp)}
          {budget.totalXp > 0 ? ` · ${budget.totalXp} XP` : ''}
          {' · '}{effectiveParty.size} PCs
        </p>
      </header>

      {enc.description && (
        <section className="print-section">
          <WikiMarkdown text={enc.description} encounters={siblings} onOpenEncounter={noop} />
        </section>
      )}

      {enc.notes && (
        <section className="print-section">
          <h2>GM Notes</h2>
          <p className="print-notes">{enc.notes}</p>
        </section>
      )}

      {coins.length > 0 && (
        <section className="print-section">
          <h2>Coin</h2>
          <p>{coins.map(([c, n]) => `${n} ${c}`).join(' · ')}</p>
        </section>
      )}

      {monsters.length > 0 && (
        <section className="print-section">
          <h2>Monsters</h2>
          {monsters.map((m, i) => {
            const gid = gameIdOf(m)
            if (!gid) return null
            const hdr = creatureHeader(budget.entryOf ? budget.entryOf(gid) : null, m)
            const count = m.count || 1
            const name = m.nickname || (budget.entryOf && budget.entryOf(gid)?.name) || m.ref?.json?.name || gid
            return (
              <div className="print-entry" data-testid="print-monster" key={m._key || i}>
                <h3 className="print-entry-head">
                  {name}{count > 1 ? ` (${count})` : ''}
                  {hdr.level != null && <span className="print-entry-level"> — CREATURE {hdr.level}</span>}
                </h3>
                <MonsterView monster={m} onChange={noop} disabled />
              </div>
            )
          })}
        </section>
      )}

      {hazards.length > 0 && (
        <section className="print-section">
          <h2>Hazards</h2>
          {hazards.map((h, i) => {
            const gid = gameIdOf(h)
            if (!gid) return null
            const level = hazardLevel(gid, budget.entryOf)
            const count = h.count || 1
            const name = h.nickname || (budget.entryOf && budget.entryOf(gid)?.name) || gid
            return (
              <div className="print-entry" data-testid="print-hazard" key={h._key || i}>
                <h3 className="print-entry-head">
                  {name}{count > 1 ? ` (${count})` : ''}
                  {level != null && <span className="print-entry-level"> — HAZARD {level}</span>}
                </h3>
                <HazardView gameId={gid} />
              </div>
            )
          })}
        </section>
      )}

      {afflictions.length > 0 && (
        <section className="print-section">
          <h2>Afflictions</h2>
          {afflictions.map((a, i) => {
            const gid = gameIdOf(a)
            if (!gid) return null
            const label = afflictionLabel(gid, budget.entryOf)
            const count = a.count || 1
            const name = (budget.entryOf && budget.entryOf(gid)?.name) || gid
            return (
              <div className="print-entry" data-testid="print-affliction" key={a._key || i}>
                <h3 className="print-entry-head">
                  {name}{count > 1 ? ` (${count})` : ''}
                  {label && <span className="print-entry-level"> — {label}</span>}
                </h3>
                <AfflictionView gameId={gid} />
              </div>
            )
          })}
        </section>
      )}

      {treasure.length > 0 && (
        <section className="print-section">
          <h2>Treasure</h2>
          <ul className="print-treasure">
            {treasure.map((t, i) => (
              <li data-testid="print-treasure-item" key={t._key || i}>
                {(t.qty || 1) > 1 ? `${t.qty} × ` : ''}{treasureName(t, budget.entryOf)}
                {t.masked ? ` (masked: ${t.mask_label || 'Unidentified Item'})` : ''}
                {t.state && t.state !== 'intact' ? ` — ${t.state}` : ''}
              </li>
            ))}
          </ul>
        </section>
      )}

      {awards.length > 0 && (
        <section className="print-section">
          <h2>XP Awards</h2>
          <ul>
            {awards.map((a, i) => (
              <li key={a._key || i}>{a.amount || 0} XP — {a.reason || ''}</li>
            ))}
          </ul>
        </section>
      )}

      {rewards.length > 0 && (
        <section className="print-section">
          <h2>Rewards</h2>
          {rewards.map((r, i) => (
            <div className="print-reward" key={r._key || i}>
              <h3 className="print-entry-head">{REWARD_KIND_LABELS[r.kind] || r.kind}: {r.label || ''}</h3>
              {r.description && <WikiMarkdown text={r.description} encounters={siblings} onOpenEncounter={noop} />}
            </div>
          ))}
        </section>
      )}

      {skillChecks.length > 0 && (
        <section className="print-section">
          <h2>Skill Checks</h2>
          {skillChecks.map((s, i) => (
            <div className="print-skill-check" key={s._key || i}>
              <h3 className="print-entry-head">{s.skill || 'Skill'}{s.dc ? ` DC ${s.dc}` : ''}</h3>
              {s.description && <WikiMarkdown text={s.description} encounters={siblings} onOpenEncounter={noop} />}
            </div>
          ))}
        </section>
      )}

      {exits.length > 0 && (
        <section className="print-section">
          <h2>Exits</h2>
          <ul>
            {exits.map((ex, i) => {
              const target = ex.to_encounter_id ? exitTargetName(ex.to_encounter_id) : null
              const dest = ex.to_encounter_id ? (target || '(deleted encounter)') : (ex.label || 'External')
              const via = ex.to_encounter_id && ex.label ? ` (${ex.label})` : ''
              return <li key={ex._key || i}>→ {dest}{via}</li>
            })}
          </ul>
        </section>
      )}

      <TreasureBudget budget={budget} partyLevel={effectiveParty.level} partySize={effectiveParty.size} />
    </div>
  )
}

import { useMemo } from 'react'
import { createPortal } from 'react-dom'
import { formatGp } from '@521studios/pfsrd2-display'
import {
  isCombatRoom,
  roomTypeLabel,
  gameIdOf,
  isCustomTreasure,
  hasTreasureContent,
  REWARD_KIND_LABELS,
  CURRENCIES,
  skillCheckLabel,
  SKILL_CHECK_DEGREES,
  SKILL_CHECK_DEGREE_LABELS,
  migrateContent,
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
  const combat = isCombatRoom(budget.roomType)
  const exits = enc.exits || []
  // Walk the single ordered content list — the post-ugom source of truth — so the
  // sheet mirrors the GM's arrangement (prose, creatures, gated treasure pools, …)
  // instead of regrouping into fixed category sections and dropping the pool/gate
  // structure. `keyed()` always populates enc.content; `?? migrateContent` only fires
  // for a raw/legacy encounter (content absent), never for a migrated-but-empty one.
  // Memoized on enc: the fallback mints fresh UUIDs, so recomputing every render would
  // give unstable keys and remount the lazy stat-block views on each editor re-render.
  const items = useMemo(() => enc.content ?? migrateContent(enc), [enc])
  const entryOf = budget.entryOf
  const exitTargetName = (id) => {
    const t = siblings.find((s) => String(s.id) === String(id))
    return t ? t.name || 'Untitled' : null
  }

  // Render one content item by type, in place. Returns null for a blank in-progress
  // row (no creature/loot/text yet) so a half-filled item doesn't print as noise.
  const renderItem = (c, i) => {
    const key = c.id || i
    switch (c.type) {
      case 'markdown':
      case 'box_text': {
        const b = c.markdown || {}
        if (!b.title && !b.body) return null
        return (
          <section className={`print-section${c.type === 'box_text' ? ' print-boxtext' : ''}`} key={key} data-testid="print-block">
            {b.title && <h2 className="print-block-title">{b.title}</h2>}
            {b.body && <WikiMarkdown text={b.body} encounters={siblings} onOpenEncounter={noop} />}
          </section>
        )
      }
      case 'monster': {
        const m = c.monster || {}
        const gid = gameIdOf(m)
        if (!gid) return null
        const hdr = creatureHeader(entryOf ? entryOf(gid) : null, m)
        const count = m.count || 1
        const name = m.nickname || (entryOf && entryOf(gid)?.name) || m.ref?.json?.name || gid
        return (
          <div className="print-entry" data-testid="print-monster" key={key}>
            <h3 className="print-entry-head">
              {name}{count > 1 ? ` (${count})` : ''}
              {hdr.level != null && <span className="print-entry-level"> — CREATURE {hdr.level}</span>}
            </h3>
            <MonsterView monster={m} onChange={noop} disabled />
          </div>
        )
      }
      case 'hazard': {
        const h = c.monster || {}
        const gid = gameIdOf(h)
        if (!gid) return null
        const level = hazardLevel(gid, entryOf)
        const count = h.count || 1
        const name = h.nickname || (entryOf && entryOf(gid)?.name) || gid
        return (
          <div className="print-entry" data-testid="print-hazard" key={key}>
            <h3 className="print-entry-head">
              {name}{count > 1 ? ` (${count})` : ''}
              {level != null && <span className="print-entry-level"> — HAZARD {level}</span>}
            </h3>
            <HazardView gameId={gid} />
          </div>
        )
      }
      case 'affliction': {
        const a = c.monster || {}
        const gid = gameIdOf(a)
        if (!gid) return null
        const label = afflictionLabel(gid, entryOf)
        const count = a.count || 1
        const name = (entryOf && entryOf(gid)?.name) || gid
        return (
          <div className="print-entry" data-testid="print-affliction" key={key}>
            <h3 className="print-entry-head">
              {name}{count > 1 ? ` (${count})` : ''}
              {label && <span className="print-entry-level"> — {label}</span>}
            </h3>
            <AfflictionView gameId={gid} />
          </div>
        )
      }
      case 'skill_check': {
        const s = c.skill_check || {}
        if (!s.skill && !(s.dc > 0)) return null
        return (
          <div className="print-skill-check" data-testid="print-skill-check" key={key}>
            <h3 className="print-entry-head">{skillCheckLabel(s)}</h3>
            {s.description && <WikiMarkdown text={s.description} encounters={siblings} onOpenEncounter={noop} />}
            {s.outcomes && SKILL_CHECK_DEGREES.some((d) => (s.outcomes[d] || '').trim()) && (
              <ul className="print-outcomes">
                {SKILL_CHECK_DEGREES.filter((d) => (s.outcomes[d] || '').trim()).map((d) => (
                  <li key={d}><strong>{SKILL_CHECK_DEGREE_LABELS[d]}</strong> {s.outcomes[d]}</li>
                ))}
              </ul>
            )}
          </div>
        )
      }
      case 'pool': {
        // A treasure-pool HEADER: the loot items that follow it (until the next pool)
        // are its finds; a discovery gate reads "🔒 Skill DC N". A bare default pool
        // (no name, no gate) is a positional no-op — nothing to print.
        const p = c.pool || {}
        const gate = p.gate
        const hasGate = gate && (gate.skill || gate.dc)
        if (!p.name && !hasGate) return null
        return (
          <div className="print-pool" data-testid="print-pool" key={key}>
            <h2 className="print-pool-head">
              {p.name || 'Treasure'}
              {hasGate && (
                <span className="print-pool-gate"> — 🔒 {gate.skill || 'Skill'}{gate.dc ? ` DC ${gate.dc}` : ''}</span>
              )}
            </h2>
          </div>
        )
      }
      case 'treasure': {
        const t = c.treasure || {}
        if (!hasTreasureContent(t)) return null
        return (
          <div className="print-treasure-line" data-testid="print-treasure-item" key={key}>
            {(t.qty || 1) > 1 ? `${t.qty} × ` : ''}{treasureName(t, entryOf)}
            {t.masked ? ` (masked: ${t.mask_label || 'Unidentified Item'})` : ''}
            {t.state && t.state !== 'intact' ? ` — ${t.state}` : ''}
          </div>
        )
      }
      case 'coin': {
        const coin = c.coin || {}
        const parts = CURRENCIES.map((cc) => [cc, coin[cc] || 0]).filter(([, n]) => n > 0)
        if (!parts.length) return null
        return (
          <p className="print-coin" data-testid="print-coin" key={key}>
            Coin: {parts.map(([cc, n]) => `${n} ${cc}`).join(' · ')}
          </p>
        )
      }
      case 'xp_award': {
        const a = c.xp_award || {}
        if (!(a.amount > 0)) return null
        return <p className="print-xp" key={key}>{a.amount} XP — {a.reason || ''}</p>
      }
      case 'reward': {
        const r = c.reward || {}
        if (!r.label && !r.description) return null
        return (
          <div className="print-reward" data-testid="print-reward" key={key}>
            <h3 className="print-entry-head">{REWARD_KIND_LABELS[r.kind] || r.kind}: {r.label || ''}</h3>
            {r.description && <WikiMarkdown text={r.description} encounters={siblings} onOpenEncounter={noop} />}
          </div>
        )
      }
      default:
        return null
    }
  }

  // Portal to <body> so the sheet is NOT nested inside the editor's `.main`
  // (overflow-y: auto, height-constrained). Nested, the @media print rules
  // couldn't lift it out of that clipping container or above the hidden editor
  // content; at body level, print can simply hide #root and let the sheet flow
  // from the top of the page. Context/props still flow — a portal stays in the
  // React tree, only the DOM parent changes.
  return createPortal(
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

      {/* The encounter body, in the GM's own order (prose, creatures, skill checks,
          treasure pools with their gated loot, coin, XP, rewards). */}
      {items.map(renderItem)}

      {enc.notes && (
        <section className="print-section">
          <h2>GM Notes</h2>
          <p className="print-notes">{enc.notes}</p>
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
    </div>,
    document.body,
  )
}

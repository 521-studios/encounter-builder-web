import { creatureLevel } from '@521studios/pfsrd2-display'

// Book-style collapsed-header fields for a monster line, read from its resolved
// pfsrd2 entry — the stat header the Paizo APs print before the full block:
//
//   {NAME} ({count})            CREATURE {level}
//   {Source book} {page}
//   Initiative {stat} {modifier}
//
// A derived (templated) ref carries the resolved creature snapshot in `ref.json`
// — its level, senses, and citation already reflect every applied template, so the
// collapsed header reads it directly and stays in step with the expanded stat block
// (which the library renders from the same resolved creature via creatureLevel). A
// snapshot that yields no readable level is treated as unusable and we fall back to
// the base `entry` (mirroring budget.js, which routes a null-level monster to
// `unknown`) rather than blanking the header. Pristine refs use the base entry plus
// the legacy elite/weak `adjustment` shift. Initiative is Perception-based: pfsrd2
// creatures carry no explicit initiative skill (0 of 4452 do), so — like the
// library's stat block — it comes from Perception. Returns nulls for fields the
// source doesn't supply (or when nothing has loaded yet).
export function creatureHeader(entry, monster = {}) {
  const snapshot = monster.ref?.json || null
  const snapLevel = snapshot ? creatureLevel(snapshot) : null
  const useSnapshot = snapLevel != null // trust the snapshot only when it resolves a level
  const c = useSnapshot ? snapshot : entry
  if (!c) return { level: null, source: null, initiative: null }

  let level
  if (useSnapshot) {
    // The snapshot's level already includes every applied template — no extra shift.
    level = snapLevel
  } else {
    // Base entry (pristine ref, or a fallback from an unusable snapshot) + the legacy
    // elite/weak adjustment shift.
    const base = creatureLevel(c)
    let shift = 0
    if (monster.adjustment === 'elite') shift = 1
    else if (monster.adjustment === 'weak') shift = -1
    level = base == null ? null : base + shift
  }

  // Mirror the library's shape tolerance (creatureLevel: entry.stat_block || entry),
  // so this works whether the source is a full entry or a bare creature.
  const sb = c.stat_block || c
  const src = (sb.sources || c.sources || [])[0]
  const source = src && src.name ? `${src.name}${src.page != null ? ` ${src.page}` : ''}` : null

  const perc = sb.senses?.perception?.value
  const initiative = typeof perc === 'number' ? `Perception ${perc >= 0 ? '+' : ''}${perc}` : null

  return { level, source, initiative }
}

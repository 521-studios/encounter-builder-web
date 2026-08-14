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
// (which the library renders from the same resolved creature via creatureLevel).
// Pristine refs fall back to the base `entry` plus the legacy elite/weak `adjustment`
// shift. Initiative is Perception-based: pfsrd2 creatures carry no explicit
// initiative skill (0 of 4452 do), so — like the library's stat block — it comes
// from Perception. Returns nulls for fields the source doesn't supply (or when it
// hasn't loaded yet).
export function creatureHeader(entry, monster = {}) {
  const templated = monster.ref?.json || null
  const c = templated || entry
  if (!c) return { level: null, source: null, initiative: null }

  // Mirror the library's shape tolerance (creatureLevel: entry.stat_block || entry),
  // so this works whether the resolved snapshot is a full entry or a bare creature.
  const sb = c.stat_block || c
  const base = creatureLevel(c)
  // ref.json's level already includes the templates; only the legacy adjustment
  // field (pristine refs) still needs a manual shift.
  const shift = templated ? 0 : monster.adjustment === 'elite' ? 1 : monster.adjustment === 'weak' ? -1 : 0
  const level = base == null ? null : base + shift

  const src = (sb.sources || c.sources || [])[0]
  const source = src && src.name ? `${src.name}${src.page != null ? ` ${src.page}` : ''}` : null

  const perc = sb.senses?.perception?.value
  const initiative = typeof perc === 'number' ? `Perception ${perc >= 0 ? '+' : ''}${perc}` : null

  return { level, source, initiative }
}

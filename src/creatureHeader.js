import { creatureLevel } from '@521studios/pfsrd2-display'

// Book-style collapsed-header fields for a monster line, read from its resolved
// pfsrd2 entry — the stat header the Paizo APs print before the full block:
//
//   {NAME} ({count})            CREATURE {level}
//   {Source book} {page}
//   Initiative {stat} {modifier}
//
// Level matches the budget's resolution (base creature level + elite/weak
// adjustment; see creatureXp). Initiative is Perception-based: pfsrd2 creatures
// carry no explicit initiative skill (0 of 4452 do), so — like the library's
// stat block — it comes from Perception. Returns nulls for fields the entry
// doesn't supply (or when it hasn't loaded yet).
export function creatureHeader(entry, monster = {}) {
  if (!entry) return { level: null, source: null, initiative: null }

  const base = creatureLevel(entry)
  const shift = monster.adjustment === 'elite' ? 1 : monster.adjustment === 'weak' ? -1 : 0
  const level = base == null ? null : base + shift

  const sb = entry.stat_block || {}
  const src = (sb.sources || entry.sources || [])[0]
  const source = src && src.name ? `${src.name}${src.page != null ? ` ${src.page}` : ''}` : null

  const perc = sb.senses?.perception?.value
  const initiative = typeof perc === 'number' ? `Perception ${perc >= 0 ? '+' : ''}${perc}` : null

  return { level, source, initiative }
}

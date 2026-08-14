// PF2e encounter-budgeting rules constants + pure calculators. The numbers are
// game-mechanic facts from the published tables (AoN Rules ID 2715): Table 5-3
// (Treasure by Encounter), Table 10-1 (Encounter Budget), Table 10-2 (Creature
// XP and Role). Used by the treasure-value / difficulty chart.

// Table 5-3 — Treasure by Encounter, per party level 1..20, in gp: the total per
// level, then the per-encounter budget by threat band (Low..Extreme).
export const TREASURE_BY_LEVEL = {
  1: { total: 175, low: 13, moderate: 18, severe: 26, extreme: 35 },
  2: { total: 300, low: 23, moderate: 30, severe: 45, extreme: 60 },
  3: { total: 500, low: 38, moderate: 50, severe: 75, extreme: 100 },
  4: { total: 850, low: 65, moderate: 85, severe: 130, extreme: 170 },
  5: { total: 1350, low: 100, moderate: 135, severe: 200, extreme: 270 },
  6: { total: 2000, low: 150, moderate: 200, severe: 300, extreme: 400 },
  7: { total: 2900, low: 220, moderate: 290, severe: 440, extreme: 580 },
  8: { total: 4000, low: 300, moderate: 400, severe: 600, extreme: 800 },
  9: { total: 5700, low: 430, moderate: 570, severe: 860, extreme: 1140 },
  10: { total: 8000, low: 600, moderate: 800, severe: 1200, extreme: 1600 },
  11: { total: 11500, low: 865, moderate: 1150, severe: 1725, extreme: 2300 },
  12: { total: 16500, low: 1250, moderate: 1650, severe: 2475, extreme: 3300 },
  13: { total: 25000, low: 1875, moderate: 2500, severe: 3750, extreme: 5000 },
  14: { total: 36500, low: 2750, moderate: 3650, severe: 5500, extreme: 7300 },
  15: { total: 54500, low: 4100, moderate: 5450, severe: 8200, extreme: 10900 },
  16: { total: 82500, low: 6200, moderate: 8250, severe: 12400, extreme: 16500 },
  17: { total: 128000, low: 9600, moderate: 12800, severe: 19200, extreme: 25600 },
  18: { total: 208000, low: 15600, moderate: 20800, severe: 31200, extreme: 41600 },
  19: { total: 355000, low: 26600, moderate: 35500, severe: 53250, extreme: 71000 },
  20: { total: 490000, low: 36800, moderate: 49000, severe: 73500, extreme: 98000 },
}

// The threat bands, low→high. "trivial" has no treasure column (Table 5-3 starts
// at Low), so the chart shows Low..Extreme.
export const TREASURE_BANDS = ['low', 'moderate', 'severe', 'extreme']

// Table 10-1 — Encounter Budget: XP per threat for a 4-PC party, plus the
// per-additional/fewer-character adjustment.
export const ENCOUNTER_BUDGET = {
  trivial: { xp: 40, adjust: 10 },
  low: { xp: 60, adjust: 20 },
  moderate: { xp: 80, adjust: 20 },
  severe: { xp: 120, adjust: 30 },
  extreme: { xp: 160, adjust: 40 },
}

// Display labels for the threat bands — the single band vocabulary shared by the
// difficulty badge and the budget chart so they can't drift.
export const BAND_LABELS = { trivial: 'Trivial', low: 'Low', moderate: 'Moderate', severe: 'Severe', extreme: 'Extreme' }

// Table 10-2 — Creature XP by level relative to the party. Outside -4..+4 a
// single creature is off-table; below -4 it's negligible (0), above +4 it's
// capped at the +4 value.
const CREATURE_XP_BY_REL = { '-4': 10, '-3': 15, '-2': 20, '-1': 30, 0: 40, 1: 60, 2: 80, 3: 120, 4: 160 }

const MIN_LEVEL = 1
const MAX_LEVEL = 20
export const BASE_PARTY = 4

function clampLevel(level) {
  return Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, level))
}

// treasureBudget: the Table 5-3 gp value for a party level + band, scaled
// linearly from the 4-PC baseline (a 5-PC party expects 25% more, etc.). null
// for an unknown band. Level is clamped to 1..20.
export function treasureBudget(level, band, partySize = BASE_PARTY) {
  const row = TREASURE_BY_LEVEL[clampLevel(level)]
  const base = row && row[band]
  if (base == null) return null
  return Math.round((base * partySize) / BASE_PARTY)
}

// treasureTotalForLevel: the "Total Treasure per Level" (all encounters combined
// to advance a level), scaled by party size. A reference figure for the campaign
// rollup.
export function treasureTotalForLevel(level, partySize = BASE_PARTY) {
  const row = TREASURE_BY_LEVEL[clampLevel(level)]
  return row ? Math.round((row.total * partySize) / BASE_PARTY) : null
}

// creatureXp: one creature's XP contribution. adjustment shifts its level by
// elite (+1) / weak (-1) before comparing to the party level. A null level
// contributes 0 defensively — but callers that must *flag* an unreadable level
// (see budget.js#encounterXp) check for it themselves; this 0 is not that signal.
export function creatureXp(creatureLevel, partyLevel, adjustment = 'none') {
  if (creatureLevel == null) return 0
  const shift = adjustment === 'elite' ? 1 : adjustment === 'weak' ? -1 : 0
  const rel = creatureLevel + shift - partyLevel
  if (rel < -4) return 0
  if (rel > 4) return CREATURE_XP_BY_REL[4]
  return CREATURE_XP_BY_REL[rel]
}

// budgetFor: the scaled XP budget for a threat at a given party size
// (Table 10-1: base + adjust × (size − 4)).
export function budgetFor(band, partySize = BASE_PARTY) {
  const b = ENCOUNTER_BUDGET[band]
  if (!b) return null
  return b.xp + b.adjust * (partySize - BASE_PARTY)
}

// encounterThreat: classify a total XP sum into a threat band for the party
// size — the highest band whose scaled budget the sum reaches (trivial below Low).
// An empty roster (0 XP) is always Trivial, even for small parties whose scaled
// Low budget rounds to 0 or below.
export function encounterThreat(xpSum, partySize = BASE_PARTY) {
  if (xpSum <= 0) return 'trivial'
  for (const band of ['extreme', 'severe', 'moderate', 'low']) {
    if (xpSum >= budgetFor(band, partySize)) return band
  }
  return 'trivial'
}

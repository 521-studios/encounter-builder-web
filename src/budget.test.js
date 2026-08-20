import { test } from 'node:test'
import assert from 'node:assert/strict'
import { treasureValueCp, treasureStanding, encounterXp, hazardXp, afflictionXp, awardXp, refGameId, gameIdsInEncounter } from './budget.js'

// Minimal fake entries keyed by game_id.
const ITEMS = {
  'Weapons:1': { stat_block: { price: { value: 100, currency: 'gp' } } }, // 10000 cp
  'Equipment:sp': { stat_block: { price: { value: 5, currency: 'sp' } } }, // 50 cp
  'Equipment:varies': { stat_block: { price: { value: null, text: '-' } } }, // Varies
}
const CREATURES = {
  'Monsters:goblin': { stat_block: { creature_type: { level: 1 } } },
  'Monsters:dragon': { stat_block: { creature_type: { level: 10 } } },
}
// Hazards are flat under `hazard` (not stat_block) — level lives there.
const HAZARDS = {
  'Hazards:noose': { hazard: { level: 2 } },
  'Hazards:drawbridge': { hazard: { level: 1 } },
}
// Afflictions are flat under `affliction`; a Varies-level one has level_text, no level.
const AFFLICTIONS = {
  'Diseases:blue': { affliction: { affliction_type: 'disease', level: 3 } },
  'Curses:varies': { affliction: { affliction_type: 'curse', level_text: 'Varies' } },
}
const entryOf = (id) => ITEMS[id] || CREATURES[id] || HAZARDS[id] || AFFLICTIONS[id] || null

test('refGameId reads pristine and derived-base refs', () => {
  assert.equal(refGameId({ game_id: 'Weapons:1' }), 'Weapons:1')
  assert.equal(refGameId({ base: { game_id: 'Weapons:1' } }), 'Weapons:1')
  assert.equal(refGameId({}), '')
})

test('treasureValueCp sums coins + item prices × qty', () => {
  const { cp, unpriced } = treasureValueCp(
    [
      { ref: { game_id: 'Weapons:1' }, qty: 2 }, // 2 × 10000 = 20000
      { ref: { game_id: 'Equipment:sp' }, qty: 3 }, // 3 × 50 = 150
    ],
    { gp: 5 }, // 500 cp
    entryOf,
  )
  assert.equal(cp, 20000 + 150 + 500)
  assert.equal(unpriced.length, 0)
})

test('treasureValueCp flags Varies / derived / missing lines as unpriced (not 0)', () => {
  const { cp, unpriced } = treasureValueCp(
    [
      { ref: { game_id: 'Equipment:varies' }, qty: 1 }, // Varies -> unpriced
      { ref: { base: { game_id: 'Weapons:1' }, modifications: [{}] }, qty: 1 }, // runed/derived
      { ref: { game_id: 'Weapons:missing' }, qty: 1 }, // entry not loaded
    ],
    {},
    entryOf,
  )
  assert.equal(cp, 0)
  assert.equal(unpriced.length, 3)
})

test('treasureValueCp sums a composed item by its ref.price_cp × qty; one without stays unpriced', () => {
  const { cp, unpriced } = treasureValueCp(
    [
      // +1 striking longsword: base 1 gp + 35 gp potency + 65 gp striking = 101 gp = 10100 cp
      { ref: { base: { game_id: 'Weapons:1' }, modifications: [{}, {}], price_cp: 10100 }, qty: 2 },
      // a derived item whose components weren't all priced → no total → unpriced (floors)
      { ref: { base: { game_id: 'Weapons:1' }, modifications: [{}] }, qty: 1 },
    ],
    {},
    entryOf,
  )
  assert.equal(cp, 10100 * 2) // the composed line counts; the unpriced one contributes 0
  assert.equal(unpriced.length, 1)
})

test('treasureValueCp values a custom (freeform) item by its gp value × qty', () => {
  const { cp, unpriced } = treasureValueCp(
    [
      { ref: { json: { name: 'peridot bead', value_cp: 200 } }, qty: 2 }, // 2 × 2 gp = 400 cp
      { ref: { json: { name: 'chipped tooth', value_cp: 0 } }, qty: 1 }, // worthless trophy — valued 0, not unpriced
    ],
    { gp: 1 }, // 100 cp
    entryOf,
  )
  assert.equal(cp, 400 + 0 + 100)
  assert.equal(unpriced.length, 0)
})

test('treasureValueCp flags a custom item with no entered value as unpriced (floor)', () => {
  const { cp, unpriced } = treasureValueCp(
    [{ ref: { json: { name: 'mysterious gem', value_cp: null } }, qty: 1 }],
    {},
    entryOf,
  )
  assert.equal(cp, 0)
  assert.equal(unpriced.length, 1)
})

test('treasureStanding: low/on/high vs target, and no false low on an incomplete floor', () => {
  const target = 100 // gp
  // Complete values compare directly against the target (in copper).
  assert.deepEqual(treasureStanding(6000, target, false), { verdict: 'low', floor: false }) // 60 gp < 100
  assert.deepEqual(treasureStanding(10000, target, false), { verdict: 'on', floor: false }) // exactly 100 gp
  assert.deepEqual(treasureStanding(15000, target, false), { verdict: 'high', floor: false }) // 150 gp > 100
  // A floor below target yields NO verdict (the unpriced items might still fill it),
  // but a floor already over target is safely "high".
  assert.deepEqual(treasureStanding(6000, target, true), { verdict: null, floor: true })
  assert.deepEqual(treasureStanding(15000, target, true), { verdict: 'high', floor: true })
  // No target (Trivial / non-combat) → no verdict, floor flag still passes through.
  assert.deepEqual(treasureStanding(6000, null, false), { verdict: null, floor: false })
  assert.deepEqual(treasureStanding(0, null, true), { verdict: null, floor: true })
})

test('treasureValueCp budgets a value_tiers line at the Success tier × qty (best case)', () => {
  const { cp, unpriced } = treasureValueCp(
    [
      // B9 harvested gear: success 40 gp, failure 20, crit-fail 0 → budget the 40.
      { ref: { json: { name: 'intricate gear' } }, qty: 1, value_tiers: { success: 4000, failure: 2000, crit_failure: 0 } },
      // Only crit_success set → falls back to it (no success tier).
      { ref: { game_id: 'Weapons:1' }, qty: 2, value_tiers: { crit_success: 100 } },
    ],
    {},
    entryOf,
  )
  assert.equal(cp, 4000 + 100 * 2)
  assert.equal(unpriced.length, 0)
})

test('treasureValueCp flags a value_tiers line with no numeric tier as unpriced', () => {
  const { cp, unpriced } = treasureValueCp([{ ref: { game_id: 'Weapons:1' }, qty: 1, value_tiers: {} }], {}, entryOf)
  assert.equal(cp, 0)
  assert.equal(unpriced.length, 1)
})

test('treasureValueCp skips destroyed loot', () => {
  const { cp } = treasureValueCp(
    [{ ref: { game_id: 'Weapons:1' }, qty: 1, state: 'destroyed' }],
    {},
    entryOf,
  )
  assert.equal(cp, 0)
})

test('encounterXp sums creature XP vs party level, honoring count + elite/weak', () => {
  const { xp, unknown } = encounterXp(
    [
      { ref: { game_id: 'Monsters:goblin' }, count: 4 }, // level 1 vs PL 5 = PL-4 = 10 each -> 40
      { ref: { game_id: 'Monsters:dragon' }, count: 1, adjustment: 'elite' }, // 10+1=11 vs 5 = PL+6 -> cap 160
    ],
    5,
    entryOf,
  )
  assert.equal(xp, 40 + 160)
  assert.equal(unknown.length, 0)
})

test('hazardXp sums hazard XP like creatures (level from the flat hazard doc, × count)', () => {
  // A Hazard N is worth the same XP as a Creature N. vs PL 2: a level-2 noose = PL+0
  // = 40 each; two of them (B30's Web Lurker Nooses) = 80. A level-1 = PL-1 = 30.
  const { xp, unknown } = hazardXp(
    [
      { ref: { game_id: 'Hazards:noose' }, count: 2 }, // 2 × 40 = 80
      { ref: { game_id: 'Hazards:drawbridge' }, count: 1 }, // 30
    ],
    2,
    entryOf,
  )
  assert.equal(xp, 80 + 30)
  assert.equal(unknown.length, 0)
})

test('hazardXp reports a hazard whose entry/level cannot be read as unknown', () => {
  const { xp, unknown } = hazardXp([{ ref: { game_id: 'Hazards:missing' }, count: 1 }], 2, entryOf)
  assert.equal(xp, 0)
  assert.equal(unknown.length, 1)
})

test('afflictionXp counts a leveled affliction like a creature; a Varies-level one is 0 (not unknown)', () => {
  const { xp, unknown } = afflictionXp(
    [
      { ref: { game_id: 'Diseases:blue' }, count: 1 }, // Disease 3 vs PL 3 = PL+0 = 40
      { ref: { game_id: 'Curses:varies' }, count: 1 }, // Varies → no level → 0, not unknown
    ],
    3,
    entryOf,
  )
  assert.equal(xp, 40)
  assert.equal(unknown.length, 0) // the Varies affliction is a deliberate 0, not unknown
})

test('afflictionXp reports an unresolved entry as unknown', () => {
  const { xp, unknown } = afflictionXp([{ ref: { game_id: 'Diseases:missing' }, count: 1 }], 3, entryOf)
  assert.equal(xp, 0)
  assert.equal(unknown.length, 1)
})

test('gameIdsInEncounter includes hazard refs (so their entries prefetch)', () => {
  const ids = gameIdsInEncounter({
    monsters: [{ ref: { game_id: 'Monsters:goblin' } }],
    hazards: [{ ref: { game_id: 'Hazards:noose' } }],
  })
  assert.ok(ids.includes('Hazards:noose'))
})

test('gameIdsInEncounter includes affliction refs (so their entries prefetch), skipping ref-less', () => {
  const ids = gameIdsInEncounter({
    monsters: [{ ref: { game_id: 'Monsters:goblin' } }],
    afflictions: [{ ref: { game_id: 'Diseases:blue' } }, { ref: { game_id: '' } }], // ref-less skipped
  })
  assert.ok(ids.includes('Diseases:blue'))
  assert.ok(!ids.includes('')) // an unfilled affliction slot contributes no id
})

test('encounterXp counts a templated monster at its resolved ref.json level, not the base', () => {
  // hq4t/21ro shared root cause: elite/weak is applied via the TemplatePicker, which
  // writes a derived ref.json (resolved creature) — NOT the legacy adjustment field.
  // The budget must read that resolved level. Elite goblin -> Creature 2, vs PL 1 =
  // PL+1 = 60 XP (base goblin Creature 1 would be PL+0 = 40).
  const { xp, unknown } = encounterXp(
    [
      {
        ref: {
          base: { game_id: 'Monsters:goblin' },
          modifications: [{ template_game_id: 'elite', template_name: 'Elite' }],
          json: { stat_block: { creature_type: { level: 2 } } },
        },
        count: 1,
      },
    ],
    1,
    entryOf,
  )
  assert.equal(xp, 60)
  assert.equal(unknown.length, 0)
})
test('encounterXp flags a templated monster whose resolved ref.json has no readable level', () => {
  // The resolved branch must route a null-level snapshot to `unknown` (floors the
  // budget + drives the UI warning), same as the pristine entry-not-loaded path — not
  // silently count it as 0.
  const { xp, unknown } = encounterXp([{ ref: { json: { stat_block: {} } }, count: 1 }], 1, entryOf)
  assert.equal(xp, 0)
  assert.equal(unknown.length, 1)
})
test('encounterXp honors a level-0 resolved snapshot (counts it, not routed to unknown)', () => {
  // Weak-templated Creature 0 vs PL 1 = PL-1 = 30 XP; `lvl == null` must be false for
  // level 0 so it counts rather than falling into `unknown`.
  const { xp, unknown } = encounterXp(
    [{ ref: { json: { stat_block: { creature_type: { level: 0 } } } }, count: 1 }],
    1,
    entryOf,
  )
  assert.equal(xp, 30)
  assert.equal(unknown.length, 0)
})
test('encounterXp flags monsters whose level cannot be read', () => {
  const { xp, unknown } = encounterXp([{ ref: { game_id: 'Monsters:missing' }, count: 1 }], 5, entryOf)
  assert.equal(xp, 0)
  assert.equal(unknown.length, 1)
})

test('gameIdsInEncounter dedupes and skips derived + destroyed', () => {
  const ids = gameIdsInEncounter({
    monsters: [
      { ref: { game_id: 'Monsters:goblin' } },
      { ref: { game_id: 'Monsters:goblin' } }, // dup
      { ref: { base: { game_id: 'Monsters:templated' }, modifications: [{}] } }, // derived -> skip
    ],
    treasure: [
      { ref: { game_id: 'Weapons:1' } },
      { ref: { game_id: 'Weapons:2' }, state: 'destroyed' }, // skip
    ],
  })
  assert.deepEqual(ids.sort(), ['Monsters:goblin', 'Weapons:1'])
})

import { rollupEncounters, rollupByChapter } from './budget.js'

test('rollupEncounters aggregates treasure vs summed per-encounter budgets + breakdown', () => {
  const items = { 'W:1': { stat_block: { price: { value: 100, currency: 'gp' } } } } // 10000 cp
  const creatures = { 'M:1': { stat_block: { creature_type: { level: 5 } } } } // PL creature
  const entryOf = (id) => items[id] || creatures[id] || null
  // Two encounters, both at party level 5 / 4 PCs.
  const partyFor = () => ({ level: 5, size: 4 })
  const encounters = [
    // 1 PL-creature (40 XP -> Trivial: no target) + 1 gp item worth 100 gp
    { id: 'e1', name: 'A', monsters: [{ ref: { game_id: 'M:1' }, count: 1 }], treasure: [{ ref: { game_id: 'W:1' }, qty: 1 }], currency: {} },
    // 3 PL-creatures (120 XP -> Severe; L5 severe target = 200 gp) + 20 gp coin
    { id: 'e2', name: 'B', monsters: [{ ref: { game_id: 'M:1' }, count: 3 }], treasure: [], currency: { gp: 20 } },
  ]
  const { totalCp, totalTargetCp, rows, anyIncomplete } = rollupEncounters(encounters, entryOf, partyFor)
  assert.equal(totalCp, 10000 + 2000) // 100 gp item + 20 gp coin
  assert.equal(rows.length, 2)
  assert.equal(rows[0].threat, 'trivial') // 40 XP
  assert.equal(rows[0].targetCp, 0) // trivial has no treasure target
  assert.equal(rows[1].threat, 'severe') // 120 XP
  assert.equal(rows[1].targetCp, 200 * 100) // L5 severe = 200 gp
  assert.equal(totalTargetCp, 0 + 200 * 100)
  assert.equal(anyIncomplete, false)
})

test('rollupEncounters sums XP per row and in total (difficulty as a number)', () => {
  const creatures = { 'M:1': { stat_block: { creature_type: { level: 5 } } } } // PL at party 5
  const entryOf = (id) => creatures[id] || null
  const partyFor = () => ({ level: 5, size: 4 })
  const r = rollupEncounters(
    [
      { id: 'e1', name: 'A', monsters: [{ ref: { game_id: 'M:1' }, count: 1 }], treasure: [], currency: {} }, // 40 XP
      { id: 'e2', name: 'B', monsters: [{ ref: { game_id: 'M:1' }, count: 3 }], treasure: [], currency: {} }, // 120 XP
    ],
    entryOf,
    partyFor,
  )
  assert.equal(r.rows[0].xp, 40)
  assert.equal(r.rows[1].xp, 120)
  assert.equal(r.totalXp, 160)
})

test('rollupEncounters folds hazard XP into each row (a Hazard N counts like a Creature N)', () => {
  const entryOf = (id) =>
    ({
      'M:1': { stat_block: { creature_type: { level: 5 } } }, // Creature 5 vs PL 5 = 40
      'Hazards:1': { hazard: { level: 5 } }, // Hazard 5 vs PL 5 = 40 (flat under `hazard`)
    })[id] || null
  const partyFor = () => ({ level: 5, size: 4 })
  const r = rollupEncounters(
    [
      {
        id: 'e1', name: 'A',
        monsters: [{ ref: { game_id: 'M:1' }, count: 1 }],
        hazards: [{ ref: { game_id: 'Hazards:1' }, count: 1 }],
        treasure: [], currency: {},
      },
    ],
    entryOf,
    partyFor,
  )
  assert.equal(r.rows[0].xp, 80) // 40 creature + 40 hazard
})

test('rollupEncounters folds affliction XP + unknowns into each row', () => {
  const entryOf = (id) =>
    ({
      'M:1': { stat_block: { creature_type: { level: 5 } } }, // Creature 5 vs PL 5 = 40
      'Diseases:1': { affliction: { affliction_type: 'disease', level: 5 } }, // Disease 5 vs PL 5 = 40
    })[id] || null
  const partyFor = () => ({ level: 5, size: 4 })
  const r = rollupEncounters(
    [
      {
        id: 'e1', name: 'A',
        monsters: [{ ref: { game_id: 'M:1' }, count: 1 }],
        afflictions: [{ ref: { game_id: 'Diseases:1' }, count: 1 }],
        treasure: [], currency: {},
      },
      {
        id: 'e2', name: 'B',
        monsters: [],
        afflictions: [{ ref: { game_id: 'Diseases:missing' }, count: 1 }], // unresolved -> floors + flags
        treasure: [], currency: {},
      },
    ],
    entryOf,
    partyFor,
  )
  assert.equal(r.rows[0].xp, 80) // 40 creature + 40 affliction
  assert.equal(r.rows[1].incomplete, true) // aUnknown flows into the row's floor flag
})

test('awardXp sums non-combat XP awards (coercing/ignoring blanks)', () => {
  assert.equal(awardXp({ xp_awards: [{ amount: 30 }, { amount: 15 }] }), 45)
  assert.equal(awardXp({ xp_awards: [{ amount: '20' }, { amount: '' }, {}] }), 20) // string coerced, blanks -> 0
  assert.equal(awardXp({}), 0)
  assert.equal(awardXp(null), 0)
})

test('rollupEncounters: awards add to XP total/row but never to combat threat or treasure target', () => {
  const creatures = { 'M:1': { stat_block: { creature_type: { level: 5 } } } } // PL at party 5
  const entryOf = (id) => creatures[id] || null
  const partyFor = () => ({ level: 5, size: 4 })
  // 1 PL creature = 40 XP (Trivial, no treasure target) + a 30 XP non-combat award.
  const r = rollupEncounters(
    [{ id: 'e1', name: 'A', monsters: [{ ref: { game_id: 'M:1' }, count: 1 }], treasure: [], currency: {}, xp_awards: [{ amount: 30 }] }],
    entryOf,
    partyFor,
  )
  assert.equal(r.rows[0].xp, 70) // 40 combat + 30 award (advancement)
  assert.equal(r.rows[0].threat, 'trivial') // band still from the 40 combat XP, not 70
  assert.equal(r.rows[0].targetCp, 0) // trivial → no treasure target; award doesn't create one
  assert.equal(r.totalXp, 70)
})

test('rollupEncounters: a non-combat room suppresses threat + target but keeps loot value and award XP', () => {
  const items = { 'W:1': { stat_block: { price: { value: 100, currency: 'gp' } } } } // 10000 cp
  const entryOf = (id) => items[id] || null
  const partyFor = () => ({ level: 5, size: 4 })
  // A knowledge room: no monsters, one 100 gp item, a 40 XP award.
  const r = rollupEncounters(
    [
      {
        id: 'k1',
        name: 'Secure Collection',
        room_type: 'knowledge',
        monsters: [],
        treasure: [{ ref: { game_id: 'W:1' }, qty: 1 }],
        currency: {},
        xp_awards: [{ amount: 40 }],
      },
    ],
    entryOf,
    partyFor,
  )
  assert.equal(r.rows[0].threat, null) // no combat band
  assert.equal(r.rows[0].roomType, 'knowledge')
  assert.equal(r.rows[0].targetCp, 0) // no treasure target from a (nonexistent) band
  assert.equal(r.rows[0].cp, 10000) // loot still counts as value
  assert.equal(r.rows[0].xp, 40) // advancement XP (award) still counts
  assert.equal(r.totalTargetCp, 0)
})

test('rollupEncounters flags incomplete rows (unpriced/unknown) and tolerates empty', () => {
  const entryOf = () => null // nothing loads
  const partyFor = () => ({ level: 3, size: 4 })
  const r = rollupEncounters(
    [{ id: 'e', name: 'X', monsters: [{ ref: { game_id: 'M:?' }, count: 1 }], treasure: [{ ref: { game_id: 'W:?' }, qty: 1 }], currency: {} }],
    entryOf,
    partyFor,
  )
  assert.equal(r.rows[0].incomplete, true)
  assert.equal(r.anyIncomplete, true)
  assert.deepEqual(rollupEncounters([], entryOf, partyFor), { totalCp: 0, totalTargetCp: 0, totalXp: 0, rows: [], anyIncomplete: false })
})

test('rollupByChapter: one row per chapter with XP/treasure summed, + a trailing Unsorted row', () => {
  const creatures = { 'M:5': { stat_block: { creature_type: { level: 5 } } } } // PL at party 5
  const entryOf = (id) => creatures[id] || null
  const partyFor = () => ({ level: 5, size: 4 })
  const chapters = [{ id: 'c1', name: 'One' }, { id: 'c2', name: 'Two' }]
  const encs = [
    { id: 'e1', name: 'A', chapter_id: 'c1', monsters: [{ ref: { game_id: 'M:5' }, count: 3 }], treasure: [], currency: { gp: 10 } }, // 120 XP, 10gp
    { id: 'e2', name: 'B', chapter_id: 'c1', monsters: [], treasure: [], currency: { gp: 5 } }, // 0 XP, 5gp
    { id: 'e3', name: 'C', chapter_id: 'c2', monsters: [{ ref: { game_id: 'M:5' }, count: 1 }], treasure: [], currency: {} }, // 40 XP
    { id: 'e4', name: 'D', chapter_id: 'ghost', monsters: [], treasure: [], currency: { gp: 7 } }, // dangling → Unsorted
  ]
  const s = rollupByChapter(chapters, encs, entryOf, partyFor)
  assert.deepEqual(s.rows.map((r) => r.name), ['One', 'Two', 'Unsorted'])
  assert.equal(s.rows[0].xp, 120) // c1: 3 PL creatures
  assert.equal(s.rows[0].cp, 1500) // c1: 10 + 5 gp
  assert.equal(s.rows[0].targetCp, 200 * 100) // c1's Severe encounter → L5 severe = 200 gp
  assert.equal(s.rows[1].xp, 40) // c2: 1 PL creature
  assert.equal(s.rows[1].targetCp, 0) // c2 is Trivial (no target)
  assert.equal(s.rows[2].name, 'Unsorted')
  assert.equal(s.rows[2].cp, 700) // the dangling-chapter encounter's 7 gp
  assert.equal(s.totalXp, 160) // 120 + 40
  assert.equal(s.totalCp, 2200) // 1500 + 0 + 700
  assert.equal(s.totalTargetCp, 200 * 100) // summed across chapters
})

test('rollupByChapter propagates the incomplete/floor flag per chapter', () => {
  const creatures = { 'M:5': { stat_block: { creature_type: { level: 5 } } } }
  const entryOf = (id) => creatures[id] || null // an unknown ref never resolves
  const partyFor = () => ({ level: 5, size: 4 })
  const chapters = [{ id: 'c1', name: 'Broken' }, { id: 'c2', name: 'Clean' }]
  const encs = [
    { id: 'e1', name: 'A', chapter_id: 'c1', monsters: [{ ref: { game_id: 'M:?' }, count: 1 }], treasure: [], currency: {} }, // unresolved monster
    { id: 'e2', name: 'B', chapter_id: 'c2', monsters: [{ ref: { game_id: 'M:5' }, count: 1 }], treasure: [], currency: { gp: 5 } }, // resolves
  ]
  const s = rollupByChapter(chapters, encs, entryOf, partyFor)
  assert.equal(s.rows[0].incomplete, true) // Broken chapter has an unresolved ref → floor
  assert.equal(s.rows[1].incomplete, false) // Clean chapter fully resolves
  assert.equal(s.anyIncomplete, true)
})

test('rollupByChapter: no Unsorted row when every encounter is in a chapter; empty is tolerated', () => {
  const entryOf = () => null
  const partyFor = () => ({ level: 3, size: 4 })
  const chapters = [{ id: 'c1', name: 'One' }]
  const s = rollupByChapter(chapters, [{ id: 'e', name: 'A', chapter_id: 'c1', monsters: [], treasure: [], currency: {} }], entryOf, partyFor)
  assert.deepEqual(s.rows.map((r) => r.name), ['One']) // no Unsorted row
  assert.deepEqual(rollupByChapter([], [], entryOf, partyFor), { totalCp: 0, totalTargetCp: 0, totalXp: 0, rows: [], anyIncomplete: false })
})

test('rollupEncounters resolves party per-encounter, not once for all rows', () => {
  const creatures = {
    'M:5': { stat_block: { creature_type: { level: 5 } } },
    'M:8': { stat_block: { creature_type: { level: 8 } } },
  }
  const entryOf = (id) => creatures[id] || null
  const seen = []
  // Two Severe encounters (3 party-level creatures each) but at different party
  // levels — so the Table 5-3 budget target differs. This is the whole point of
  // the slice (inheritance-driven budgeting): a regression that resolved party
  // once for all rows would fail both the per-encounter call log and the target.
  const partyFor = (enc) => {
    seen.push(enc.id)
    return enc.id === 'e1' ? { level: 5, size: 4 } : { level: 8, size: 4 }
  }
  const mk = (id, mon) => ({ id, name: id, monsters: [{ ref: { game_id: mon }, count: 3 }], treasure: [], currency: {} })
  const { rows } = rollupEncounters([mk('e1', 'M:5'), mk('e2', 'M:8')], entryOf, partyFor)
  assert.deepEqual(seen, ['e1', 'e2']) // called once per encounter, in order
  assert.equal(rows[0].threat, 'severe') // 3×PL at L5 = 120 XP
  assert.equal(rows[1].threat, 'severe') // 3×PL at L8 = 120 XP
  assert.notEqual(rows[0].targetCp, rows[1].targetCp) // same band, different level ⇒ different budget
  assert.ok(rows[0].targetCp > 0 && rows[1].targetCp > 0)
})

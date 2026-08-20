import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { render, screen, cleanup } from '@testing-library/react'
import EncounterPrintSheet from './EncounterPrintSheet.jsx'

afterEach(() => cleanup())

// A budget stub with the fields both the sheet header and the reused TreasureBudget
// panel read. No monsters/hazards/afflictions in these fixtures, so the lazy *View
// components (which fetch on mount) never render — the sheet's own read-only
// metadata is what's under test. entryOf resolves treasure catalog item names.
const entries = { 'Items:1': { name: 'Healing Potion' } }
const budget = {
  cp: 6000,
  xp: 80,
  awardXp: 0,
  totalXp: 80,
  roomType: 'combat',
  threat: 'moderate',
  canonicalThreat: 'moderate',
  xpPer4: 80,
  loading: false,
  unpricedCount: 0,
  unknownCount: 0,
  failedCount: 0,
  onRetry: () => {},
  entryOf: (id) => entries[id] || null,
}
const effectiveParty = { level: 1, size: 4 }
const noop = () => {}

const baseEnc = {
  name: 'The Flooded Wing',
  room_type: 'combat',
  monsters: [],
  hazards: [],
  afflictions: [],
  treasure: [],
  xp_awards: [],
  rewards: [],
  skill_checks: [],
  exits: [],
}

test('EncounterPrintSheet renders the title, difficulty, and budget summary line', () => {
  render(
    <EncounterPrintSheet enc={baseEnc} budget={budget} effectiveParty={effectiveParty} onClose={noop} />,
  )
  assert.match(document.body.textContent, /The Flooded Wing/)
  assert.match(screen.getByTestId('print-difficulty').textContent, /Moderate · level 1/)
  assert.match(document.body.textContent, /Treasure 60 gp/) // formatGp(6000cp)
  assert.match(document.body.textContent, /80 XP/)
  assert.match(document.body.textContent, /4 PCs/)
})

test('EncounterPrintSheet has a screen-only toolbar with print + close', () => {
  render(<EncounterPrintSheet enc={baseEnc} budget={budget} effectiveParty={effectiveParty} onClose={noop} />)
  assert.ok(screen.getByRole('button', { name: /Save as PDF \/ Print/ }))
  assert.ok(screen.getByRole('button', { name: /Close/ }))
})

test('EncounterPrintSheet lists treasure by name+qty (catalog, custom, derived, masked)', () => {
  const enc = {
    ...baseEnc,
    treasure: [
      { ref: { game_id: 'Items:1' }, qty: 2, state: 'intact' },
      { ref: { json: { name: 'Peridot Bead', value_cp: 5000 } }, qty: 1, masked: true, mask_label: 'green stone' },
      // Derived (composed/runed): carries base + modifications; name lives on ref.json.
      { ref: { base: { game_id: 'Items:9' }, modifications: [{ effect_name: 'Striking' }], json: { name: '+1 Striking Dagger' }, price_cp: 3500 }, qty: 1 },
    ],
  }
  render(
    <EncounterPrintSheet enc={enc} budget={budget} effectiveParty={effectiveParty} onClose={noop} />,
  )
  const items = screen.getAllByTestId('print-treasure-item').map((li) => li.textContent)
  assert.ok(items.some((t) => /2 × Healing Potion/.test(t)))          // catalog name via entryOf, qty prefix
  assert.ok(items.some((t) => /Peridot Bead \(masked: green stone\)/.test(t))) // custom name + mask note
  assert.ok(items.some((t) => /\+1 Striking Dagger/.test(t)))         // derived name from ref.json, not base game_id
  assert.doesNotMatch(document.body.textContent, /Items:1|Items:9/)       // never a raw game_id
})

test('EncounterPrintSheet header shows the room type (not a difficulty band) for a non-combat room', () => {
  const nonCombat = { ...budget, roomType: 'social' }
  const enc = { ...baseEnc, room_type: 'social' }
  render(
    <EncounterPrintSheet enc={enc} budget={nonCombat} effectiveParty={effectiveParty} onClose={noop} />,
  )
  assert.match(screen.getByTestId('print-difficulty').textContent, /Social/) // roomTypeLabel branch
  assert.doesNotMatch(screen.getByTestId('print-difficulty').textContent, /level 1/)
})

test('EncounterPrintSheet renders XP awards, rewards, skill checks, and exits read-only', () => {
  const enc = {
    ...baseEnc,
    xp_awards: [{ amount: 30, reason: 'recruited Augrael' }],
    rewards: [{ kind: 'information', label: 'The Whispering Reeds' }],
    skill_checks: [{ skill: 'Perception', dc: 18 }],
    exits: [
      { to_encounter_id: 'e2', label: 'north door' },
      { to_encounter_id: '', label: 'Exterior' },
    ],
  }
  const siblings = [{ id: 'e2', name: 'The Sunken Vault' }]
  render(
    <EncounterPrintSheet enc={enc} budget={budget} effectiveParty={effectiveParty} siblings={siblings} onClose={noop} />,
  )
  assert.match(document.body.textContent, /30 XP — recruited Augrael/)
  assert.match(document.body.textContent, /Information: The Whispering Reeds/)
  assert.match(document.body.textContent, /Perception DC 18/)
  assert.match(document.body.textContent, /The Sunken Vault \(north door\)/) // resolved sibling name + passage
  assert.match(document.body.textContent, /Exterior/)                        // external exit by label
})

test('EncounterPrintSheet renders rich skill checks (successes, alternatives, per-degree outcomes)', () => {
  const enc = {
    ...baseEnc,
    skill_checks: [{
      skill: 'Thievery', dc: 25, successes: 4,
      alternatives: [{ skill: 'Religion', dc: 20 }],
      outcomes: { crit_success: 'opens silently', failure: 'the lock jams' },
    }],
  }
  render(<EncounterPrintSheet enc={enc} budget={budget} effectiveParty={effectiveParty} onClose={noop} />)
  assert.match(document.body.textContent, /Thievery DC 25 ×4 or Religion DC 20/) // label with successes + alt
  assert.match(document.body.textContent, /Critical Success\s*opens silently/)
  assert.match(document.body.textContent, /Failure\s*the lock jams/)
})

test('EncounterPrintSheet omits entity sections entirely when empty (no lazy stat-block fetch)', () => {
  render(<EncounterPrintSheet enc={baseEnc} budget={budget} effectiveParty={effectiveParty} onClose={noop} />)
  assert.equal(screen.queryByTestId('print-monster'), null)
  assert.equal(screen.queryByTestId('print-hazard'), null)
  assert.equal(screen.queryByTestId('print-affliction'), null)
})

test('EncounterPrintSheet prints content prose (markdown + box_text) in order; box_text is boxed (3zbl)', () => {
  const enc = {
    ...baseEnc,
    description: '', // migrated: legacy description cleared — must NOT be the source
    content: [
      { id: 'b1', type: 'box_text', markdown: { title: '', body: 'The reeds whisper as you enter.' } },
      { id: 'b2', type: 'markdown', markdown: { title: 'Tactics', body: 'The mitflits ambush from the water.' } },
    ],
  }
  render(<EncounterPrintSheet enc={enc} budget={budget} effectiveParty={effectiveParty} onClose={noop} />)
  const blocks = screen.getAllByTestId('print-block')
  assert.equal(blocks.length, 2)
  assert.match(blocks[0].textContent, /The reeds whisper/) // box_text first, in list order
  assert.ok(blocks[0].className.includes('print-boxtext')) // read-aloud is boxed
  assert.match(blocks[1].textContent, /Tactics/)
  assert.match(blocks[1].textContent, /mitflits ambush/)
  assert.ok(!blocks[1].className.includes('print-boxtext')) // plain markdown is not boxed
})

test('EncounterPrintSheet falls back to legacy description for an un-migrated encounter (3zbl)', () => {
  const enc = { ...baseEnc, description: 'An old single-body encounter.' } // no content array
  render(<EncounterPrintSheet enc={enc} budget={budget} effectiveParty={effectiveParty} onClose={noop} />)
  assert.match(document.body.textContent, /An old single-body encounter\./)
})

test('EncounterPrintSheet does NOT resurrect a stale description for a MIGRATED encounter with no prose (3zbl guard)', () => {
  // content present (even empty) means migrated — the cleared-but-lingering description
  // must never print. Weakening the guard to `content?.length` would break exactly this.
  const enc = { ...baseEnc, content: [], description: 'STALE migrated-away body — must not print' }
  render(<EncounterPrintSheet enc={enc} budget={budget} effectiveParty={effectiveParty} onClose={noop} />)
  assert.equal(screen.queryByTestId('print-block'), null)
  assert.doesNotMatch(document.body.textContent, /STALE/)
})

test('EncounterPrintSheet prints a treasure-pool header + its discovery gate, then the pool loot', () => {
  // The pool grouping + gate are the ugom structure the old category-grouped sheet
  // dropped entirely; the loot that follows the pool header is its find.
  const enc = {
    ...baseEnc,
    content: [
      { id: 'p1', type: 'pool', pool: { name: 'the altar', gate: { skill: 'Perception', dc: 18 } } },
      { id: 't1', type: 'treasure', treasure: { ref: { game_id: 'Items:1' }, qty: 1 } },
      { id: 'c1', type: 'coin', coin: { gp: 12 } },
    ],
  }
  render(<EncounterPrintSheet enc={enc} budget={budget} effectiveParty={effectiveParty} onClose={noop} />)
  const pool = screen.getByTestId('print-pool')
  assert.match(pool.textContent, /the altar/)
  assert.match(pool.textContent, /🔒 Perception DC 18/) // discovery gate
  assert.match(screen.getByTestId('print-treasure-item').textContent, /Healing Potion/)
  assert.match(screen.getByTestId('print-coin').textContent, /12 gp/)
})

test('EncounterPrintSheet renders content in the GM’s list order (not regrouped by category)', () => {
  const enc = {
    ...baseEnc,
    content: [
      { id: 'b1', type: 'box_text', markdown: { body: 'FIRST read-aloud' } },
      { id: 's1', type: 'skill_check', skill_check: { skill: 'Perception', dc: 15 } },
      { id: 'b2', type: 'markdown', markdown: { body: 'LAST note' } },
    ],
  }
  render(<EncounterPrintSheet enc={enc} budget={budget} effectiveParty={effectiveParty} onClose={noop} />)
  const text = document.body.textContent
  assert.ok(text.indexOf('FIRST read-aloud') < text.indexOf('Perception DC 15'), 'prose before check')
  assert.ok(text.indexOf('Perception DC 15') < text.indexOf('LAST note'), 'check before later prose')
})

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
  const { container } = render(
    <EncounterPrintSheet enc={baseEnc} budget={budget} effectiveParty={effectiveParty} onClose={noop} />,
  )
  assert.match(container.textContent, /The Flooded Wing/)
  assert.match(screen.getByTestId('print-difficulty').textContent, /Moderate · level 1/)
  assert.match(container.textContent, /Treasure 60 gp/) // formatGp(6000cp)
  assert.match(container.textContent, /80 XP/)
  assert.match(container.textContent, /4 PCs/)
})

test('EncounterPrintSheet has a screen-only toolbar with print + close', () => {
  render(<EncounterPrintSheet enc={baseEnc} budget={budget} effectiveParty={effectiveParty} onClose={noop} />)
  assert.ok(screen.getByRole('button', { name: /Save as PDF \/ Print/ }))
  assert.ok(screen.getByRole('button', { name: /Close/ }))
})

test('EncounterPrintSheet lists treasure by name+qty (catalog, custom, masked)', () => {
  const enc = {
    ...baseEnc,
    treasure: [
      { ref: { game_id: 'Items:1' }, qty: 2, state: 'intact' },
      { ref: { json: { name: 'Peridot Bead', value_cp: 5000 } }, qty: 1, masked: true, mask_label: 'green stone' },
    ],
  }
  const { container } = render(
    <EncounterPrintSheet enc={enc} budget={budget} effectiveParty={effectiveParty} onClose={noop} />,
  )
  const items = screen.getAllByTestId('print-treasure-item').map((li) => li.textContent)
  assert.ok(items.some((t) => /2 × Healing Potion/.test(t)))          // catalog name via entryOf, qty prefix
  assert.ok(items.some((t) => /Peridot Bead \(masked: green stone\)/.test(t))) // custom name + mask note
  assert.doesNotMatch(container.textContent, /Items:1/)               // never the raw game_id
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
  const { container } = render(
    <EncounterPrintSheet enc={enc} budget={budget} effectiveParty={effectiveParty} siblings={siblings} onClose={noop} />,
  )
  assert.match(container.textContent, /30 XP — recruited Augrael/)
  assert.match(container.textContent, /Information: The Whispering Reeds/)
  assert.match(container.textContent, /Perception DC 18/)
  assert.match(container.textContent, /The Sunken Vault \(north door\)/) // resolved sibling name + passage
  assert.match(container.textContent, /Exterior/)                        // external exit by label
})

test('EncounterPrintSheet omits entity sections entirely when empty (no lazy stat-block fetch)', () => {
  render(<EncounterPrintSheet enc={baseEnc} budget={budget} effectiveParty={effectiveParty} onClose={noop} />)
  assert.equal(screen.queryByTestId('print-monster'), null)
  assert.equal(screen.queryByTestId('print-hazard'), null)
  assert.equal(screen.queryByTestId('print-affliction'), null)
})

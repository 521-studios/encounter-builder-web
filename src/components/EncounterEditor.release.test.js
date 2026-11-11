import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import EncounterEditor from './EncounterEditor.jsx'
import { resetStore } from '../store/store.js'
import { setAnon } from '../api/anon.js'
import { resetPartyTreasure } from '../partyTreasure.js'

// 6m14: Release and its receipt show only when the API reports party-treasure, and a
// failed push offers Retry, which hits /release/retry and shows the new receipt.
const realFetch = globalThis.fetch
afterEach(() => {
  cleanup()
  resetStore()
  resetPartyTreasure()
  setAnon(false)
  globalThis.fetch = realFetch
})

const res = (obj, status = 200) => ({ ok: status < 400, status, text: async () => (obj == null ? '' : JSON.stringify(obj)) })
const base = { id: 'e1', name: 'A1', status: 'draft', room_type: 'combat', content: [], exits: [] }

function stub(enc, partyTreasure, calls = [], retryFails = false) {
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url)
    calls.push(`${init.method || 'GET'} ${u}`)
    if (u.endsWith('/api/app/me')) return res({ sub: 'gm', party_treasure: partyTreasure })
    if (u.endsWith('/release/retry')) {
      if (retryFails) return res({ error: 'party-treasure is not configured' }, 503)
      return res({ ...enc, release_push: { at: 'x', ledger_id: 'e1', item_count: 2 } })
    }
    if (u.endsWith('/encounters/e1')) return res(enc)
    if (u.endsWith('/encounters')) return res([enc])
    if (u.endsWith('/chapters')) return res([])
    if (u.endsWith('/settings')) return res({ party_level: 1, party_size: 4 })
    return res({})
  }
}

test('EncounterEditor: Release is hidden when party-treasure is not configured', async () => {
  const calls = []
  stub(base, false, calls)
  render(<EncounterEditor campaignId="c1" encounterId="e1" onClose={() => {}} />)
  await screen.findByLabelText('encounter name')
  await waitFor(() => assert.ok(calls.some((c) => c.endsWith('/api/app/me'))))
  assert.equal(screen.queryByRole('button', { name: 'Release to party' }), null)
})

test('EncounterEditor: Release shows when party-treasure is configured', async () => {
  stub(base, true)
  render(<EncounterEditor campaignId="c1" encounterId="e1" onClose={() => {}} />)
  await screen.findByRole('button', { name: 'Release to party' })
})

test('EncounterEditor: a failed push shows the error and Retry replaces it with the receipt', async () => {
  const calls = []
  const enc = { ...base, status: 'released', release_push: { at: 'x', item_count: 0, error: 'release returned 503' } }
  stub(enc, true, calls)
  render(<EncounterEditor campaignId="c1" encounterId="e1" onClose={() => {}} />)
  const receipt = await screen.findByTestId('release-receipt')
  assert.match(receipt.textContent, /Not sent to the party pool: release returned 503/)
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  await waitFor(() => assert.match(screen.getByTestId('release-receipt').textContent, /Sent to the party pool: 2 items \(ledger e1\)/))
  assert.ok(calls.includes('POST /api/app/campaigns/c1/encounters/e1/release/retry'))
  assert.equal(screen.queryByRole('button', { name: 'Retry' }), null)
})

test('EncounterEditor: a failed Retry shows the error and keeps Retry available', async () => {
  const enc = { ...base, status: 'released', release_push: { at: 'x', item_count: 0, error: 'boom' } }
  stub(enc, true, [], true)
  render(<EncounterEditor campaignId="c1" encounterId="e1" onClose={() => {}} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Retry' }))
  assert.match((await screen.findByRole('alert')).textContent, /not configured/)
  assert.equal(screen.getByRole('button', { name: 'Retry' }).disabled, false)
  assert.match(screen.getByTestId('release-receipt').textContent, /Not sent to the party pool: boom/)
})

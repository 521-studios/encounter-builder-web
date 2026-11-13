import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import EncounterEditor from './EncounterEditor.jsx'
import { resetStore } from '../store/store.js'
import { setAnon } from '../api/anon.js'

// we5k.2.4: the killed toggle flips at once, keeps the server's answer, and
// reverts when the post fails.
const realFetch = globalThis.fetch
afterEach(() => {
  cleanup()
  resetStore()
  setAnon(false)
  globalThis.fetch = realFetch
})

const res = (obj, status = 200) => ({ ok: status < 400, status, text: async () => (obj == null ? '' : JSON.stringify(obj)) })
const enc = {
  id: 'e1', name: 'A1', status: 'executing', room_type: 'combat', exits: [],
  content: [{ id: 'm1', type: 'monster', monster: { ref: { game_id: 'gob' }, count: 1, adjustment: 'none' } }],
}

function stub(killStatus, gate) {
  const posts = []
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url)
    if (u.endsWith('/kills')) {
      posts.push(JSON.parse(init.body))
      await gate
      if (killStatus !== 200) return res({ error: 'boom' }, killStatus)
      return res({ ...enc, kills: { 'm1:1': { killed: true, at: 't', source: 'eb' } } })
    }
    if (u.endsWith('/encounters/e1')) return res(enc)
    if (u.endsWith('/encounters')) return res([enc])
    if (u.endsWith('/chapters')) return res([])
    if (u.endsWith('/settings')) return res({ party_level: 1, party_size: 4 })
    return res({})
  }
  return posts
}

test('EncounterEditor: killed toggles optimistically and keeps the saved kill', async () => {
  let open
  const posts = stub(200, new Promise((r) => (open = r)))
  render(<EncounterEditor campaignId="c1" encounterId="e1" onClose={() => {}} />)
  fireEvent.click(await screen.findByRole('tab', { name: 'Encounter' }))
  const box = await screen.findByLabelText('gob killed')
  fireEvent.click(box)
  assert.equal(box.checked, true) // before the post answers
  open()
  await waitFor(() => assert.deepEqual(posts, [{ eb_monster_key: 'm1:1', killed: true }]))
  await waitFor(() => assert.equal(screen.getByLabelText('gob killed').checked, true))
})

test('EncounterEditor: a failed kill post reverts the toggle and shows the error', async () => {
  stub(500, Promise.resolve())
  render(<EncounterEditor campaignId="c1" encounterId="e1" onClose={() => {}} />)
  fireEvent.click(await screen.findByRole('tab', { name: 'Encounter' }))
  const box = await screen.findByLabelText('gob killed')
  fireEvent.click(box)
  await waitFor(() => assert.equal(screen.getByLabelText('gob killed').checked, false))
  await screen.findByRole('alert')
})

import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import EncounterEditor from './EncounterEditor.jsx'
import { resetStore } from '../store/store.js'
import { setAnon } from '../api/anon.js'

// The Room tab wiring (muz0.7): the editor hands RoomView the encounter and ITS
// chapter (by chapter_id). Real render, with fetch stubbed like ChapterDetail.test.
const realFetch = globalThis.fetch
afterEach(() => {
  cleanup()
  resetStore()
  setAnon(false)
  globalThis.fetch = realFetch
})

const res = (obj, status = 200) => ({ ok: status < 400, status, text: async () => (obj == null ? '' : JSON.stringify(obj)) })
const enc = { id: 'e1', name: 'A1', status: 'draft', chapter_id: 'ch2', room_type: 'combat', content: [], exits: [], map_region: { x: 100, y: 100, w: 400, h: 200 } }
const chapters = [
  { id: 'ch1', name: 'Other', order: 0 },
  { id: 'ch2', name: 'Mine', order: 1, map_image: { key: 'maps/c1/ch2/a.png', url: '/maps/c1/ch2/a.png', width: 1000, height: 800, rotation: 0, scale: 1 } },
]

test("EncounterEditor: the Room tab shows this encounter's crop of its own chapter's map", async () => {
  setAnon(false)
  globalThis.fetch = async (url) => {
    const u = String(url)
    if (u.endsWith('/encounters/e1')) return res(enc)
    if (u.endsWith('/encounters')) return res([enc])
    if (u.endsWith('/chapters')) return res(chapters)
    if (u.endsWith('/settings')) return res({ party_level: 1, party_size: 4 })
    return res({})
  }
  render(<EncounterEditor campaignId="c1" encounterId="e1" onClose={() => {}} />)
  fireEvent.click(await screen.findByRole('tab', { name: 'Room' }))
  const svg = await screen.findByRole('img', { name: 'Room on the chapter map' })
  assert.equal(svg.querySelector('image').getAttribute('href'), '/maps/c1/ch2/a.png')
  assert.equal(svg.getAttribute('viewBox'), '0 0 600 400')
})

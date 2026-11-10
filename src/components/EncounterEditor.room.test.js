import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
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

// fe8ed7a regression: patch merges into the LATEST record. A room image upload
// resolves seconds after it starts; an edit made meanwhile must survive it.
test('EncounterEditor: a room image upload that lands after an edit keeps the edit', async () => {
  setAnon(false)
  const realBitmap = globalThis.createImageBitmap
  globalThis.createImageBitmap = async () => ({ width: 640, height: 480, close() {} })
  let release
  const s3 = new Promise((r) => (release = r))
  const presigned = []
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url)
    if (u === 'https://s3.test') {
      await s3
      return { ok: true, status: 204, text: async () => '' }
    }
    if (u.endsWith('/map-image/upload-url')) {
      presigned.push(u)
      return res({ key: 'maps/c1/encounters/e1/r.png', url: 'https://s3.test', fields: { key: 'maps/c1/encounters/e1/r.png' } })
    }
    if (init.method === 'PUT') return res({ ...JSON.parse(init.body), id: 'e1', status: 'draft' })
    if (u.endsWith('/encounters/e1')) return res(enc)
    if (u.endsWith('/encounters')) return res([enc])
    if (u.endsWith('/chapters')) return res(chapters)
    if (u.endsWith('/settings')) return res({ party_level: 1, party_size: 4 })
    return res({})
  }
  try {
    render(<EncounterEditor campaignId="c1" encounterId="e1" onClose={() => {}} />)
    fireEvent.click(await screen.findByRole('tab', { name: 'Room' }))
    const file = new File([new Uint8Array(4)], 'r.png', { type: 'image/png' })
    fireEvent.change(screen.getByLabelText(/Upload room image/), { target: { files: [file] } })
    await waitFor(() => assert.equal(presigned.length, 1))
    assert.match(presigned[0], /\/campaigns\/c1\/encounters\/e1\/map-image\/upload-url$/)
    // While the file is still going up, the GM renames the encounter.
    fireEvent.change(screen.getByLabelText('encounter name'), { target: { value: 'Renamed' } })
    release()
    assert.equal((await screen.findByRole('img', { name: 'Room map' })).getAttribute('src'), '/maps/c1/encounters/e1/r.png')
    assert.equal(screen.getByLabelText('encounter name').value, 'Renamed')
  } finally {
    globalThis.createImageBitmap = realBitmap
  }
})

test('EncounterEditor: the Room tab links to connected rooms and out to its chapter (muz0.8)', async () => {
  setAnon(false)
  const me = { ...enc, exits: [{ to_encounter_id: 'e2', label: 'door' }] }
  const siblings = [me, { id: 'e2', name: 'A2', exits: [] }, { id: 'e3', name: 'A3', exits: [{ to_encounter_id: 'e1', label: 'stairs' }] }]
  globalThis.fetch = async (url) => {
    const u = String(url)
    if (u.endsWith('/encounters/e1')) return res(me)
    if (u.endsWith('/encounters')) return res(siblings)
    if (u.endsWith('/chapters')) return res(chapters)
    if (u.endsWith('/settings')) return res({ party_level: 1, party_size: 4 })
    return res({})
  }
  const opened = []
  const openedChapters = []
  render(<EncounterEditor campaignId="c1" encounterId="e1" onClose={() => {}} onOpenEncounter={(id) => opened.push(id)} onOpenChapter={(ch) => openedChapters.push(ch.id)} />)
  fireEvent.click(await screen.findByRole('tab', { name: 'Room' }))
  fireEvent.click(await screen.findByRole('button', { name: 'A2 (door)' }))
  fireEvent.click(screen.getByRole('button', { name: 'A3 (stairs)' }))
  fireEvent.click(screen.getByRole('button', { name: 'Open chapter map' }))
  assert.deepEqual(opened, ['e2', 'e3'])
  assert.deepEqual(openedChapters, ['ch2'])
})

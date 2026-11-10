import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import ChapterDetail, { mapSaveFields, mergeMapPatch } from './ChapterDetail.jsx'
import { resetStore, store } from '../store/store.js'
import { setAnon } from '../api/anon.js'

// ChapterDetail routes settings/encounters through the store's api backend → client.js
// request() → global fetch. Stub fetch (the seam store.test.js uses) instead of a
// per-component DI bag; render for real via @testing-library/react (like ChapterMap.test).
const realFetch = globalThis.fetch
afterEach(() => {
  cleanup()
  resetStore()
  setAnon(false)
  globalThis.fetch = realFetch
})

const res = (obj, status = 200) => ({ ok: status < 400, status, text: async () => (obj == null ? '' : JSON.stringify(obj)) })
const chapter = { id: 'ch1', name: 'Chapter One', order: 0, party_level: 5, party_size: 4 }

// Mount with settings + an empty encounters list stubbed; the tab structure doesn't
// need populated encounters (empty renders each panel's empty state).
function mountChapterDetail(extra = {}) {
  setAnon(false)
  globalThis.fetch = async (url) => {
    const u = String(url)
    if (u.endsWith('/settings')) return res({ party_level: 3, party_size: 4 })
    if (u.endsWith('/encounters')) return res([])
    return res({})
  }
  render(<ChapterDetail campaignId="c1" chapter={chapter} onClose={() => {}} onOpenEncounter={() => {}} {...extra} />)
}

test('ChapterDetail: initialTab="map" opens on the Map tab (muz0.8 room view -> chapter map)', async () => {
  mountChapterDetail({ initialTab: 'map' })
  assert.equal((await screen.findByRole('tab', { name: 'Map' })).getAttribute('aria-selected'), 'true')
  assert.equal(screen.queryByLabelText('party level'), null)
})

test('ChapterDetail: Config is the default tab and shows the party fields (Summary/Map not mounted)', async () => {
  mountChapterDetail()
  await screen.findByRole('tablist') // past the Loading… gate (settings resolved)
  assert.ok(screen.getByLabelText('party level'))
  assert.ok(screen.getByLabelText('party size'))
  assert.equal(screen.queryByTestId('treasure-rollup'), null) // other panels are conditional
  assert.equal(screen.queryByTestId('chapter-map'), null)
})

test('ChapterDetail: switching tabs swaps the panel — Summary→rollup, Map→map, Config hides', async () => {
  mountChapterDetail()
  await screen.findByRole('tablist')

  fireEvent.click(screen.getByRole('tab', { name: 'Summary' }))
  assert.ok(screen.getByTestId('treasure-rollup'))
  assert.equal(screen.queryByLabelText('party level'), null) // Config panel unmounted

  fireEvent.click(screen.getByRole('tab', { name: 'Map' }))
  assert.ok(screen.getByTestId('chapter-map'))
  assert.equal(screen.queryByTestId('treasure-rollup'), null) // Summary panel unmounted
})

// muz0.2: the chapter's map_image reaches the Map tab.
test('ChapterDetail: the Map tab renders the chapter map_image', async () => {
  setAnon(false)
  globalThis.fetch = async (url) => (String(url).endsWith('/settings') ? res({ party_level: 3, party_size: 4 }) : res([]))
  const withImage = { ...chapter, map_image: { key: 'maps/c1/ch1/x.png', url: 'https://e.test/x.png', width: 800, height: 600 } }
  render(<ChapterDetail campaignId="c1" chapter={withImage} onClose={() => {}} onOpenEncounter={() => {}} />)
  await screen.findByRole('tablist')
  fireEvent.click(screen.getByRole('tab', { name: 'Map' }))
  assert.equal(screen.getByAltText('Chapter map').getAttribute('src'), 'https://e.test/x.png')
})

// muz0.3: rotating the map image saves map_image (with the transform) AND the current
// map_positions in one PUT, so a later positions save can't drop a pending image edit.
test('ChapterDetail: rotating the map image PUTs map_image + current map_positions', async () => {
  setAnon(false)
  const puts = []
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url)
    if (init.method === 'PUT') { puts.push(JSON.parse(init.body)); return res({ ...chapter, ...JSON.parse(init.body) }) }
    if (u.endsWith('/settings')) return res({ party_level: 3, party_size: 4 })
    if (u.endsWith('/encounters')) return res([])
    return res({})
  }
  const withImage = { ...chapter, map_positions: { a: { x: 1, y: 2 } }, map_image: { key: 'maps/c1/ch1/x.png', url: 'https://e.test/x.png', width: 800, height: 600 } }
  render(<ChapterDetail campaignId="c1" chapter={withImage} onClose={() => {}} onOpenEncounter={() => {}} />)
  await screen.findByRole('tablist')
  fireEvent.click(screen.getByRole('tab', { name: 'Map' }))
  fireEvent.click(screen.getByRole('button', { name: /Rotate 90°/ }))
  await store.chapters.flush('c1', 'ch1')
  assert.equal(puts.length, 1)
  assert.deepEqual(puts[0].map_positions, { a: { x: 1, y: 2 } })
  assert.equal(puts[0].map_image.rotation, 90)
  assert.equal(puts[0].map_image.scale, 1)
  assert.equal(puts[0].map_image.key, 'maps/c1/ch1/x.png')
  assert.equal('url' in puts[0].map_image, false) // GET-only field never goes back
})

// A second rotate must build on the first (setMapImage reflects the saved transform).
test('ChapterDetail: rotating twice saves 180, not 90 again', async () => {
  setAnon(false)
  const puts = []
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url)
    if (init.method === 'PUT') { puts.push(JSON.parse(init.body)); return res({ ...chapter, ...JSON.parse(init.body) }) }
    if (u.endsWith('/settings')) return res({ party_level: 3, party_size: 4 })
    if (u.endsWith('/encounters')) return res([])
    return res({})
  }
  const withImage = { ...chapter, map_image: { key: 'maps/c1/ch1/x.png', url: 'https://e.test/x.png', width: 800, height: 600 } }
  render(<ChapterDetail campaignId="c1" chapter={withImage} onClose={() => {}} onOpenEncounter={() => {}} />)
  await screen.findByRole('tablist')
  fireEvent.click(screen.getByRole('tab', { name: 'Map' }))
  fireEvent.click(screen.getByRole('button', { name: /Rotate 90°/ }))
  fireEvent.click(screen.getByRole('button', { name: /Rotate 90°/ }))
  await store.chapters.flush('c1', 'ch1')
  assert.equal(puts.at(-1).map_image.rotation, 180)
})

// A positions-only save (the drag flush) keeps the pending image edit, and vice versa.
test('mergeMapPatch: the unpatched field keeps its current value', () => {
  const img = { key: 'k', rotation: 90 }
  assert.deepEqual(mergeMapPatch({ map_positions: { a: 1 } }, { a: 0 }, img), { map_positions: { a: 1 }, map_image: img })
  assert.deepEqual(mergeMapPatch({ map_image: { key: 'k2' } }, { a: 0 }, img), { map_positions: { a: 0 }, map_image: { key: 'k2' } })
  // An explicit null is a removal, not "unpatched".
  assert.deepEqual(mergeMapPatch({ map_image: null }, { a: 0 }, img), { map_positions: { a: 0 }, map_image: null })
})

test('ChapterDetail: a chapter without a map image never sends map_image', async () => {
  setAnon(false)
  const puts = []
  globalThis.fetch = async (url, init = {}) => {
    if (init.method === 'PUT') { puts.push(JSON.parse(init.body)); return res({}) }
    return String(url).endsWith('/settings') ? res({ party_level: 3, party_size: 4 }) : res([])
  }
  render(<ChapterDetail campaignId="c1" chapter={chapter} onClose={() => {}} onOpenEncounter={() => {}} />)
  await screen.findByRole('tablist')
  fireEvent.change(screen.getByLabelText('party level'), { target: { value: '6' } })
  await store.chapters.flush('c1', 'ch1')
  assert.ok(puts.length >= 1)
  assert.equal('map_image' in puts.at(-1), false)
})

test('mapSaveFields: a positions-only save still carries the current image, in its write shape', () => {
  const img = { key: 'k', url: 'https://e.test/x.png', width: 800, height: 600, rotation: 90, scale: 0.5 }
  assert.deepEqual(mapSaveFields({ a: { x: 1, y: 2 } }, img), {
    map_positions: { a: { x: 1, y: 2 } },
    map_image: { key: 'k', width: 800, height: 600, rotation: 90, scale: 0.5 },
  })
  assert.deepEqual(mapSaveFields({ a: { x: 1, y: 2 } }, null), { map_positions: { a: { x: 1, y: 2 } }, map_image: null })
})

test('ChapterDetail: opening a different chapter re-seeds the map image', async () => {
  setAnon(false)
  globalThis.fetch = async (url) => (String(url).endsWith('/settings') ? res({ party_level: 3, party_size: 4 }) : res([]))
  const img = (u) => ({ key: u, url: `https://e.test/${u}`, width: 10, height: 10 })
  const props = { campaignId: 'c1', onClose: () => {}, onOpenEncounter: () => {} }
  const { rerender } = render(<ChapterDetail {...props} chapter={{ ...chapter, map_image: img('a.png') }} />)
  await screen.findByRole('tablist')
  fireEvent.click(screen.getByRole('tab', { name: 'Map' }))
  assert.equal(screen.getByAltText('Chapter map').getAttribute('src'), 'https://e.test/a.png')
  rerender(<ChapterDetail {...props} chapter={{ ...chapter, id: 'ch2', map_image: img('b.png') }} />)
  assert.equal((await screen.findByAltText('Chapter map')).getAttribute('src'), 'https://e.test/b.png')
})

// muz0.5: upload / replace / remove the map image from the Map tab.
function mapTabFetch(puts) {
  return async (url, init = {}) => {
    const u = String(url)
    if (u.endsWith('/map-image/upload-url')) return res({ key: 'maps/c1/ch1/new.png', url: 'https://bucket.test', fields: { key: 'maps/c1/ch1/new.png' } })
    if (u === 'https://bucket.test') return { ok: true, status: 204, text: async () => '' }
    if (init.method === 'PUT') { puts.push(JSON.parse(init.body)); return res({ ...chapter, ...JSON.parse(init.body) }) }
    if (u.endsWith('/settings')) return res({ party_level: 3, party_size: 4 })
    if (u.endsWith('/encounters')) return res([])
    return res({})
  }
}

test('ChapterDetail: uploading a map image saves it (write shape) with the positions', async () => {
  setAnon(false)
  const puts = []
  globalThis.fetch = mapTabFetch(puts)
  globalThis.createImageBitmap = async () => ({ width: 1200, height: 900, close() {} })
  try {
    render(<ChapterDetail campaignId="c1" chapter={{ ...chapter, map_positions: { a: { x: 1, y: 2 } } }} onClose={() => {}} onOpenEncounter={() => {}} />)
    await screen.findByRole('tablist')
    fireEvent.click(screen.getByRole('tab', { name: 'Map' }))
    fireEvent.change(screen.getByLabelText(/Upload map image/), { target: { files: [new File(['x'], 'm.png', { type: 'image/png' })] } })
    await screen.findByLabelText(/Replace map image/) // the control flips once the image is set
    await store.chapters.flush('c1', 'ch1')
    assert.deepEqual(puts.at(-1).map_image, { key: 'maps/c1/ch1/new.png', width: 1200, height: 900, rotation: 0, scale: 1 })
    assert.deepEqual(puts.at(-1).map_positions, { a: { x: 1, y: 2 } })
  } finally {
    delete globalThis.createImageBitmap
  }
})

test('ChapterDetail: removing the map image PUTs map_image: null', async () => {
  setAnon(false)
  const puts = []
  globalThis.fetch = mapTabFetch(puts)
  const withImage = { ...chapter, map_image: { key: 'maps/c1/ch1/x.png', url: '/maps/c1/ch1/x.png', width: 800, height: 600 } }
  render(<ChapterDetail campaignId="c1" chapter={withImage} onClose={() => {}} onOpenEncounter={() => {}} />)
  await screen.findByRole('tablist')
  fireEvent.click(screen.getByRole('tab', { name: 'Map' }))
  fireEvent.click(screen.getByRole('button', { name: 'Remove map image' }))
  await store.chapters.flush('c1', 'ch1')
  assert.equal(puts.at(-1).map_image, null)
  assert.ok(screen.getByLabelText(/Upload map image/))
})

test('ChapterDetail: a failed upload shows the error and saves nothing', async () => {
  setAnon(false)
  const puts = []
  globalThis.fetch = mapTabFetch(puts)
  render(<ChapterDetail campaignId="c1" chapter={chapter} onClose={() => {}} onOpenEncounter={() => {}} />)
  await screen.findByRole('tablist')
  fireEvent.click(screen.getByRole('tab', { name: 'Map' }))
  fireEvent.change(screen.getByLabelText(/Upload map image/), { target: { files: [new File(['x'], 'm.gif', { type: 'image/gif' })] } })
  assert.match((await screen.findByRole('alert')).textContent, /PNG, JPEG or WebP/)
  assert.equal(puts.length, 0)
})

test('ChapterDetail: the no-account builder has no map upload', async () => {
  mountChapterDetail()
  setAnon(true)
  fireEvent.click(await screen.findByRole('tab', { name: 'Map' }))
  assert.equal(screen.queryByLabelText(/Upload map image/), null)
})

test('ChapterDetail: the upload control is disabled and announces progress while uploading', async () => {
  setAnon(false)
  const puts = []
  let release
  const gate = new Promise((r) => { release = r })
  const base = mapTabFetch(puts)
  globalThis.fetch = async (url, init) => (String(url).endsWith('/map-image/upload-url') ? (await gate, base(url, init)) : base(url, init))
  globalThis.createImageBitmap = async () => ({ width: 10, height: 10, close() {} })
  try {
    render(<ChapterDetail campaignId="c1" chapter={chapter} onClose={() => {}} onOpenEncounter={() => {}} />)
    await screen.findByRole('tablist')
    fireEvent.click(screen.getByRole('tab', { name: 'Map' }))
    const input = screen.getByLabelText(/Upload map image/)
    fireEvent.change(input, { target: { files: [new File(['x'], 'm.png', { type: 'image/png' })] } })
    assert.match((await screen.findByRole('status')).textContent, /Uploading/)
    assert.equal(input.disabled, true)
    release()
    const replace = await screen.findByLabelText(/Replace map image/)
    assert.equal(replace.disabled, false)
    assert.equal(screen.queryByRole('status'), null)
  } finally {
    delete globalThis.createImageBitmap
  }
})

// An edit made while the upload is in flight must survive the image save.
test('ChapterDetail: a party edit during an upload is not reverted by the image save', async () => {
  setAnon(false)
  const puts = []
  let release
  const gate = new Promise((r) => { release = r })
  const base = mapTabFetch(puts)
  globalThis.fetch = async (url, init) => (String(url).endsWith('/map-image/upload-url') ? (await gate, base(url, init)) : base(url, init))
  globalThis.createImageBitmap = async () => ({ width: 10, height: 10, close() {} })
  try {
    render(<ChapterDetail campaignId="c1" chapter={chapter} onClose={() => {}} onOpenEncounter={() => {}} />)
    await screen.findByRole('tablist')
    fireEvent.click(screen.getByRole('tab', { name: 'Map' }))
    fireEvent.change(screen.getByLabelText(/Upload map image/), { target: { files: [new File(['x'], 'm.png', { type: 'image/png' })] } })
    await screen.findByRole('status')
    fireEvent.click(screen.getByRole('tab', { name: 'Config' }))
    fireEvent.change(screen.getByLabelText('party level'), { target: { value: '7' } })
    release()
    await screen.findByRole('tab', { name: 'Map' })
    await new Promise((r) => setTimeout(r, 0))
    await store.chapters.flush('c1', 'ch1')
    const last = puts.at(-1)
    assert.equal(last.map_image?.key, 'maps/c1/ch1/new.png')
    assert.equal(last.party_level, 7)
  } finally {
    delete globalThis.createImageBitmap
  }
})

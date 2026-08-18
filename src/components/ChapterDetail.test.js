import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import ChapterDetail from './ChapterDetail.jsx'
import { resetStore } from '../store/store.js'
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
function mountChapterDetail() {
  setAnon(false)
  globalThis.fetch = async (url) => {
    const u = String(url)
    if (u.endsWith('/settings')) return res({ party_level: 3, party_size: 4 })
    if (u.endsWith('/encounters')) return res([])
    return res({})
  }
  render(<ChapterDetail campaignId="c1" chapter={chapter} onClose={() => {}} onOpenEncounter={() => {}} />)
}

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

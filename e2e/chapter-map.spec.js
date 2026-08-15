import { test, expect } from '@playwright/test'
import { login, trackApiErrors, openFirstCampaign, createChapter, createEncounter, deleteChapter } from './helpers/login.js'

// 8hda: the chapter connectivity map. Two rooms in a chapter linked by a 3qq7 exit
// render as a node-link graph; clicking a node opens that encounter.
test('chapter map: linked rooms render as a graph; clicking a node opens the encounter', async ({ page, baseURL }) => {
  const apiErrors = trackApiErrors(page)
  await login(page, baseURL)
  await openFirstCampaign(page)

  const ts = Date.now()
  const chName = `Map Ch ${ts}`
  const roomB = `Room B ${ts}`
  const roomA = `Room A ${ts}`

  await createChapter(page, chName)
  const group = page.locator('.chapter-group', { has: page.locator('.chapter-name', { hasText: chName }) })

  await createEncounter(page, roomB, group) // target first
  await createEncounter(page, roomA, group) // opens A's editor

  // Link A → B.
  await page.getByRole('button', { name: '+ exit' }).click()
  await page.getByTestId('exit').getByLabel('exit target').selectOption({ label: roomB })
  await expect(page.getByTestId('save-state')).toHaveText('Saved')

  // Open the chapter detail (the map lives there).
  await page.locator('.chapter-name', { hasText: chName }).click()
  const detail = page.getByTestId('chapter-detail')
  await expect(detail).toBeVisible()

  // The map: two nodes, at least one edge, and the title stats.
  await expect(detail.getByTestId('map-svg')).toBeVisible()
  await expect(detail.getByTestId('map-node')).toHaveCount(2)
  // The A→B edge renders as one <g> — assert by count (a horizontal edge has a
  // zero-height bbox, which Playwright's visibility heuristic reports as hidden).
  await expect(detail.getByTestId('map-edge')).toHaveCount(1)
  await expect(detail.getByText(/Map — 2 rooms/)).toBeVisible()

  // Clicking Room B's node opens Room B's editor.
  await detail.getByLabel(`Open ${roomB}`).click()
  await expect(page.locator('.editor')).toBeVisible()
  await expect(page.getByLabel('encounter name')).toHaveValue(roomB)

  await deleteChapter(page, chName)
  expect(apiErrors).toEqual([])
})

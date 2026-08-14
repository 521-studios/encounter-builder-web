import { test, expect } from '@playwright/test'
import { login, trackApiErrors, openFirstCampaign, createChapter, createEncounter, deleteEncounter, deleteChapter } from './helpers/login.js'

// HTML5 drag-and-drop: fire the drag events with a shared DataTransfer. (Playwright's
// mouse-based dragTo can't reliably re-initiate a second consecutive native drag;
// dispatching the events exercises the same React handlers a real drag triggers.)
async function dragEncounterTo(page, sourceRow, targetGroup) {
  const dt = await page.evaluateHandle(() => new DataTransfer())
  await sourceRow.dispatchEvent('dragstart', { dataTransfer: dt })
  await targetGroup.dispatchEvent('dragover', { dataTransfer: dt })
  await targetGroup.dispatchEvent('drop', { dataTransfer: dt })
  await sourceRow.dispatchEvent('dragend', { dataTransfer: dt })
}

test('drag an encounter between chapters and to Unsorted', async ({ page, baseURL }) => {
  const apiErrors = trackApiErrors(page)
  await login(page, baseURL)
  await openFirstCampaign(page)

  const stamp = Date.now()
  const chA = `Move A ${stamp}`
  const chB = `Move B ${stamp}`
  const enc = `Wanderer ${stamp}`
  const groupOf = (name) =>
    page.locator('.chapter-group', { has: page.locator('.chapter-name', { hasText: name }) })
  const encRow = (group) =>
    groupOf(group).locator('li.encounter-row', { has: page.locator('button.encounter', { hasText: enc }) })

  // Two chapters (wait for each to land before the next), encounter under A.
  for (const ch of [chA, chB]) {
    await createChapter(page, ch)
    await expect(groupOf(ch)).toBeVisible()
  }
  await createEncounter(page, enc, groupOf(chA))
  await expect(encRow(chA)).toBeVisible()

  // Drag A -> B.
  await dragEncounterTo(page, encRow(chA), groupOf(chB))
  await expect(groupOf(chB).locator('button.encounter', { hasText: enc })).toBeVisible()
  await expect(groupOf(chA).locator('button.encounter', { hasText: enc })).toHaveCount(0)

  // Drag B -> Unsorted (the always-present drop zone).
  await dragEncounterTo(page, encRow(chB), groupOf('Unsorted'))
  await expect(groupOf('Unsorted').locator('button.encounter', { hasText: enc })).toBeVisible()
  await expect(groupOf(chB).locator('button.encounter', { hasText: enc })).toHaveCount(0)

  // The move persisted: survives a reload.
  await page.reload()
  await expect(page.getByTestId('chapter-tree')).toBeVisible() // reload restores the two-pane directly (no campaign picker)
  await expect(groupOf('Unsorted').locator('button.encounter', { hasText: enc })).toBeVisible()

  // Cleanup.
  await deleteEncounter(page, enc)
  for (const ch of [chA, chB]) {
    await deleteChapter(page, ch)
    await expect(groupOf(ch)).toHaveCount(0)
  }

  expect(apiErrors, 'no API request should return 4xx/5xx').toEqual([])
})

// The keyboard-accessible move path: a Chapter <select> in the editor (details).
test('move an encounter via the editor Chapter select (no mouse needed)', async ({ page, baseURL }) => {
  const apiErrors = trackApiErrors(page)
  await login(page, baseURL)
  await openFirstCampaign(page)
  const stamp = Date.now()
  const ch = `Ed Ch ${stamp}`
  const enc = `Ed Enc ${stamp}`
  const groupOf = (name) =>
    page.locator('.chapter-group', { has: page.locator('.chapter-name', { hasText: name }) })

  await createChapter(page, ch)
  await expect(groupOf(ch)).toBeVisible()

  // Create an Unsorted encounter (opens the editor).
  await createEncounter(page, enc)

  // Change its Chapter in the editor; autosave persists it.
  await page.locator('select[aria-label="chapter"]').selectOption({ label: ch })
  await expect(page.getByTestId('save-state')).toHaveText('Saved')

  // The sidebar tree now shows it under the chosen chapter.
  await expect(groupOf(ch).locator('button.encounter', { hasText: enc })).toBeVisible()

  // Cleanup.
  await deleteEncounter(page, enc)
  await deleteChapter(page, ch)
  await expect(groupOf(ch)).toHaveCount(0)

  expect(apiErrors, 'no API request should return 4xx/5xx').toEqual([])
})

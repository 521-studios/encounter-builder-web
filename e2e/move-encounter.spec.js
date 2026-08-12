import { test, expect } from '@playwright/test'
import { login, trackApiErrors } from './helpers/login.js'

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
  await page.locator('button.campaign').first().click()
  await expect(page.getByTestId('chapter-tree')).toBeVisible()

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
    await page.getByTestId('add-chapter').locator('input').fill(ch)
    await page.getByTestId('add-chapter').locator('button').click()
    await expect(groupOf(ch)).toBeVisible()
  }
  await groupOf(chA).locator('.new-encounter input').fill(enc)
  await groupOf(chA).locator('.new-encounter button').click()
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
  await page.locator('button.campaign').first().click()
  await expect(groupOf('Unsorted').locator('button.encounter', { hasText: enc })).toBeVisible()

  // Cleanup.
  const row = page.locator('li', { has: page.locator('button.encounter', { hasText: enc }) })
  await row.getByRole('button', { name: `Delete ${enc}` }).click()
  await expect(row).toHaveCount(0)
  for (const ch of [chA, chB]) {
    page.once('dialog', (d) => d.accept())
    await groupOf(ch).getByRole('button', { name: `Delete chapter ${ch}` }).click()
    await expect(groupOf(ch)).toHaveCount(0)
  }

  expect(apiErrors, 'no API request should return 4xx/5xx').toEqual([])
})

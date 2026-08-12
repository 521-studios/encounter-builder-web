import { test, expect } from '@playwright/test'
import { login, trackApiErrors } from './helpers/login.js'

// Move an encounter between chapters (and to Unsorted) via the sidebar's per-row
// "move to chapter" select, without opening the editor.
test('move an encounter between chapters and to Unsorted from the sidebar', async ({ page, baseURL }) => {
  const apiErrors = trackApiErrors(page)
  await login(page, baseURL)
  await page.locator('button.campaign').first().click()
  await expect(page.getByTestId('chapter-tree')).toBeVisible()

  const stamp = Date.now()
  const chA = `Move A ${stamp}`
  const chB = `Move B ${stamp}`
  const enc = `Wanderer ${stamp}`

  // Two chapters, and an encounter created under A. Wait for each to land before
  // adding the next (the add-chapter button disables while a create is in flight).
  const groupOf = (ch) => page.locator('.chapter-group', { has: page.locator('.chapter-name', { hasText: ch }) })
  for (const ch of [chA, chB]) {
    await page.getByTestId('add-chapter').locator('input').fill(ch)
    await page.getByTestId('add-chapter').locator('button').click()
    await expect(groupOf(ch)).toBeVisible()
  }
  const groupA = groupOf(chA)
  const groupB = groupOf(chB)
  const unsorted = page.locator('.chapter-group', { has: page.locator('.chapter-name', { hasText: 'Unsorted' }) })

  await groupA.locator('.new-encounter input').fill(enc)
  await groupA.locator('.new-encounter button').click()
  const rowInA = groupA.locator('li', { has: page.locator('button.encounter', { hasText: enc }) })
  await expect(rowInA).toBeVisible()

  // Move A -> B via the select.
  await rowInA.locator('select.move-encounter').selectOption({ label: chB })
  await expect(groupB.locator('button.encounter', { hasText: enc })).toBeVisible()
  await expect(groupA.locator('button.encounter', { hasText: enc })).toHaveCount(0)

  // Move B -> Unsorted.
  const rowInB = groupB.locator('li', { has: page.locator('button.encounter', { hasText: enc }) })
  await rowInB.locator('select.move-encounter').selectOption({ label: 'Unsorted' })
  await expect(unsorted.locator('button.encounter', { hasText: enc })).toBeVisible()
  await expect(groupB.locator('button.encounter', { hasText: enc })).toHaveCount(0)

  // The move survives a reload (it was persisted, not just local).
  await page.reload()
  await page.locator('button.campaign').first().click()
  const unsorted2 = page.locator('.chapter-group', { has: page.locator('.chapter-name', { hasText: 'Unsorted' }) })
  await expect(unsorted2.locator('button.encounter', { hasText: enc })).toBeVisible()

  // Cleanup: delete the encounter, then both chapters.
  const row = page.locator('li', { has: page.locator('button.encounter', { hasText: enc }) })
  await row.getByRole('button', { name: `Delete ${enc}` }).click()
  await expect(row).toHaveCount(0)
  for (const ch of [chA, chB]) {
    const g = page.locator('.chapter-group', { has: page.locator('.chapter-name', { hasText: ch }) })
    page.once('dialog', (d) => d.accept())
    await g.getByRole('button', { name: `Delete chapter ${ch}` }).click()
    await expect(g).toHaveCount(0)
  }

  expect(apiErrors, 'no API request should return 4xx/5xx').toEqual([])
})

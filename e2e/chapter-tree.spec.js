import { test, expect } from '@playwright/test'
import { login, trackApiErrors } from './helpers/login.js'

// The sidebar chapter tree: add a chapter, add encounters under it (which sort
// naturally: B1, B2, B10 — not B1, B10, B2), collapse/expand, then clean up.
test('chapter tree: create a chapter, add naturally-sorted encounters, collapse', async ({ page, baseURL }) => {
  const apiErrors = trackApiErrors(page)
  await login(page, baseURL)

  await page.locator('button.campaign').first().click()
  await expect(page.getByTestId('chapter-tree')).toBeVisible()

  // Add a chapter.
  const chapterName = `E2E Ch ${Date.now()}`
  await page.getByTestId('add-chapter').locator('input').fill(chapterName)
  await page.getByTestId('add-chapter').locator('button').click()

  const group = page.locator('.chapter-group', {
    has: page.locator('.chapter-name', { hasText: chapterName }),
  })
  await expect(group).toBeVisible()

  // Add three encounters under it, out of natural order.
  const stamp = Date.now()
  for (const label of ['B10', 'B1', 'B2']) {
    const form = group.locator('.new-encounter')
    await form.locator('input').fill(`${label}-${stamp}`)
    await form.locator('button').click()
    // each add opens the editor in the main pane; wait for the row to appear
    await expect(group.locator('button.encounter', { hasText: `${label}-${stamp}` })).toBeVisible()
  }

  // They render in natural order within the chapter: B1, B2, B10.
  const names = await group.locator('button.encounter').allInnerTexts()
  const order = names.map((n) => n.trim().split(' ')[0]) // strip the trailing status
  expect(order).toEqual([`B1-${stamp}`, `B2-${stamp}`, `B10-${stamp}`])

  // Collapse hides the encounters; expand shows them again.
  await group.locator('.chapter-toggle').click()
  await expect(group.locator('button.encounter').first()).toBeHidden()
  await group.locator('.chapter-toggle').click()
  await expect(group.locator('button.encounter').first()).toBeVisible()

  // Clean up: delete the three encounters, then the chapter.
  for (const label of ['B1', 'B2', 'B10']) {
    const row = page.locator('li', {
      has: page.locator('button.encounter', { hasText: `${label}-${stamp}` }),
    })
    await row.getByRole('button', { name: 'Delete' }).click()
    await expect(row).toHaveCount(0)
  }
  page.once('dialog', (d) => d.accept())
  await group.locator('.chapter-actions').getByRole('button', { name: 'Delete' }).click()
  await expect(group).toHaveCount(0)

  expect(apiErrors, 'no API request should return 4xx/5xx').toEqual([])
})

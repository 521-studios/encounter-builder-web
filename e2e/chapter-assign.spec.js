import { test, expect } from '@playwright/test'
import { login, trackApiErrors } from './helpers/login.js'

// Regression guard for the buildInput chapter_id echo: a chapter-assigned
// encounter must NOT jump to Unsorted when saved. Without the echo, the PUT
// (which replaces the resource) would blank chapter_id and the encounter would
// re-group under Unsorted on reload.
test('a chapter-assigned encounter stays in its chapter after save+reload', async ({ page, baseURL }) => {
  const apiErrors = trackApiErrors(page)
  await login(page, baseURL)
  await page.locator('button.campaign').first().click()
  await expect(page.getByTestId('chapter-tree')).toBeVisible()

  const stamp = Date.now()
  const chapterName = `Assign Ch ${stamp}`
  const encName = `Assigned ${stamp}`

  // Chapter, then an encounter created UNDER it (per-chapter form sets chapter_id).
  await page.getByTestId('add-chapter').locator('input').fill(chapterName)
  await page.getByTestId('add-chapter').locator('button').click()
  const group = page.locator('.chapter-group', {
    has: page.locator('.chapter-name', { hasText: chapterName }),
  })
  await expect(group).toBeVisible()
  await group.locator('.new-encounter input').fill(encName)
  await group.locator('.new-encounter button').click()
  await expect(page.locator('.editor')).toBeVisible()

  // Trigger an autosave with a harmless edit (not the name — assertions match on
  // it). The autosave PUT echoes chapter_id via buildInput, which is the exact
  // regression under test. Wait for the indicator to settle before reload.
  await page.locator('.description-input').fill(`assigned ${stamp}`)
  await expect(page.getByTestId('save-state')).toHaveText('Saved')

  // Reload — the encounter must still be inside its chapter group, not Unsorted.
  await page.reload()
  await page.locator('button.campaign').first().click()
  const groupAfter = page.locator('.chapter-group', {
    has: page.locator('.chapter-name', { hasText: chapterName }),
  })
  await expect(groupAfter.locator('button.encounter', { hasText: encName })).toBeVisible()
  const unsorted = page.locator('.chapter-group', {
    has: page.locator('.chapter-name', { hasText: 'Unsorted' }),
  })
  await expect(unsorted.locator('button.encounter', { hasText: encName })).toHaveCount(0)

  // Cleanup.
  await groupAfter.getByRole('button', { name: `Delete ${encName}` }).click()
  page.once('dialog', (d) => d.accept())
  await groupAfter.getByRole('button', { name: `Delete chapter ${chapterName}` }).click()
  await expect(groupAfter).toHaveCount(0)

  expect(apiErrors, 'no API request should return 4xx/5xx').toEqual([])
})

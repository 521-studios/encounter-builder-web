import { test, expect } from '@playwright/test'
import { login, trackApiErrors, openFirstCampaign, createChapter, createEncounter, deleteEncounter, deleteChapter } from './helpers/login.js'

// Regression guard for the buildInput chapter_id echo: a chapter-assigned
// encounter must NOT jump to Unsorted when saved. Without the echo, the PUT
// (which replaces the resource) would blank chapter_id and the encounter would
// re-group under Unsorted on reload.
test('a chapter-assigned encounter stays in its chapter after save+reload', async ({ page, baseURL }) => {
  const apiErrors = trackApiErrors(page)
  await login(page, baseURL)
  await openFirstCampaign(page)

  const stamp = Date.now()
  const chapterName = `Assign Ch ${stamp}`
  const encName = `Assigned ${stamp}`

  // Chapter, then an encounter created UNDER it (per-chapter "+ encounter" sets chapter_id).
  await createChapter(page, chapterName)
  const group = page.locator('.chapter-group', {
    has: page.locator('.chapter-name', { hasText: chapterName }),
  })
  await expect(group).toBeVisible()
  await createEncounter(page, encName, group)

  // Trigger another autosave with a harmless edit. The autosave PUT echoes
  // chapter_id via buildInput, which is the exact regression under test. Wait for
  // the indicator to settle before reload.
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
  await deleteEncounter(page, encName)
  await deleteChapter(page, chapterName)
  await expect(groupAfter).toHaveCount(0)

  expect(apiErrors, 'no API request should return 4xx/5xx').toEqual([])
})

import { test, expect } from '@playwright/test'
import { login, trackApiErrors, openFirstCampaign, createChapter, createEncounter, deleteEncounter, deleteChapter } from './helpers/login.js'

// The sidebar chapter tree: add a chapter, add encounters under it (which sort
// naturally: B1, B2, B10 — not B1, B10, B2), collapse/expand via the caret, then
// clean up. Direct manipulation: name opens the chapter, caret toggles, "+ x"
// buttons create-and-open.
test('chapter tree: create a chapter, add naturally-sorted encounters, collapse', async ({ page, baseURL }) => {
  const apiErrors = trackApiErrors(page)
  await login(page, baseURL)
  await openFirstCampaign(page)

  const chapterName = `E2E Ch ${Date.now()}`
  await createChapter(page, chapterName)

  const group = page.locator('.chapter-group', {
    has: page.locator('.chapter-name', { hasText: chapterName }),
  })
  await expect(group).toBeVisible()

  // Add three encounters under it, out of natural order (each "+ encounter"
  // creates an untitled encounter and opens the editor to name it).
  const stamp = Date.now()
  for (const label of ['B10', 'B1', 'B2']) {
    await createEncounter(page, `${label}-${stamp}`, group)
    await expect(group.locator('button.encounter', { hasText: `${label}-${stamp}` })).toBeVisible()
  }

  // They render in natural order within the chapter: B1, B2, B10.
  const names = await group.locator('button.encounter').allInnerTexts()
  const order = names.map((n) => n.trim().split(' ')[0]) // strip the trailing status
  expect(order).toEqual([`B1-${stamp}`, `B2-${stamp}`, `B10-${stamp}`])

  // The caret (only) collapses/expands; the name button opens the detail, not toggles.
  await group.locator('.chapter-caret-btn').click()
  await expect(group.locator('button.encounter').first()).toBeHidden()
  await group.locator('.chapter-caret-btn').click()
  await expect(group.locator('button.encounter').first()).toBeVisible()

  // Clean up: delete the three encounters (from their editors), then the chapter.
  for (const label of ['B1', 'B2', 'B10']) {
    await deleteEncounter(page, `${label}-${stamp}`)
  }
  await deleteChapter(page, chapterName)
  await expect(group).toHaveCount(0)

  expect(apiErrors, 'no API request should return 4xx/5xx').toEqual([])
})

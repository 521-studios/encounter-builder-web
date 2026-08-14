import { test, expect } from '@playwright/test'
import { login, trackApiErrors, openFirstCampaign, createEncounter, deleteEncounter } from './helpers/login.js'

// Autosave must persist an edit even when the GM navigates away WITHOUT waiting
// for the "Saved" indicator: closing the editor unmounts it, and the flush-on-
// leave effect saves the still-pending (sub-debounce) edit. Guards the data-loss
// path the other specs don't exercise (they all wait for "Saved" before leaving).
test('autosave flushes a pending edit when the editor closes (no explicit save)', async ({ page, baseURL }) => {
  const apiErrors = trackApiErrors(page)
  await login(page, baseURL)
  await openFirstCampaign(page)

  const stamp = Date.now()
  const name = `Flush ${stamp}`
  const desc = `flushed at ${stamp}`

  await createEncounter(page, name)

  // Edit, then immediately Close — without waiting for "Saved". The flush on
  // unmount persists the pending edit; waitForResponse guards that the PUT lands
  // before we reload. (If the 800ms debounce happens to win the race, that PUT
  // persists it just the same — either way the edit survives a bare close.)
  await page.locator('.description-input').fill(desc)
  const savePut = page.waitForResponse(
    (r) => r.request().method() === 'PUT' && /\/encounters\/[^/]+$/.test(r.url()),
  )
  await page.getByRole('button', { name: /^Close/ }).click()
  expect((await savePut).ok(), 'flush PUT should succeed').toBeTruthy()

  // Reload and re-open — the description persisted despite never clicking save
  // and never waiting for the indicator.
  await page.reload()
  await expect(page.getByTestId('chapter-tree')).toBeVisible() // reload restores the two-pane directly (no campaign picker)
  const encounterBtn = page.locator('button.encounter', { hasText: name })
  await expect(encounterBtn).toBeVisible()
  await encounterBtn.click()
  await expect(page.locator('.description-input')).toHaveValue(desc)

  // Cleanup.
  await page.getByRole('button', { name: /^Close/ }).click()
  await deleteEncounter(page, name)

  expect(apiErrors, 'no API request should return 4xx/5xx').toEqual([])
})

import { test, expect } from '@playwright/test'
import { login, trackApiErrors, openFirstCampaign, createEncounter, deleteEncounter } from './helpers/login.js'

// edyq: navigation is encoded in the query string, so reload, back/forward, and
// shareable deep-links land back on the same view instead of dropping to the
// campaign list (the SPA state used to live only in memory).
test('reload and Back keep you on the open encounter (query-string routing)', async ({ page, baseURL }) => {
  const apiErrors = trackApiErrors(page)
  await login(page, baseURL)
  await openFirstCampaign(page)

  const name = `Route ${Date.now()}`
  await createEncounter(page, name)

  // Opening the encounter put its campaign + id in the URL.
  await expect(page).toHaveURL(/[?&]campaign=[^&]+&encounter=[^&]+/)

  // Reload: the SAME encounter's editor comes back — not the campaign picker.
  await page.reload()
  await expect(page.locator('.editor')).toBeVisible()
  await expect(page.getByLabel('encounter name')).toHaveValue(name)
  await expect(page.locator('button.campaign')).toHaveCount(0) // campaign list is NOT shown

  // Switching to the campaign picker clears the campaign from the URL…
  await page.locator('button.campaign-switch').click()
  await expect(page).not.toHaveURL(/campaign=/)
  await expect(page.locator('button.campaign').first()).toBeVisible()

  // …and Back (popstate) restores the encounter view from the URL.
  await page.goBack()
  await expect(page.locator('.editor')).toBeVisible()
  await expect(page.getByLabel('encounter name')).toHaveValue(name)

  // Cleanup.
  await deleteEncounter(page, name)
  expect(apiErrors, 'no API request should return 4xx/5xx').toEqual([])
})

import { test, expect } from '@playwright/test'
import { login, trackApiErrors, openFirstCampaign, createEncounter, deleteEncounter } from './helpers/login.js'

// Placing a hazard in an encounter (bd_521Studios-cid5): a SEPARATE "+ hazard"
// search over hazards + weather hazards (not the monster search), its own slot with
// a HAZARD level header + stat block, counted toward the encounter's difficulty, and
// persisted + re-derived on reload. This is what turned A2 Decrepit Drawbridge / A7
// haunt from forced-Trivial into a real encounter.
test('add a hazard: separate search, HAZARD header + stat block, persists', async ({ page, baseURL }) => {
  const apiErrors = trackApiErrors(page)
  await login(page, baseURL)
  await openFirstCampaign(page)

  const name = `Hazard ${Date.now()}`
  await createEncounter(page, name)

  // The "+ hazard" affordance is separate from "+ monster".
  await page.getByRole('button', { name: '+ hazard' }).click()
  await page.locator('.hazard-search [data-testid="creature-search"]').first().fill('spike launcher')
  const result = page.locator('.hazard-search [data-testid="search-result"]', { hasText: 'Spike Launcher' }).first()
  await expect(result).toBeVisible()
  await result.click()

  const line = page.locator('.hazard-line-wrap')
  await expect(line.getByTestId('hazard-header-level')).toContainText('HAZARD')
  // Open the hazard stat block (rendered via the library HazardStatBlock).
  await line.getByRole('button', { name: 'stat block' }).click()
  await expect(line.locator('[data-testid="hazard-stat-block"]')).toBeVisible()

  // Autosave persists the hazard; reload and confirm it re-derives.
  await expect(page.getByTestId('save-state')).toHaveText('Saved')
  await page.reload()
  await expect(page.getByTestId('chapter-tree')).toBeVisible()
  await page.locator('button.encounter', { hasText: name }).click()
  await expect(page.locator('.hazard-line-wrap').getByTestId('hazard-header-level')).toContainText('HAZARD')

  // Cleanup.
  await page.getByRole('button', { name: /^Close/ }).click()
  await deleteEncounter(page, name)

  expect(apiErrors, 'no API request should return 4xx/5xx').toEqual([])
})

import { test, expect } from '@playwright/test'
import { login, trackApiErrors, openFirstCampaign, createEncounter, deleteEncounter } from './helpers/login.js'

// 1nej: a freeform/custom treasure item (name + gp) for loot not in the pfsrd2
// catalog — gems, art, trophies, quest items (e.g. AV's "peridot bead, 2 gp"). It
// renders inline, its value counts toward the treasure total, and it persists.
test('custom treasure item: add name + gp, counts toward the total, persists', async ({ page, baseURL }) => {
  const apiErrors = trackApiErrors(page)
  await login(page, baseURL)
  await openFirstCampaign(page)

  const name = `Custom ${Date.now()}`
  await createEncounter(page, name)

  // Add a treasure line, then choose the custom-item path instead of the catalog.
  await page.getByRole('button', { name: '+ treasure' }).click()
  await page.getByRole('button', { name: '+ custom item' }).click()
  const custom = page.getByTestId('custom-treasure')
  await expect(custom).toBeVisible()
  await custom.getByLabel('custom item name').fill('peridot bead')
  await custom.getByLabel('value (gp)').fill('2')

  // It counts toward the treasure total (2 gp).
  await expect(page.getByTestId('treasure-value')).toHaveText('2 gp')
  await expect(page.getByTestId('save-state')).toHaveText('Saved')

  // Persists across reload (rides in the ContentRef's opaque json — no API change).
  await page.reload()
  await expect(page.getByTestId('chapter-tree')).toBeVisible()
  await page.locator('button.encounter', { hasText: name }).click()
  const custom2 = page.getByTestId('custom-treasure')
  await expect(custom2.getByLabel('custom item name')).toHaveValue('peridot bead')
  await expect(custom2.getByLabel('value (gp)')).toHaveValue('2')
  await expect(page.getByTestId('treasure-value')).toHaveText('2 gp')

  // Cleanup.
  await page.getByRole('button', { name: /^Close/ }).click()
  await deleteEncounter(page, name)
  expect(apiErrors, 'no API request should return 4xx/5xx').toEqual([])
})

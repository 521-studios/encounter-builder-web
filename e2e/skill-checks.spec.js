import { test, expect } from '@playwright/test'
import { login, trackApiErrors, openFirstCampaign, createEncounter } from './helpers/login.js'

// vz1j: structured skill-check / discovery entries (skill + DC + effect). Persist
// across reload; incomplete rows (no skill or no DC) are dropped on save.
test('skill checks: add a structured DC entry, it persists; incomplete rows are dropped', async ({ page, baseURL }) => {
  const apiErrors = trackApiErrors(page)
  await login(page, baseURL)
  await openFirstCampaign(page)

  const name = `Checks ${Date.now()}`
  await createEncounter(page, name)

  await page.getByRole('button', { name: '+ skill check' }).click()
  const check = page.getByTestId('skill-check')
  await expect(check).toHaveCount(1)
  await check.getByLabel('check skill').fill('Perception')
  await check.getByLabel('check DC').fill('12')
  await check.getByLabel('check effect').fill('# spot the loose planks')

  // A second, incomplete row (skill but no DC) must be dropped on save.
  await page.getByRole('button', { name: '+ skill check' }).click()
  await page.getByTestId('skill-check').nth(1).getByLabel('check skill').fill('Nature')
  await expect(page.getByTestId('save-state')).toHaveText('Saved')

  // Persist across reload: the complete check survives, the incomplete one is gone.
  await page.reload()
  await expect(page.getByTestId('chapter-tree')).toBeVisible()
  await page.locator('button.encounter', { hasText: name }).click()
  const checks2 = page.getByTestId('skill-check')
  await expect(checks2).toHaveCount(1)
  await expect(checks2.getByLabel('check skill')).toHaveValue('Perception')
  await expect(checks2.getByLabel('check DC')).toHaveValue('12')

  // Removing it clears the entry.
  await checks2.getByRole('button', { name: 'remove' }).click()
  await expect(page.getByTestId('skill-check')).toHaveCount(0)
  await expect(page.getByTestId('save-state')).toHaveText('Saved')

  expect(apiErrors).toEqual([])
})

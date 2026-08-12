import { test, expect } from '@playwright/test'
import { login, trackApiErrors } from './helpers/login.js'

// Selecting a campaign enters the two-pane layout: sidebar (campaign switcher +
// encounter list) | main (encounter, or an empty prompt). The switcher returns
// to the campaign picker.
test('selecting a campaign opens the two-pane shell; the switcher returns to the picker', async ({ page, baseURL }) => {
  const apiErrors = trackApiErrors(page)
  await login(page, baseURL)

  const campaigns = page.locator('button.campaign')
  await expect(campaigns.first()).toBeVisible()
  const campaignName = (await campaigns.first().innerText()).trim()
  await campaigns.first().click()

  // Two-pane structure: sidebar with the switcher + encounter list, main with
  // the empty prompt (nothing selected yet).
  await expect(page.locator('.two-pane')).toBeVisible()
  const switcher = page.getByTestId('campaign-switcher')
  await expect(switcher).toBeVisible()
  await expect(switcher).toContainText(campaignName)
  await expect(page.locator('.sidebar .encounters')).toBeVisible()
  await expect(page.getByTestId('empty-main')).toBeVisible()

  // The switcher returns to the campaign picker.
  await switcher.click()
  await expect(page.locator('.campaigns')).toBeVisible()
  await expect(page.locator('.two-pane')).toHaveCount(0)

  expect(apiErrors, 'no API request should return 4xx/5xx').toEqual([])
})

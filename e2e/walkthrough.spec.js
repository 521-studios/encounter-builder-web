import { test, expect } from '@playwright/test'
import { login, trackApiErrors } from './helpers/login.js'

// The end-to-end acceptance loop: sign in → pick a campaign → build an encounter
// (monster search + stat block) → save → persist across reload → release.
// This is the spec form of the manual walkthrough that first validated the app.
test('GM builds and releases an encounter end-to-end', async ({ page, baseURL }) => {
  const apiErrors = trackApiErrors(page)

  await login(page, baseURL)

  const campaigns = page.locator('button.campaign')
  await expect(campaigns.first()).toBeVisible()
  await campaigns.first().click()
  await expect(page.locator('.encounters')).toBeVisible()

  const name = `E2E ${Date.now()}`
  await page.locator('.new-encounter input').fill(name)
  await page.locator('.new-encounter button').click()
  await expect(page.locator('.editor')).toBeVisible()

  // Add a monster via pfsrd2 search and confirm the stat block renders.
  await page.getByRole('button', { name: '+ monster' }).click()
  await page.locator('.monster-search input').first().fill('goblin')
  await expect(page.locator('.suggestions button').first()).toBeVisible()
  await page.locator('.suggestions button').first().click()
  await expect(page.locator('.picked')).toBeVisible()
  await page.getByRole('button', { name: 'stat block' }).first().click()
  await expect(page.locator('.statblock')).toBeVisible()

  // Save, then confirm it persists across a reload.
  await page.getByRole('button', { name: /^Save/ }).click()
  await expect(page.locator('.editor .error[role="alert"]')).toHaveCount(0)

  await page.reload()
  await page.locator('button.campaign').first().click()
  const encounterBtn = page.locator('button.encounter', { hasText: name })
  await expect(encounterBtn).toBeVisible()

  // Release → read-only.
  await encounterBtn.click()
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: /Release/ }).click()
  await expect(page.getByText(/Released/)).toBeVisible()

  expect(apiErrors, 'no API request should return 4xx/5xx').toEqual([])
})

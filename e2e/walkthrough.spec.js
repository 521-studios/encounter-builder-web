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
  await expect(page.locator('[data-testid="chapter-tree"]')).toBeVisible()

  // Create an (unsorted) encounter via the always-present bottom "+ encounter".
  const name = `E2E ${Date.now()}`
  await page.getByTestId('new-encounter').locator('input').fill(name)
  await page.getByTestId('new-encounter').locator('button').click()
  await expect(page.locator('.editor')).toBeVisible()

  // Add a monster via pfsrd2 search and confirm the stat block renders.
  await page.getByRole('button', { name: '+ monster' }).click()
  await page.locator('.monster-search input').first().fill('goblin')
  await expect(page.locator('.suggestions button').first()).toBeVisible()
  await page.locator('.suggestions button').first().click()
  await expect(page.locator('.picked')).toBeVisible()
  await page.getByRole('button', { name: 'stat block' }).first().click()
  await expect(page.locator('.statblock')).toBeVisible()

  // Save — wait for the PUT to actually land. Asserting toHaveCount(0) alone
  // passes instantly (before the request settles), so the following reload
  // could abort an in-flight save and mask a broken persist.
  const savePut = page.waitForResponse(
    (r) => r.request().method() === 'PUT' && /\/encounters\/[^/]+$/.test(r.url()),
  )
  await page.getByRole('button', { name: /^Save/ }).click()
  expect((await savePut).ok(), 'save PUT should succeed').toBeTruthy()
  await expect(page.locator('.editor .error[role="alert"]')).toHaveCount(0)

  // Reload and re-open the encounter — confirm the *monster* persisted, not just
  // the name (a silently-failed save would still show the name in the list).
  await page.reload()
  await page.locator('button.campaign').first().click()
  const encounterBtn = page.locator('button.encounter', { hasText: name })
  await expect(encounterBtn).toBeVisible()
  await encounterBtn.click()
  await expect(page.locator('.editor')).toBeVisible()
  await expect(page.locator('.picked')).toBeVisible()
  await page.getByRole('button', { name: 'stat block' }).first().click()
  await expect(page.locator('.statblock')).toBeVisible()

  // Release → read-only.
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: /Release/ }).click()
  await expect(page.getByText(/Released/)).toBeVisible()

  expect(apiErrors, 'no API request should return 4xx/5xx').toEqual([])

  // Clean up so staging doesn't accumulate one encounter per run. (Left to the
  // end rather than afterEach: a failure earlier leaves one row, which is
  // acceptable on throwaway staging and keeps the failure's state inspectable.)
  await page.getByRole('button', { name: /^Close/ }).click()
  const row = page.locator('li', { has: page.locator('button.encounter', { hasText: name }) })
  await row.getByRole('button', { name: `Delete ${name}` }).click()
  await expect(row).toHaveCount(0)
})

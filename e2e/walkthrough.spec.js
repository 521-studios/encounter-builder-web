import { test, expect } from '@playwright/test'
import { login, trackApiErrors } from './helpers/login.js'

// The end-to-end acceptance loop: sign in → pick a campaign → build an encounter
// (monster search + stat block) → autosave → persist across reload → release.
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

  // Add a monster via the library CreatureSearch and confirm the stat block renders.
  await page.getByRole('button', { name: '+ monster' }).click()
  await page.locator('.monster-search [data-testid="creature-search"]').first().fill('goblin')
  await expect(page.locator('.monster-search [data-testid="search-result"]').first()).toBeVisible()
  await page.locator('.monster-search [data-testid="search-result"]').first().click()
  await expect(page.locator('.picked')).toBeVisible()
  await page.getByRole('button', { name: 'stat block' }).first().click()
  await expect(page.locator('.statblock')).toBeVisible()

  // Give it a markdown description (v2) and confirm the library Markdown renders it.
  await page.locator('.description-input').fill('# The Vault\n\nA **giant** guards the door.')
  await expect(page.getByTestId('description-preview').locator('h1')).toHaveText('The Vault')
  await expect(page.getByTestId('description-preview').locator('strong')).toHaveText('giant')

  // Autosave — wait for the status indicator to reach "Saved" before reloading.
  // It flips to "Saved" only after the debounced PUT resolves with no pending
  // edits, so this guarantees the save landed (a reload here can't abort it) and
  // that it succeeded (a failed PUT shows "Save failed", not "Saved").
  await expect(page.getByTestId('save-state')).toHaveText('Saved')
  await expect(page.locator('.editor .error[role="alert"]')).toHaveCount(0)

  // Reload and re-open the encounter — confirm the *monster* persisted, not just
  // the name (a silently-failed save would still show the name in the list).
  await page.reload()
  await page.locator('button.campaign').first().click()
  const encounterBtn = page.locator('button.encounter', { hasText: name })
  await expect(encounterBtn).toBeVisible()
  await encounterBtn.click()
  await expect(page.locator('.editor')).toBeVisible()
  // The markdown description persisted (raw in the textarea, rendered in preview).
  await expect(page.locator('.description-input')).toHaveValue(/The Vault/)
  await expect(page.getByTestId('description-preview').locator('h1')).toHaveText('The Vault')
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

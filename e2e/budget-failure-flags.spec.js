import { test, expect } from '@playwright/test'
import { login, openFirstCampaign, createEncounter, deleteEncounter } from './helpers/login.js'

// f4fc: when an encounter's referenced entries can't load, the treasure/difficulty
// budget must say so — a failure alert + Retry — not silently show a wrong/zero
// budget. (The component's flag rendering is unit-tested; this covers the real
// hook→panel wiring under a forced entry-load failure.)
test('the treasure budget surfaces an entry load failure with a Retry', async ({ page, baseURL }) => {
  await login(page, baseURL)
  await openFirstCampaign(page)

  const name = `BudgetFail ${Date.now()}`
  await createEncounter(page, name)

  // Every pfsrd2 full-entry fetch fails — the budget can't level/value the monster.
  await page.route('**/api/pfsrd2/entries/**/full', (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }),
  )

  // Add a monster (search hits a different endpoint, so the picker still works).
  await page.getByRole('button', { name: '+ monster' }).click()
  await page.locator('.monster-search [data-testid="creature-search"]').first().fill('adult cinder dragon')
  const dragon = page.locator('.monster-search [data-testid="search-result"][data-name="Adult Cinder Dragon"]')
  await expect(dragon).toBeVisible()
  await dragon.click()
  await expect(page.locator('.picked')).toBeVisible()

  // The budget panel shows the failure alert + Retry rather than a bogus budget.
  const budget = page.getByTestId('treasure-budget')
  const err = budget.getByTestId('budget-error')
  await expect(err).toBeVisible()
  await expect(err).toContainText(/failed to load/)
  await expect(err.getByRole('button', { name: /Retry/ })).toBeVisible()

  await page.unroute('**/api/pfsrd2/entries/**/full')
  await page.getByRole('button', { name: /^Close/ }).click()
  await deleteEncounter(page, name)
})

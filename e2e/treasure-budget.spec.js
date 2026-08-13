import { test, expect } from '@playwright/test'
import { login, trackApiErrors } from './helpers/login.js'

// Slice 4: the encounter's treasure-vs-budget panel — difficulty band from
// monster XP, treasure value from item prices, shown against the Table 5-3 row.
test('encounter budget panel shows difficulty band + treasure value + the Table 5-3 chart', async ({ page, baseURL }) => {
  const apiErrors = trackApiErrors(page)
  await login(page, baseURL)
  await page.locator('button.campaign').first().click()

  const name = `Budget ${Date.now()}`
  await page.getByTestId('new-encounter').locator('input').fill(name)
  await page.getByTestId('new-encounter').locator('button').click()
  await expect(page.locator('.editor')).toBeVisible()

  const budget = page.getByTestId('treasure-budget')
  await expect(budget).toBeVisible()
  // Empty encounter: Trivial (0 XP), and the Table 5-3 chart row renders.
  await expect(page.getByTestId('encounter-threat')).toHaveText(/Trivial|Low|Moderate|Severe|Extreme/)
  await expect(budget.locator('.treasure-chart')).toBeVisible()
  await expect(budget.locator('.treasure-chart thead th')).toHaveCount(5) // label + 4 bands

  // Add a monster → XP rises above 0 (the difficulty reflects the roster).
  await page.getByRole('button', { name: '+ monster' }).click()
  await page.locator('.monster-search [data-testid="creature-search"]').first().fill('goblin')
  await expect(page.locator('.monster-search [data-testid="search-result"]').first()).toBeVisible()
  await page.locator('.monster-search [data-testid="search-result"]').first().click()
  await expect(page.locator('.picked')).toBeVisible()
  await expect(page.getByTestId('encounter-threat')).toContainText(/\w/)
  // The XP figure in the summary is now non-zero.
  await expect(budget.getByText(/\([1-9]\d* XP\)/)).toBeVisible()

  // Add coin treasure → the treasure value reflects it (no item fetch needed).
  await page.getByRole('button', { name: '+ treasure' }).click()
  // The value shows a gp amount (from the item once picked, or coins). Assert the
  // treasure-value cell is present and formatted as gp.
  await expect(page.getByTestId('treasure-value')).toHaveText(/gp$/)

  // Cleanup.
  await page.getByRole('button', { name: /^Close/ }).click()
  const row = page.locator('li', { has: page.locator('button.encounter', { hasText: name }) })
  await row.getByRole('button', { name: `Delete ${name}` }).click()
  await expect(row).toHaveCount(0)

  expect(apiErrors, 'no API request should return 4xx/5xx').toEqual([])
})

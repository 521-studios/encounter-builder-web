import { test, expect } from '@playwright/test'
import { login, trackApiErrors } from './helpers/login.js'

// Slice 4: the encounter's treasure-vs-budget panel — difficulty band from
// monster XP, treasure value from coins/item prices, shown against the Table 5-3
// row with an over/under-target verdict. Driven to a deterministic Extreme band
// (a level-14 dragon at a party override of level 1) so the marking is asserted.
test('encounter budget panel: difficulty band, treasure value, and over/under the Table 5-3 target', async ({ page, baseURL }) => {
  const apiErrors = trackApiErrors(page)
  await login(page, baseURL)
  await page.locator('button.campaign').first().click()

  const name = `Budget ${Date.now()}`
  await page.getByTestId('new-encounter').locator('input').fill(name)
  await page.getByTestId('new-encounter').locator('button').click()
  await expect(page.locator('.editor')).toBeVisible()

  const budget = page.getByTestId('treasure-budget')
  await expect(budget).toBeVisible()
  await expect(budget.locator('.treasure-chart thead th')).toHaveCount(5) // label + 4 bands

  // Pin the effective party to level 1, 4 PCs (deterministic regardless of the
  // campaign default) via the encounter's own override.
  await page.locator('.editor').getByLabel('party level').fill('1')
  await page.locator('.editor').getByLabel('party size').fill('4')

  // A level-14 dragon vs a level-1 party is capped at PL+4 = 160 XP → Extreme.
  await page.getByRole('button', { name: '+ monster' }).click()
  const dragon = page.locator('.monster-search [data-testid="search-result"][data-name="Adult Cinder Dragon"]')
  await page.locator('.monster-search [data-testid="creature-search"]').first().fill('adult cinder dragon')
  await expect(dragon).toBeVisible()
  await dragon.click()
  await expect(page.locator('.picked')).toBeVisible()

  // Difficulty resolves to Extreme once the creature entry loads; treasure (0 gp)
  // is under the Extreme target (35 gp at level 1) and the Extreme cell marks ▲.
  await expect(page.getByTestId('encounter-threat')).toHaveText('Extreme')
  await expect(page.getByTestId('treasure-delta')).toContainText('under the Extreme target')
  const extremeCell = budget.locator('.treasure-chart td[data-band="extreme"]')
  await expect(extremeCell).toHaveAttribute('data-active', 'true')
  await expect(extremeCell).toContainText('▲')

  // Add 40 gp of coin (> the 35 gp Extreme target) → the value flips to over ✓.
  await page.locator('.editor .coins').getByLabel('gp', { exact: true }).fill('40')
  await expect(page.getByTestId('treasure-value')).toHaveText('40 gp')
  await expect(page.getByTestId('treasure-delta')).toContainText('over the Extreme target')
  await expect(extremeCell).toContainText('✓')

  // Cleanup.
  await page.getByRole('button', { name: /^Close/ }).click()
  const row = page.locator('li', { has: page.locator('button.encounter', { hasText: name }) })
  await row.getByRole('button', { name: `Delete ${name}` }).click()
  await expect(row).toHaveCount(0)

  expect(apiErrors, 'no API request should return 4xx/5xx').toEqual([])
})

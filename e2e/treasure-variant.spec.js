import { test, expect } from '@playwright/test'
import { login, trackApiErrors } from './helpers/login.js'

// Pick an item with variants (a Striking rune), switch to the Greater variant,
// and confirm the choice persists across a reload (stored by name on the line).
test('treasure item variant is switchable and persists', async ({ page, baseURL }) => {
  const apiErrors = trackApiErrors(page)
  await login(page, baseURL)
  await page.locator('button.campaign').first().click()

  const name = `TVar ${Date.now()}`
  await page.getByTestId('new-encounter').locator('input').fill(name)
  await page.getByTestId('new-encounter').locator('button').click()
  await expect(page.locator('.editor')).toBeVisible()

  // Add a treasure line and pick the Striking rune (has variants).
  await page.getByRole('button', { name: '+ treasure' }).click()
  await page.locator('.item-search [data-testid="item-search"]').first().fill('striking')
  const striking = page.locator('.item-search [data-testid="item-search-result"][data-name="Striking"]').first()
  await expect(striking).toBeVisible()
  await striking.click()

  const card = page.locator('.treasure-line-wrap .itemcard')
  const select = card.locator('.Monster__variant-select')
  await expect(select).toBeVisible()
  await expect(card.locator('.Monster__level')).toContainText('4') // base Striking

  // Switch to the Greater variant (option value = index 1) and save.
  await select.selectOption('1')
  await expect(card.locator('.Monster__level')).toContainText('12')
  const savePut = page.waitForResponse(
    (r) => r.request().method() === 'PUT' && /\/encounters\/[^/]+$/.test(r.url()),
  )
  await page.getByRole('button', { name: /^Save/ }).click()
  expect((await savePut).ok()).toBeTruthy()

  // Reload, re-open — the Greater variant is still selected.
  await page.reload()
  await page.locator('button.campaign').first().click()
  await page.locator('button.encounter', { hasText: name }).click()
  const card2 = page.locator('.treasure-line-wrap .itemcard')
  await expect(card2.locator('.Monster__level')).toContainText('12')
  await expect(card2.locator('.Monster__variant-select')).toHaveValue('1')

  // Cleanup.
  await page.getByRole('button', { name: /^Close/ }).click()
  const row = page.locator('li', { has: page.locator('button.encounter', { hasText: name }) })
  await row.getByRole('button', { name: `Delete ${name}` }).click()
  await expect(row).toHaveCount(0)

  expect(apiErrors, 'no API request should return 4xx/5xx').toEqual([])
})

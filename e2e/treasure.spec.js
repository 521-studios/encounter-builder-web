import { test, expect } from '@playwright/test'
import { login, trackApiErrors } from './helpers/login.js'

// Treasure via the library: pick an item with ItemSearch (no more raw game_ids)
// and render it with ItemCard; confirm it persists across reload.
test('treasure: pick an item with ItemSearch, render ItemCard, persist', async ({ page, baseURL }) => {
  const apiErrors = trackApiErrors(page)
  await login(page, baseURL)
  await page.locator('button.campaign').first().click()

  const name = `Treasure ${Date.now()}`
  await page.getByTestId('new-encounter').locator('input').fill(name)
  await page.getByTestId('new-encounter').locator('button').click()
  await expect(page.locator('.editor')).toBeVisible()

  // Add a treasure line and pick an item by name.
  await page.getByRole('button', { name: '+ treasure' }).click()
  await page.locator('.item-search [data-testid="item-search"]').first().fill('sword')
  const result = page.locator('.item-search [data-testid="item-search-result"]').first()
  await expect(result).toBeVisible()
  await result.click()

  // The ItemCard renders the picked item.
  const card = page.locator('.treasure-line-wrap .itemcard')
  await expect(card.locator('.Monster__name')).not.toBeEmpty()
  const itemName = (await card.locator('.Monster__name').innerText()).trim()

  // Save, reload, re-open — the item persisted and re-renders.
  const savePut = page.waitForResponse(
    (r) => r.request().method() === 'PUT' && /\/encounters\/[^/]+$/.test(r.url()),
  )
  await page.getByRole('button', { name: /^Save/ }).click()
  expect((await savePut).ok()).toBeTruthy()

  await page.reload()
  await page.locator('button.campaign').first().click()
  await page.locator('button.encounter', { hasText: name }).click()
  await expect(page.locator('.treasure-line-wrap .itemcard .Monster__name')).toHaveText(itemName)

  // Cleanup.
  await page.getByRole('button', { name: /^Close/ }).click()
  const row = page.locator('li', { has: page.locator('button.encounter', { hasText: name }) })
  await row.getByRole('button', { name: `Delete ${name}` }).click()
  await expect(row).toHaveCount(0)

  expect(apiErrors, 'no API request should return 4xx/5xx').toEqual([])
})

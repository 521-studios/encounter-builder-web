import { test, expect } from '@playwright/test'
import { login, trackApiErrors } from './helpers/login.js'

// Pick an item with versions (a Striking rune). It reads like the book — every
// version stacked, nothing selected until the GM locks one in — and the chosen
// version persists across a reload (stored by name on the line).
test('treasure item version is locked in by selecting it and persists', async ({ page, baseURL }) => {
  const apiErrors = trackApiErrors(page)
  await login(page, baseURL)
  await page.locator('button.campaign').first().click()

  const name = `TVar ${Date.now()}`
  await page.getByTestId('new-encounter').locator('input').fill(name)
  await page.getByTestId('new-encounter').locator('button').click()
  await expect(page.locator('.editor')).toBeVisible()

  // Add a treasure line and pick the Striking rune (has versions).
  await page.getByRole('button', { name: '+ treasure' }).click()
  await page.locator('.item-search [data-testid="item-search"]').first().fill('striking')
  const striking = page.locator('.item-search [data-testid="item-search-result"][data-name="Striking"]').first()
  await expect(striking).toBeVisible()
  await striking.click()

  const wrap = page.locator('.treasure-line-wrap')
  const card = wrap.locator('.itemcard')
  // Book header + a prompt to pick; nothing selected yet (require a lock-in).
  await expect(card.locator('.Monster__level')).toContainText('4+')
  await expect(wrap.locator('.variant-hint')).toBeVisible()
  await expect(card.locator('.Monster__variant--selected')).toHaveCount(0)

  // Lock in the Greater version → the card collapses to just it; prompt clears.
  const greater = card.locator('.Monster__variant', { hasText: 'Striking (Greater)' })
  await expect(greater).toContainText('Item 12')
  await greater.click()
  await expect(card.locator('.Monster__name')).toHaveText('Striking (Greater)')
  await expect(card.locator('.Monster__variants')).toHaveCount(0) // collapsed — list gone
  await expect(wrap.locator('.variant-hint')).toHaveCount(0)

  const savePut = page.waitForResponse(
    (r) => r.request().method() === 'PUT' && /\/encounters\/[^/]+$/.test(r.url()),
  )
  await page.getByRole('button', { name: /^Save/ }).click()
  expect((await savePut).ok()).toBeTruthy()

  // Reload, re-open — the Greater version is still locked in (collapsed), no prompt.
  await page.reload()
  await page.locator('button.campaign').first().click()
  await page.locator('button.encounter', { hasText: name }).click()
  const wrap2 = page.locator('.treasure-line-wrap')
  const card2 = wrap2.locator('.itemcard')
  await expect(card2.locator('.Monster__name')).toHaveText('Striking (Greater)')
  await expect(card2.locator('.Monster__variants')).toHaveCount(0)
  await expect(wrap2.locator('.variant-hint')).toHaveCount(0)

  // Cleanup.
  await page.getByRole('button', { name: /^Close/ }).click()
  const row = page.locator('li', { has: page.locator('button.encounter', { hasText: name }) })
  await row.getByRole('button', { name: `Delete ${name}` }).click()
  await expect(row).toHaveCount(0)

  expect(apiErrors, 'no API request should return 4xx/5xx').toEqual([])
})

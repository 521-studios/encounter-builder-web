import { test, expect } from '@playwright/test'
import { login, trackApiErrors, openFirstCampaign, createEncounter, deleteEncounter } from './helpers/login.js'

// Treasure via the library: pick an item with ItemSearch (no more raw game_ids)
// and render it with ItemCard; confirm it persists across reload.
test('treasure: pick an item with ItemSearch, render ItemCard, persist', async ({ page, baseURL }) => {
  const apiErrors = trackApiErrors(page)
  await login(page, baseURL)
  await openFirstCampaign(page)

  const name = `Treasure ${Date.now()}`
  await createEncounter(page, name)

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

  // Autosave persists the added item; wait for the indicator, then reload and re-open.
  await expect(page.getByTestId('save-state')).toHaveText('Saved')

  await page.reload()
  await expect(page.getByTestId('chapter-tree')).toBeVisible() // reload restores the two-pane directly (no campaign picker)
  await page.locator('button.encounter', { hasText: name }).click()
  await expect(page.locator('.treasure-line-wrap .itemcard .Monster__name')).toHaveText(itemName)

  // Cleanup.
  await page.getByRole('button', { name: /^Close/ }).click()
  await deleteEncounter(page, name)

  expect(apiErrors, 'no API request should return 4xx/5xx').toEqual([])
})

import { test, expect } from '@playwright/test'
import { login, trackApiErrors, openFirstCampaign, createEncounter, deleteEncounter } from './helpers/login.js'

// The library search filters wired into the app's monster + treasure pickers:
// CreatureSearch by trait, ItemSearch by category/subcategory (+ trait). The
// filter vocabularies come from pfsrd2-data-api (/search/traits, /search/facets).
test('monster + treasure pickers filter by tag / category', async ({ page, baseURL }) => {
  const apiErrors = trackApiErrors(page)
  await login(page, baseURL)
  await openFirstCampaign(page)

  const name = `Filters ${Date.now()}`
  await createEncounter(page, name)

  // --- Monster picker: trait filter present + narrows the results ---
  await page.getByRole('button', { name: '+ monster' }).click()
  const cinder = page.locator(
    '.monster-search [data-testid="search-result"][data-name="Adult Cinder Dragon"]',
  )
  await page.locator('.monster-search [data-testid="creature-search"]').fill('adult cinder dragon')
  await expect(cinder).toBeVisible() // level 14

  // Level range narrows: capping at 5 drops the level-14 dragon; clear it back.
  const levelMax = page.locator('.monster-search [data-testid="CreatureSearch-level-max"]')
  await levelMax.fill('5')
  await expect(cinder).toHaveCount(0)
  await levelMax.fill('')
  await expect(cinder).toBeVisible()

  const creatureTrait = page.locator('.monster-search [data-testid="CreatureSearch-trait-input"]')
  await creatureTrait.click()
  await creatureTrait.fill('undead')
  const undead = page
    .locator('.monster-search [data-testid="CreatureSearch-trait-option"]', { hasText: /^Undead$/ })
    .first()
  await expect(undead).toBeVisible()
  await undead.click()
  // Adult Cinder Dragon isn't Undead → filtered out.
  await expect(cinder).toHaveCount(0)

  // --- Treasure picker: category dropdown + trait filter present, category narrows ---
  await page.getByRole('button', { name: '+ treasure' }).click()
  const category = page.locator('.item-search [data-testid="ItemSearch-category"]')
  await expect(category.locator('option', { hasText: 'Runes' })).toBeAttached()
  await expect(page.locator('.item-search [data-testid="ItemSearch-trait-input"]')).toBeVisible()

  // Filter-only browse: picking a category populates the list with no typing.
  const results = page.locator('.item-search [data-testid="item-search-result"]')
  await expect(results).toHaveCount(0) // nothing typed, no filter yet
  await category.selectOption('Runes')
  await expect(results.first()).toBeVisible() // the list fills from the filter alone

  const striking = page.locator(
    '.item-search [data-testid="item-search-result"][data-name="Striking"]',
  )
  await category.selectOption('Armor')
  await page.locator('.item-search [data-testid="item-search"]').fill('striking')
  await expect(striking).toHaveCount(0) // Striking is a Rune, excluded under Armor
  await category.selectOption('Runes')
  await expect(striking.first()).toBeVisible()

  // Cleanup.
  await page.getByRole('button', { name: /^Close/ }).click()
  await deleteEncounter(page, name)

  expect(apiErrors, 'no API request should return 4xx/5xx').toEqual([])
})

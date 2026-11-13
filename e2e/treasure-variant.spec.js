import { test, expect } from '@playwright/test'
import { login, trackApiErrors, openFirstCampaign, createEncounter, deleteEncounter, addContent, openEncounter } from './helpers/login.js'

// Pick an item with versions (a Striking rune). It reads like the book — every
// version stacked, nothing selected until the GM locks one in — and the chosen
// version persists across a reload (stored by name on the line).
test('treasure item version is locked in by selecting it and persists', async ({ page, baseURL }) => {
  const apiErrors = trackApiErrors(page)
  await login(page, baseURL)
  await openFirstCampaign(page)

  const name = `TVar ${Date.now()}`
  await createEncounter(page, name)

  // Add a treasure line and pick the Striking rune (has versions).
  await addContent(page, 'Treasure')
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

  // Autosave persists the edits — wait for the indicator to settle before reload/assert.
  await expect(page.getByTestId('save-state')).toHaveText('Saved')

  // Reload, re-open — the Greater version is still locked in (collapsed), no prompt.
  await page.reload()
  await expect(page.getByTestId('chapter-tree')).toBeVisible() // reload restores the two-pane directly (no campaign picker)
  await openEncounter(page, name)
  const wrap2 = page.locator('.treasure-line-wrap')
  const card2 = wrap2.locator('.itemcard')
  await expect(card2.locator('.Monster__name')).toHaveText('Striking (Greater)')
  await expect(card2.locator('.Monster__variants')).toHaveCount(0)
  await expect(wrap2.locator('.variant-hint')).toHaveCount(0)

  // Cleanup.
  await page.getByRole('button', { name: /^Close/ }).click()
  await deleteEncounter(page, name)

  expect(apiErrors, 'no API request should return 4xx/5xx').toEqual([])
})

// Searching by a VARIANT's name preselects that variant: the suggest row carries
// matched_variant (pfsrd2 data-api #86), so the GM doesn't have to pick it twice.
test('treasure: searching a variant name preselects that variant', async ({ page, baseURL }) => {
  const apiErrors = trackApiErrors(page)
  await login(page, baseURL)
  await openFirstCampaign(page)

  const name = `TVarPick ${Date.now()}`
  await createEncounter(page, name)
  try {
    await addContent(page, 'Treasure')
    await page.locator('.item-search [data-testid="item-search"]').first().fill('healing potion (lesser)')
    const potion = page.locator('.item-search [data-testid="item-search-result"][data-name="Healing Potion"]').first()
    await expect(potion).toBeVisible()
    await potion.click()

    const wrap = page.locator('.treasure-line-wrap')
    await expect(wrap.locator('.itemcard .Monster__name')).toHaveText('Healing Potion (Lesser)')
    await expect(wrap.locator('.variant-hint')).toHaveCount(0) // already locked in
    await expect(page.getByTestId('save-state')).toHaveText('Saved')
  } finally {
    await page.getByRole('button', { name: /^Close/ }).click().catch(() => {})
    await deleteEncounter(page, name)
  }

  expect(apiErrors, 'no API request should return 4xx/5xx').toEqual([])
})

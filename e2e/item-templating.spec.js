import { test, expect } from '@playwright/test'
import { login, trackApiErrors, openFirstCampaign, createEncounter, deleteEncounter } from './helpers/login.js'

// Item templating (6wzv): a treasure item can be customized with a rune — "+1 rapier"
// = base Rapier + Weapon Potency — named, highlighted, and re-derived after reload
// (the item analog of the monster-template flow). This is what used to return
// "No results" when searched as "+1 rapier".
test('treasure item templating: compose a rune onto a weapon, name it, persist + re-derive', async ({ page, baseURL }) => {
  const apiErrors = trackApiErrors(page)
  await login(page, baseURL)
  await openFirstCampaign(page)

  const name = `Compose ${Date.now()}`
  await createEncounter(page, name)

  // Add a treasure line and pick the BASE weapon.
  await page.getByRole('button', { name: '+ treasure' }).click()
  await page.locator('.item-search [data-testid="item-search"]').first().fill('rapier')
  const rapier = page.locator('.item-search [data-testid="item-search-result"]', { hasText: 'Rapier' }).first()
  await expect(rapier).toBeVisible()
  await rapier.click()

  const line = page.locator('.treasure-line-wrap')
  await expect(line.locator('.itemcard .Monster__name')).toHaveText('Rapier')

  // Customize → the ItemSlotPicker.
  await line.getByTestId('customize-item').click()
  const picker = page.getByTestId('item-slot-picker')
  await expect(picker).toBeVisible()

  // Name it, then apply Weapon Potency (exact name — "Weapon Potency" is a substring
  // of "Mythic Weapon Potency", also eligible).
  await picker.getByTestId('item-name').fill('Sting')
  await expect(line.locator('.itemcard .Monster__name')).toHaveText('Sting')

  const potency = picker
    .locator('.ItemSlotPicker__item')
    .filter({ has: page.locator('.ItemSlotPicker__item-name', { hasText: /^Weapon Potency$/ }) })
  await potency.getByTestId('grade-open').click()
  await potency.getByTestId('apply-grade').click()

  // The applied stack shows it and the card highlights the added attack bonus.
  await expect(picker.getByTestId('applied-tag')).toContainText('Weapon Potency')
  await expect(line.locator('.itemcard .Monster__changed').first()).toBeVisible()

  // Autosave persists the derived ref; reload and confirm it re-derives.
  await expect(page.getByTestId('save-state')).toHaveText('Saved')

  await page.reload()
  await expect(page.getByTestId('chapter-tree')).toBeVisible()
  await page.locator('button.encounter', { hasText: name }).click()
  const line2 = page.locator('.treasure-line-wrap')
  await expect(line2.locator('.itemcard .Monster__name')).toHaveText('Sting') // custom name survived
  await expect(line2.getByTestId('applied-tag')).toContainText('Weapon Potency') // stack re-derived
  await expect(line2.locator('.itemcard .Monster__changed').first()).toBeVisible() // highlighting re-derived

  // Cleanup.
  await page.getByRole('button', { name: /^Close/ }).click()
  await deleteEncounter(page, name)

  expect(apiErrors, 'no API request should return 4xx/5xx').toEqual([])
})

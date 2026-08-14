import { test, expect } from '@playwright/test'
import { login, trackApiErrors, openFirstCampaign, createEncounter, deleteEncounter } from './helpers/login.js'

// 529w: for a table that isn't the 4-PC book standard, the budget panel shows the
// same roster's CANONICAL band at 4 PCs (directly comparable to a module's printed
// band) plus the party-size–normalized XP — so a GM can tell "under-tuned for my
// bigger table" from "the band the book intends".
test('budget shows the canonical 4-PC band + normalized XP for a larger table', async ({ page, baseURL }) => {
  const apiErrors = trackApiErrors(page)
  await login(page, baseURL)
  await openFirstCampaign(page)

  const name = `Canon ${Date.now()}`
  await createEncounter(page, name)

  // Pin a 6-PC table at level 1 via the encounter's own override.
  await page.locator('.editor').getByLabel('party level').fill('1')
  await page.locator('.editor').getByLabel('party size').fill('6')

  // Level-14 dragon vs level 1 is capped at PL+4 = 160 XP: Moderate for 6 PCs, but
  // Extreme at the 4-PC book standard.
  await page.getByRole('button', { name: '+ monster' }).click()
  await page.locator('.monster-search [data-testid="creature-search"]').first().fill('adult cinder dragon')
  const dragon = page.locator('.monster-search [data-testid="search-result"][data-name="Adult Cinder Dragon"]')
  await expect(dragon).toBeVisible()
  await dragon.click()
  await expect(page.locator('.picked')).toBeVisible()

  await expect(page.getByTestId('encounter-threat')).toHaveText('Moderate') // as-configured (6 PCs)
  const canon = page.getByTestId('budget-canonical')
  await expect(canon).toBeVisible()
  await expect(page.getByTestId('canonical-threat')).toHaveText('Extreme') // 4-PC book standard
  await expect(canon).toContainText(/~\d+ XP for a 4-PC party/)
  // The title badge's tooltip carries the same canonical note.
  await expect(page.getByTestId('difficulty-badge')).toHaveAttribute('title', /Extreme at 4 PCs \(book standard\)/)

  // At the 4-PC standard the lens is redundant and hidden.
  await page.locator('.editor').getByLabel('party size').fill('4')
  await expect(page.getByTestId('budget-canonical')).toHaveCount(0)

  await page.getByRole('button', { name: /^Close/ }).click()
  await deleteEncounter(page, name)
  expect(apiErrors, 'no API request should return 4xx/5xx').toEqual([])
})

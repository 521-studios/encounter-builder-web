import { test, expect } from '@playwright/test'
import { login, trackApiErrors, openFirstCampaign, createEncounter } from './helpers/login.js'

// izuh: non-combat XP awards (story/exploration/ally) add to the party's XP total
// but not to the encounter's combat difficulty band. They persist, and blank rows
// are dropped on save.
test('xp awards: add non-combat XP, it counts toward total (not the band), and persists', async ({ page, baseURL }) => {
  const apiErrors = trackApiErrors(page)
  await login(page, baseURL)
  await openFirstCampaign(page)

  const name = `Awards ${Date.now()}`
  await createEncounter(page, name)

  // No monsters → 0 combat XP, Trivial band. Add a 30 XP ally award.
  await page.getByRole('button', { name: '+ XP award' }).click()
  const award = page.getByTestId('xp-award')
  await expect(award).toHaveCount(1)
  await award.getByLabel('XP amount').fill('30')
  await award.getByLabel('award reason').fill('gained Augrael as an ally')

  // The budget surfaces the award as advancement XP, but the band stays Trivial
  // (award XP does not shift combat difficulty).
  await expect(page.getByTestId('award-xp')).toHaveText('+ 30 non-combat = 30 XP total')
  await expect(page.getByTestId('encounter-threat')).toHaveText('Trivial')

  // A blank second award row must not break the save (it's dropped, not sent).
  await page.getByRole('button', { name: '+ XP award' }).click()
  await expect(page.getByTestId('save-state')).toHaveText('Saved')

  // Persist across reload: the valued award survives, the blank one is gone.
  await page.reload()
  await expect(page.getByTestId('chapter-tree')).toBeVisible()
  await page.locator('button.encounter', { hasText: name }).click()
  const awards2 = page.getByTestId('xp-award')
  await expect(awards2).toHaveCount(1)
  await expect(awards2.getByLabel('XP amount')).toHaveValue('30')
  await expect(awards2.getByLabel('award reason')).toHaveValue('gained Augrael as an ally')
  await expect(page.getByTestId('award-xp')).toHaveText('+ 30 non-combat = 30 XP total')

  // Removing the award clears it from the budget.
  await awards2.getByRole('button', { name: 'remove' }).click()
  await expect(page.getByTestId('xp-award')).toHaveCount(0)
  await expect(page.getByTestId('award-xp')).toHaveCount(0)
  await expect(page.getByTestId('save-state')).toHaveText('Saved')

  expect(apiErrors).toEqual([])
})

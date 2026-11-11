import { test, expect } from '@playwright/test'
import { login, trackApiErrors, openFirstCampaign, createEncounter, addContent, openEncounter, openBudget, removeRow } from './helpers/login.js'

// izuh: non-combat XP awards (story/exploration/ally) add to the party's XP total
// but not to the encounter's combat difficulty band. They persist.
test('xp awards: add non-combat XP, it counts toward total (not the band), and persists', async ({ page, baseURL }) => {
  const apiErrors = trackApiErrors(page)
  await login(page, baseURL)
  await openFirstCampaign(page)

  const name = `Awards ${Date.now()}`
  await createEncounter(page, name)

  // No monsters → 0 combat XP, Trivial band. Add a 30 XP ally award.
  await addContent(page, 'XP award')
  const award = page.getByTestId('xp-award')
  await expect(award).toHaveCount(1)
  await award.getByLabel('XP amount').fill('30')
  await award.getByLabel('award reason').fill('gained Augrael as an ally')

  // The budget surfaces the award as advancement XP, but the band stays Trivial
  // (award XP does not shift combat difficulty).
  await openBudget(page)
  await expect(page.getByTestId('award-xp')).toHaveText('+ 30 non-combat = 30 XP total')
  await expect(page.getByTestId('encounter-threat')).toHaveText('Trivial')

  await expect(page.getByTestId('save-state')).toHaveText('Saved')

  // Persist across reload.
  await page.reload()
  await expect(page.getByTestId('chapter-tree')).toBeVisible()
  await openEncounter(page, name)
  const awards2 = page.getByTestId('xp-award')
  await expect(awards2).toHaveCount(1)
  await expect(awards2.getByLabel('XP amount')).toHaveValue('30')
  await expect(awards2.getByLabel('award reason')).toHaveValue('gained Augrael as an ally')
  await openBudget(page)
  await expect(page.getByTestId('award-xp')).toHaveText('+ 30 non-combat = 30 XP total')

  // Removing the award clears it from the budget.
  await removeRow(page, awards2)
  await expect(page.getByTestId('xp-award')).toHaveCount(0)
  await expect(page.getByTestId('award-xp')).toHaveCount(0)
  await expect(page.getByTestId('save-state')).toHaveText('Saved')

  expect(apiErrors).toEqual([])
})

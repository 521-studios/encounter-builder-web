import { test, expect } from '@playwright/test'
import { login, trackApiErrors, openFirstCampaign, createEncounter, deleteEncounter, addContent, openEncounter, openBudget } from './helpers/login.js'

// iuha: treasure is grouped into pools (header rows in the content list), each with a
// name and an optional discovery gate; a value-tiers line is budgeted at its Success tier
// (best case); all pools count; everything persists.
test('treasure pools: pool headers group loot, a gated pool, value tiers, persist', async ({ page, baseURL }) => {
  const apiErrors = trackApiErrors(page)
  await login(page, baseURL)
  await openFirstCampaign(page)

  const name = `Pools ${Date.now()}`
  await createEncounter(page, name)

  // Pools are header rows in the one content list; treasure lines below a header
  // belong to it. Main pool, then a custom item with a Success-tier value (40 gp).
  await addContent(page, 'Treasure pool')
  const pools = page.locator('.content-pool')
  await expect(pools).toHaveCount(1)
  await pools.first().getByLabel('pool name').fill('Main')
  await addContent(page, 'Treasure')
  const lines = page.getByTestId('custom-treasure')
  await page.getByRole('button', { name: '+ custom item' }).last().click()
  await lines.first().getByLabel('custom item name').fill('harvested gear')
  await page.getByRole('checkbox', { name: 'variable value' }).check()
  await page.getByLabel('success (gp)', { exact: true }).fill('40') // exact: not "crit success (gp)"
  await openBudget(page)
  await expect(page.getByTestId('treasure-value')).toHaveText('40 gp') // budgets the Success tier

  // A second, gated pool with a plain 10 gp item — every pool counts in the budget.
  await addContent(page, 'Treasure pool')
  await expect(pools).toHaveCount(2)
  const altar = pools.nth(1)
  await altar.getByLabel('pool name').fill('Altar')
  await altar.getByLabel('pool gate skill').fill('Perception')
  await altar.getByLabel('pool gate DC').fill('18')
  await addContent(page, 'Treasure')
  await page.getByRole('button', { name: '+ custom item' }).last().click()
  await lines.nth(1).getByLabel('custom item name').fill('scroll')
  await lines.nth(1).getByLabel('value (gp)').fill('10')
  await expect(page.getByTestId('treasure-value')).toHaveText('50 gp') // 40 (Success) + 10
  await expect(page.getByTestId('save-state')).toHaveText('Saved')

  // Persist across reload: pools, names, gate, tiers, and the total.
  await page.reload()
  await expect(page.getByTestId('chapter-tree')).toBeVisible()
  await openEncounter(page, name)
  const pools2 = page.locator('.content-pool')
  await expect(pools2).toHaveCount(2)
  await expect(pools2.first().getByLabel('pool name')).toHaveValue('Main')
  await expect(pools2.nth(1).getByLabel('pool name')).toHaveValue('Altar')
  await expect(pools2.nth(1).getByLabel('pool gate skill')).toHaveValue('Perception')
  await expect(pools2.nth(1).getByLabel('pool gate DC')).toHaveValue('18')
  await expect(page.getByTestId('custom-treasure')).toHaveCount(2)
  await openBudget(page)
  await expect(page.getByTestId('treasure-value')).toHaveText('50 gp')

  await page.getByRole('button', { name: /^Close/ }).click()
  await deleteEncounter(page, name)
  expect(apiErrors, 'no API request should return 4xx/5xx').toEqual([])
})

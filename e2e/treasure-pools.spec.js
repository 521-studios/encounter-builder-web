import { test, expect } from '@playwright/test'
import { login, trackApiErrors, openFirstCampaign, createEncounter, deleteEncounter } from './helpers/login.js'

// iuha: treasure is grouped into pools (a default pool + "+ pool"), each with a name
// and an optional discovery gate; a value-tiers line is budgeted at its Success tier
// (best case); all pools count; everything persists.
test('treasure pools: default + added gated pool, value tiers, best-case budget, persist', async ({ page, baseURL }) => {
  const apiErrors = trackApiErrors(page)
  await login(page, baseURL)
  await openFirstCampaign(page)

  const name = `Pools ${Date.now()}`
  await createEncounter(page, name)

  // "+ treasure" materializes the default pool.
  await page.getByRole('button', { name: '+ treasure' }).click()
  const pools = page.getByTestId('treasure-pool')
  await expect(pools).toHaveCount(1)
  const main = pools.first()
  await main.getByLabel('pool name').fill('Main')

  // A custom item in the default pool with a Success-tier variable value (40 gp).
  await main.getByRole('button', { name: '+ custom item' }).click()
  await main.getByLabel('custom item name').fill('harvested gear')
  await main.getByRole('checkbox', { name: 'variable value' }).check()
  await main.getByLabel('success (gp)', { exact: true }).fill('40') // exact: not "crit success (gp)"
  await expect(page.getByTestId('treasure-value')).toHaveText('40 gp') // budgets the Success tier

  // "+ pool" adds a second, gated pool.
  await page.getByRole('button', { name: '+ pool' }).click()
  await expect(pools).toHaveCount(2)
  const altar = pools.nth(1)
  await altar.getByLabel('pool name').fill('Altar')
  await altar.getByRole('checkbox', { name: /gated/ }).check()
  await altar.getByLabel('gate skill').fill('Perception')
  await altar.getByLabel('gate DC').fill('18')

  // A plain 10 gp custom item in the altar pool — every pool counts in the budget.
  await altar.getByRole('button', { name: '+ treasure' }).click() // add a line to this pool first
  await altar.getByRole('button', { name: '+ custom item' }).click()
  await altar.getByLabel('custom item name').fill('scroll')
  await altar.getByLabel('value (gp)').fill('10')
  await expect(page.getByTestId('treasure-value')).toHaveText('50 gp') // 40 (Success) + 10

  await expect(page.getByTestId('save-state')).toHaveText('Saved')

  // Persist across reload: pools, names, gate, tiers, and the total.
  await page.reload()
  await expect(page.getByTestId('chapter-tree')).toBeVisible()
  await page.locator('button.encounter', { hasText: name }).click()
  const pools2 = page.getByTestId('treasure-pool')
  await expect(pools2).toHaveCount(2)
  await expect(pools2.first().getByLabel('pool name')).toHaveValue('Main')
  const altar2 = pools2.nth(1)
  await expect(altar2.getByLabel('pool name')).toHaveValue('Altar')
  await expect(altar2.getByLabel('gate skill')).toHaveValue('Perception')
  await expect(altar2.getByLabel('gate DC')).toHaveValue('18')
  await expect(page.getByTestId('treasure-value')).toHaveText('50 gp')

  // Removing a pool reassigns its loot INTO the remaining pool — the scroll must
  // now render under Main (a broken reassignment would leave it with a dead pool_id
  // and vanish from every rendered pool). The total staying 50 gp alone wouldn't
  // catch that (the budget sums all lines regardless of pool), so assert it renders.
  await altar2.getByRole('button', { name: 'remove pool' }).click()
  await expect(pools2).toHaveCount(1)
  await expect(pools2.first().getByLabel('custom item name')).toHaveCount(2) // gear + scroll, both under Main
  await expect(page.getByTestId('treasure-value')).toHaveText('50 gp')

  await page.getByRole('button', { name: /^Close/ }).click()
  await deleteEncounter(page, name)
  expect(apiErrors, 'no API request should return 4xx/5xx').toEqual([])
})

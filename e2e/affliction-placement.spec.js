import { test, expect } from '@playwright/test'
import { login, trackApiErrors, openFirstCampaign, createEncounter, deleteEncounter, addContent, openEncounter } from './helpers/login.js'

// Placing an affliction in an encounter (bd_521Studios-8q91): a SEPARATE "+ affliction"
// search over curses + diseases (not the monster or hazard search), its own slot with a
// "Curse N" / "Disease N" header + stat block, counted toward the encounter's difficulty,
// and persisted + re-derived on reload. Mirrors the hazard slot (cid5) — an affliction is
// a flat-doc entity, not a creature, so it gets AfflictionStatBlock.
test('add an affliction: separate search, Disease header + stat block, persists', async ({ page, baseURL }) => {
  const apiErrors = trackApiErrors(page)
  await login(page, baseURL)
  await openFirstCampaign(page)

  const name = `Affliction ${Date.now()}`
  await createEncounter(page, name)

  // The "+ affliction" affordance is separate from "+ monster" and "+ hazard".
  await addContent(page, 'Affliction')
  await page.locator('.affliction-search [data-testid="creature-search"]').first().fill('blueblisters')
  const result = page.locator('.affliction-search [data-testid="search-result"]', { hasText: 'Blueblisters' }).first()
  await expect(result).toBeVisible()
  await result.click()

  const line = page.locator('.creature-card', { has: page.getByTestId('affliction-header') })
  await expect(line.getByTestId('affliction-header-level')).toContainText('Disease')
  // Open the affliction stat block (rendered via the library AfflictionStatBlock).
  await line.getByRole('button', { name: /^show stat block for/ }).click()
  await expect(line.locator('[data-testid="affliction-stat-block"]')).toBeVisible()

  // Autosave persists the affliction; reload and confirm it re-derives.
  await expect(page.getByTestId('save-state')).toHaveText('Saved')
  await page.reload()
  await expect(page.getByTestId('chapter-tree')).toBeVisible()
  await openEncounter(page, name)
  await expect(page.locator('.creature-card', { has: page.getByTestId('affliction-header') }).getByTestId('affliction-header-level')).toContainText('Disease')

  // Cleanup.
  await page.getByRole('button', { name: /^Close/ }).click()
  await deleteEncounter(page, name)

  expect(apiErrors, 'no API request should return 4xx/5xx').toEqual([])
})

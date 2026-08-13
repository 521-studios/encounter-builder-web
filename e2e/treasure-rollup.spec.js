import { test, expect } from '@playwright/test'
import { login, trackApiErrors } from './helpers/login.js'

// Slice 5: chapter + campaign treasure rollups. Build a chapter with two coin
// encounters and confirm both the chapter and campaign detail pages sum the loot
// and show a per-encounter breakdown.
test('chapter + campaign treasure rollups sum the encounters loot', async ({ page, baseURL }) => {
  const apiErrors = trackApiErrors(page)
  await login(page, baseURL)
  await page.locator('button.campaign').first().click()
  await expect(page.getByTestId('chapter-tree')).toBeVisible()

  const stamp = Date.now()
  const chapterName = `Rollup Ch ${stamp}`
  const encA = `Loot A ${stamp}`
  const encB = `Loot B ${stamp}`

  // Chapter with two encounters, each carrying some coin treasure.
  await page.getByTestId('add-chapter').locator('input').fill(chapterName)
  await page.getByTestId('add-chapter').locator('button').click()
  const group = page.locator('.chapter-group', { has: page.locator('.chapter-name', { hasText: chapterName }) })
  await expect(group).toBeVisible()

  for (const [name, gp] of [[encA, '30'], [encB, '20']]) {
    await group.locator('.new-encounter input').fill(name)
    await group.locator('.new-encounter button').click()
    await expect(page.locator('.editor')).toBeVisible()
    await page.locator('.editor .coins').getByLabel('gp', { exact: true }).fill(gp)
    await expect(page.getByTestId('save-state')).toHaveText('Saved')
    await page.getByRole('button', { name: /^Close/ }).click()
  }

  // Chapter rollup: 30 + 20 = 50 gp total across the two encounters. The rollup
  // fetches on demand, so expand it first.
  await page.getByRole('button', { name: `Chapter settings ${chapterName}` }).click()
  await page.getByTestId('chapter-detail').getByRole('button', { name: /Show chapter treasure/ }).click()
  const chapterRollup = page.getByTestId('chapter-detail').getByTestId('treasure-rollup')
  await expect(chapterRollup).toBeVisible()
  await expect(chapterRollup.getByTestId('rollup-total')).toHaveText('50 gp')
  await expect(chapterRollup.locator('.rollup-table tbody tr')).toHaveCount(2)
  await page.getByRole('button', { name: /^Close/ }).click()

  // Campaign rollup includes these two (≥ 50 gp), with a reference figure.
  await page.getByTestId('campaign-settings').click()
  await page.getByTestId('campaign-detail').getByRole('button', { name: /Show campaign treasure/ }).click()
  const campaignRollup = page.getByTestId('campaign-detail').getByTestId('treasure-rollup')
  await expect(campaignRollup).toBeVisible()
  await expect(campaignRollup.getByTestId('rollup-total')).toContainText('gp')
  await expect(campaignRollup.getByText(/a full level.s treasure is/)).toBeVisible()
  await page.getByRole('button', { name: /^Close/ }).click()

  // Cleanup.
  for (const name of [encA, encB]) {
    const row = page.locator('li', { has: page.locator('button.encounter', { hasText: name }) })
    await row.getByRole('button', { name: `Delete ${name}` }).click()
    await expect(row).toHaveCount(0)
  }
  page.once('dialog', (d) => d.accept())
  await group.getByRole('button', { name: `Delete chapter ${chapterName}` }).click()
  await expect(group).toHaveCount(0)

  // The campaign rollup fetches every encounter's entries, incl. pre-existing
  // ones with stale content refs that 404 — the rollup handles those gracefully
  // (flagged, treated as a floor). So ignore pfsrd2 entry 404s (content-not-found
  // is not our API failing) but still fail on any /api/app or other 4xx/5xx.
  const realErrors = apiErrors.filter((e) => !/^404 GET .*\/api\/pfsrd2\/entries\/.*\/full$/.test(e))
  expect(realErrors, 'no app API request should return 4xx/5xx').toEqual([])
})

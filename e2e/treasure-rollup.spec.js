import { test, expect } from '@playwright/test'
import { login, trackApiErrors, openFirstCampaign, createChapter, createEncounter, deleteEncounter, deleteChapter } from './helpers/login.js'

// Chapter + campaign treasure rollups (always visible, collapse-by-title). Build a
// chapter with two coin encounters and confirm the chapter detail sums the loot per
// encounter, and the campaign summary rolls up BY CHAPTER (one row per chapter).
test('chapter treasure + campaign-by-chapter summary sum the encounters loot', async ({ page, baseURL }) => {
  const apiErrors = trackApiErrors(page)
  await login(page, baseURL)
  await openFirstCampaign(page)

  const stamp = Date.now()
  const chapterName = `Rollup Ch ${stamp}`
  const encA = `Loot A ${stamp}`
  const encB = `Loot B ${stamp}`

  // Chapter with two encounters, each carrying some coin treasure.
  await createChapter(page, chapterName)
  const group = page.locator('.chapter-group', { has: page.locator('.chapter-name', { hasText: chapterName }) })
  await expect(group).toBeVisible()

  for (const [name, gp] of [[encA, '30'], [encB, '20']]) {
    await createEncounter(page, name, group)
    await page.locator('.editor .coins').getByLabel('gp', { exact: true }).fill(gp)
    await expect(page.getByTestId('save-state')).toHaveText('Saved')
    await page.getByRole('button', { name: /^Close/ }).click()
    await expect(group.locator('button.encounter', { hasText: name })).toBeVisible()
  }

  // Chapter rollup: 30 + 20 = 50 gp total across the two encounters, one row each.
  // It's always visible now (no Show toggle).
  await page.getByRole('button', { name: `Open chapter ${chapterName}` }).click()
  const chapterRollup = page.getByTestId('chapter-detail').getByTestId('treasure-rollup')
  await expect(chapterRollup).toBeVisible()
  await expect(chapterRollup.getByTestId('rollup-total')).toHaveText('50 gp')
  await expect(chapterRollup.locator('.rollup-table tbody tr')).toHaveCount(2) // per-encounter
  // Collapse-by-title: clicking the title hides the body; clicking again restores it.
  await chapterRollup.getByRole('button', { name: /Chapter treasure/ }).click()
  await expect(chapterRollup.getByTestId('rollup-total')).toHaveCount(0)
  await chapterRollup.getByRole('button', { name: /Chapter treasure/ }).click()
  await expect(chapterRollup.getByTestId('rollup-total')).toBeVisible()
  await page.getByRole('button', { name: /^Close/ }).click()

  // Campaign summary rolls up BY CHAPTER: our chapter is one row summing its 50 gp
  // (not the individual encounters), with a reference figure.
  await page.getByTestId('campaign-settings').click()
  const campaignRollup = page.getByTestId('campaign-detail').getByTestId('treasure-rollup')
  await expect(campaignRollup).toBeVisible()
  await expect(campaignRollup.getByRole('row', { name: new RegExp(chapterName) })).toContainText('50 gp')
  await expect(campaignRollup.getByText(/a full level.s treasure is/)).toBeVisible()
  await page.getByRole('button', { name: /^Close/ }).click()

  // Cleanup.
  for (const name of [encA, encB]) {
    await deleteEncounter(page, name)
  }
  await deleteChapter(page, chapterName)
  await expect(group).toHaveCount(0)

  // The campaign rollup fetches every encounter's entries, incl. pre-existing
  // ones with stale content refs that 404 — the rollup handles those gracefully
  // (flagged, treated as a floor). So ignore pfsrd2 entry 404s (content-not-found
  // is not our API failing) but still fail on any /api/app or other 4xx/5xx.
  const realErrors = apiErrors.filter((e) => !/^404 GET .*\/api\/pfsrd2\/entries\/.*\/full$/.test(e))
  expect(realErrors, 'no app API request should return 4xx/5xx').toEqual([])
})

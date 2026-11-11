import { test, expect } from '@playwright/test'
import { login, trackApiErrors, openFirstCampaign, createEncounter, addContent, openEncounter, removeRow } from './helpers/login.js'

// vz1j: structured skill-check / discovery entries (skill + DC + effect). Persist
// across reload. An incomplete row (no DC) persists too (rvd4: completeness gates
// release, not save), so in-progress work is never lost.
test('skill checks: add a structured DC entry, it persists; an incomplete row persists too', async ({ page, baseURL }) => {
  const apiErrors = trackApiErrors(page)
  await login(page, baseURL)
  await openFirstCampaign(page)

  const name = `Checks ${Date.now()}`
  await createEncounter(page, name)

  await addContent(page, 'Skill check')
  const check = page.getByTestId('skill-check')
  await expect(check).toHaveCount(1)
  await check.getByLabel('check skill').fill('Perception')
  await check.getByLabel('check DC').fill('12')
  await check.getByLabel('check effect').fill('# spot the loose planks')

  // A second, incomplete row (skill but no DC) still saves.
  await addContent(page, 'Skill check')
  await page.getByTestId('skill-check').nth(1).getByLabel('check skill').fill('Nature')
  await expect(page.getByTestId('save-state')).toHaveText('Saved')

  // Persist across reload: both rows survive, the incomplete one as entered.
  await page.reload()
  await expect(page.getByTestId('chapter-tree')).toBeVisible()
  await openEncounter(page, name)
  const checks2 = page.getByTestId('skill-check')
  await expect(checks2).toHaveCount(2)
  await expect(checks2.first().getByLabel('check skill')).toHaveValue('Perception')
  await expect(checks2.first().getByLabel('check DC')).toHaveValue('12')
  await expect(checks2.nth(1).getByLabel('check skill')).toHaveValue('Nature')

  // Removing them clears the entries.
  await removeRow(page, checks2.first())
  await expect(checks2).toHaveCount(1)
  await removeRow(page, checks2.first())
  await expect(page.getByTestId('skill-check')).toHaveCount(0)
  await expect(page.getByTestId('save-state')).toHaveText('Saved')

  expect(apiErrors).toEqual([])
})

import { test, expect } from '@playwright/test'
import { login, trackApiErrors, openFirstCampaign, createEncounter } from './helpers/login.js'

// 3qq7: room exits / connectivity graph. An exit links to another encounter (soft
// reference) or names an external destination. Persist across reload; fully-empty
// rows are dropped.
test('exits: link to a sibling encounter + an external exit, persist', async ({ page, baseURL }) => {
  const apiErrors = trackApiErrors(page)
  await login(page, baseURL)
  await openFirstCampaign(page)

  const ts = Date.now()
  const roomB = `Room B ${ts}`
  const roomA = `Room A ${ts}`
  await createEncounter(page, roomB) // the exit target
  await createEncounter(page, roomA) // open A, link it to B

  // Internal exit → Room B.
  await page.getByRole('button', { name: '+ exit' }).click()
  const exit = page.getByTestId('exit')
  await expect(exit).toHaveCount(1)
  await exit.getByLabel('exit target').selectOption({ label: roomB })
  await exit.getByLabel('exit label').fill('north door')

  // External exit (no target, just a label).
  await page.getByRole('button', { name: '+ exit' }).click()
  await page.getByTestId('exit').nth(1).getByLabel('exit label').fill('Exterior')
  await expect(page.getByTestId('save-state')).toHaveText('Saved')

  // Persist across reload: both exits survive; the internal one still points at B.
  await page.reload()
  await expect(page.getByTestId('chapter-tree')).toBeVisible()
  await page.locator('button.encounter', { hasText: roomA }).click()
  const exits2 = page.getByTestId('exit')
  await expect(exits2).toHaveCount(2)
  await expect(exits2.first().locator('.exit-target option:checked')).toHaveText(roomB)
  await expect(exits2.first().getByLabel('exit label')).toHaveValue('north door')
  await expect(exits2.nth(1).getByLabel('exit label')).toHaveValue('Exterior')

  // Removing the internal exit leaves only the external one.
  await exits2.first().getByRole('button', { name: 'remove' }).click()
  await expect(page.getByTestId('exit')).toHaveCount(1)
  await expect(page.getByTestId('save-state')).toHaveText('Saved')

  expect(apiErrors).toEqual([])
})

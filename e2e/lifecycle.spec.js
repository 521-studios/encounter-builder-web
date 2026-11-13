import { test, expect } from '@playwright/test'
import { login, trackApiErrors, openFirstCampaign, createEncounter, deleteEncounter, addContent, openEncounter } from './helpers/login.js'

// we5k.2.1: encounter lifecycle. A non-combat room goes prepared → complete (no
// executing), close-out notes persist on change, and the chapter rollup counts it.
// A combat room offers executing.
test('lifecycle: prepared → complete with close-out notes; executing only for combat', async ({ page, baseURL }) => {
  const apiErrors = trackApiErrors(page)
  await login(page, baseURL)
  await openFirstCampaign(page)

  const name = `Lifecycle ${Date.now()}`
  await createEncounter(page, name)
  try {
    const status = page.getByTestId('encounter-status')
    await expect(status).toHaveValue('prepared')
    // No monsters yet → non-combat: no executing step.
    await expect(status.locator('option[value="executing"]')).toHaveCount(0)

    // Close it out with notes; both persist on change (no Save button).
    await status.selectOption('complete')
    await page.getByLabel('close-out notes').fill('Party talked their way past.')
    await expect(page.getByTestId('save-state')).toHaveText('Saved')

    // The sidebar row and the Unsorted rollup reflect it (rollup visible even collapsed).
    const row = page.locator('button.encounter', { hasText: name })
    await expect(row.locator('.status')).toHaveText('complete')
    const unsorted = page.locator('[data-testid="chapter-group"][data-chapter-id=""]')
    await expect(unsorted.getByTestId('chapter-rollup')).toContainText('complete')
    await expect(unsorted.getByTestId('chapter-rollup')).toContainText(/\d+\/\d+ done/)

    // Survives a reload.
    await page.reload()
    await expect(page.getByTestId('chapter-tree')).toBeVisible()
    await openEncounter(page, name)
    await expect(page.getByTestId('encounter-status')).toHaveValue('complete')
    await expect(page.getByLabel('close-out notes')).toHaveValue('Party talked their way past.')

    // Skipped also closes it out: the notes stay visible.
    await page.getByTestId('encounter-status').selectOption('skipped')
    await expect(page.getByLabel('close-out notes')).toBeVisible()
    await expect(page.getByTestId('save-state')).toHaveText('Saved')
    await expect(row.locator('.status')).toHaveText('skipped')

    // A combat room (a monster added) offers executing.
    await page.getByTestId('encounter-status').selectOption('prepared')
    await addContent(page, 'Monster')
    await page.locator('.monster-search [data-testid="creature-search"]').first().fill('goblin warrior')
    const goblin = page.locator('.monster-search [data-testid="search-result"][data-name="Goblin Warrior"]')
    await expect(goblin).toBeVisible()
    await goblin.click()
    await page.getByTestId('encounter-status').selectOption('executing')
    await expect(page.getByTestId('save-state')).toHaveText('Saved')
    await expect(row.locator('.status')).toHaveText('executing')
  } finally {
    await page.getByRole('button', { name: /^Close/ }).click().catch(() => {})
    await deleteEncounter(page, name)
  }

  expect(apiErrors, 'no API request should return 4xx/5xx').toEqual([])
})

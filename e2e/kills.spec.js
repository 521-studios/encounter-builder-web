import { test, expect } from './helpers/fixtures.js'
import { login, trackApiErrors, openFirstCampaign, createEncounter, deleteEncounter, addContent, openEncounter } from './helpers/login.js'

// we5k.2.4: once an encounter is past prepared, the GM marks individual creatures
// killed. Kills persist apart from the autosaved encounter body, so a later edit
// doesn't clear them.
test('kills: mark a creature killed, edit, reload, still killed', async ({ page, baseURL }) => {
  const apiErrors = trackApiErrors(page)
  await login(page, baseURL)
  await openFirstCampaign(page)

  const name = `Kills ${Date.now()}`
  await createEncounter(page, name)
  try {
    await addContent(page, 'Monster')
    await page.locator('.monster-search [data-testid="creature-search"]').first().fill('goblin warrior')
    const goblin = page.locator('.monster-search [data-testid="search-result"][data-name="Goblin Warrior"]')
    await expect(goblin).toBeVisible()
    await goblin.click()
    await expect(page.getByTestId('monster-header')).toBeVisible()

    // Prepared: nothing to mark yet.
    await expect(page.getByTestId('monster-kills')).toHaveCount(0)
    await page.getByTestId('encounter-status').selectOption('executing')
    const killed = page.getByLabel('Goblin Warrior killed', { exact: true })
    const posted = page.waitForResponse((r) => r.url().endsWith('/kills') && r.request().method() === 'POST')
    await killed.check()
    expect((await posted).status(), 'POST /kills').toBe(200)
    await expect(killed).toBeChecked()

    // An autosaved edit after the kill must not clear it.
    await page.getByTestId('encounter-status').selectOption('complete')
    await expect(page.getByTestId('save-state')).toHaveText('Saved')

    await page.reload()
    await expect(page.getByTestId('chapter-tree')).toBeVisible()
    await openEncounter(page, name)
    await expect(page.getByLabel('Goblin Warrior killed', { exact: true })).toBeChecked()
  } finally {
    await page.getByRole('button', { name: /^Close/ }).click().catch(() => {})
    await deleteEncounter(page, name)
  }

  expect(apiErrors, 'no API request should return 4xx/5xx').toEqual([])
})

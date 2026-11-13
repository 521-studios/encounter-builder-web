import { test, expect } from './helpers/fixtures.js'
import { login, trackApiErrors, openFirstCampaign, createEncounter, deleteEncounter, addContent, openEncounter } from './helpers/login.js'

// 77l2: each creature is a treasure source. A gear line names the creature
// carrying it; at close-out its gear stays behind until that creature is killed.
test('gear from a creature moves only once it is killed', async ({ page, baseURL }) => {
  const apiErrors = trackApiErrors(page)
  await login(page, baseURL)
  await openFirstCampaign(page)

  const name = `Gear ${Date.now()}`
  await createEncounter(page, name)
  try {
    await addContent(page, 'Monster')
    await page.locator('.monster-search [data-testid="creature-search"]').first().fill('goblin warrior')
    const goblin = page.locator('.monster-search [data-testid="search-result"][data-name="Goblin Warrior"]')
    await expect(goblin).toBeVisible()
    await goblin.click()
    await expect(page.getByTestId('monster-header')).toBeVisible()

    await addContent(page, 'Treasure')
    await page.locator('.item-search [data-testid="item-search"]').first().fill('dagger')
    const result = page.locator('.item-search [data-testid="item-search-result"]').first()
    await expect(result).toBeVisible()
    await result.click()
    const itemName = (await page.locator('.treasure-line-wrap .itemcard .Monster__name').innerText()).trim()
    await page.getByLabel('from', { exact: true }).selectOption({ label: 'from: Goblin Warrior' })

    await page.getByTestId('encounter-status').selectOption('complete')
    const pkg = page.getByTestId('treasure-package')
    await expect(pkg.getByLabel(`${itemName} moving`)).toHaveValue('0')
    await expect(pkg.getByTestId('package-not-killed')).toContainText('Goblin Warrior not killed')
    await expect(pkg.getByTestId('package-todo')).toHaveCount(0) // the default needs no note

    const posted = page.waitForResponse((r) => r.url().endsWith('/kills') && r.request().method() === 'POST')
    await page.getByLabel('Goblin Warrior killed', { exact: true }).check()
    expect((await posted).status(), 'POST /kills').toBe(200)
    await expect(pkg.getByLabel(`${itemName} moving`)).toHaveValue('1')
    await expect(pkg.getByTestId('package-not-killed')).toHaveCount(0)
    await expect(page.getByTestId('save-state')).toHaveText('Saved')

    // The source survives a reload.
    await page.reload()
    await expect(page.getByTestId('chapter-tree')).toBeVisible()
    await openEncounter(page, name)
    await expect(page.getByLabel('from', { exact: true })).toHaveValue(/:1$/)
    await expect(page.getByTestId('treasure-package').getByLabel(`${itemName} moving`)).toHaveValue('1')
  } finally {
    await page.getByRole('button', { name: /^Close/ }).click().catch(() => {})
    await deleteEncounter(page, name)
  }

  expect(apiErrors, 'no API request should return 4xx/5xx').toEqual([])
})

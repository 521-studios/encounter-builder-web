import { test, expect } from './helpers/fixtures.js'
import { login, trackApiErrors, openFirstCampaign, createEncounter, deleteEncounter, addContent, openEncounter } from './helpers/login.js'

// we5k.2.5: the close-out treasure package. Part of a line stays behind (with a
// reason + note), a coin drop is excluded, the package persists, and the
// release receipt counts only what moved.
test('treasure package: partial qty + excluded coin, then release', async ({ page, baseURL }) => {
  const apiErrors = trackApiErrors(page)
  await login(page, baseURL)
  await openFirstCampaign(page)

  const name = `Package ${Date.now()}`
  await createEncounter(page, name)
  try {
    await addContent(page, 'Treasure')
    await page.locator('.item-search [data-testid="item-search"]').first().fill('dagger')
    const result = page.locator('.item-search [data-testid="item-search-result"]').first()
    await expect(result).toBeVisible()
    await result.click()
    const itemName = (await page.locator('.treasure-line-wrap .itemcard .Monster__name').innerText()).trim()
    await page.getByLabel('qty', { exact: true }).fill('3')
    await addContent(page, 'Coin')
    await page.locator('.content-coin').getByLabel('gp', { exact: true }).fill('7')

    // No package (or Release) until it's closed out.
    await expect(page.getByTestId('treasure-package')).toHaveCount(0)
    await page.getByTestId('encounter-status').selectOption('complete')
    const pkg = page.getByTestId('treasure-package')
    await expect(pkg).toBeVisible()
    const release = pkg.getByRole('button', { name: 'Release to party' })

    // 2 of 3 move: Release waits on a reason + note for the third.
    await pkg.getByLabel(`${itemName} moving`).fill('2')
    await expect(pkg.getByTestId('package-todo')).toBeVisible()
    await expect(release).toBeDisabled()
    await pkg.getByLabel(`${itemName} reason`).selectOption('destroyed')
    await pkg.getByLabel(`${itemName} note`).fill('snapped on the portcullis')

    // Exclude the coin: it needs a note too, and the totals move.
    await pkg.getByLabel('7 gp moving').uncheck()
    await expect(release).toBeDisabled()
    await pkg.getByLabel('7 gp note').fill('paid the ferryman')
    await expect(pkg.getByTestId('package-coins')).toHaveText(/0 gp moving · 7 gp excluded/)
    await expect(release).toBeEnabled()
    await expect(page.getByTestId('save-state')).toHaveText('Saved')

    // The package survives a reload.
    await page.reload()
    await expect(page.getByTestId('chapter-tree')).toBeVisible()
    await openEncounter(page, name)
    await expect(pkg.getByLabel(`${itemName} moving`)).toHaveValue('2')
    await expect(pkg.getByLabel(`${itemName} note`)).toHaveValue('snapped on the portcullis')
    await expect(pkg.getByLabel('7 gp moving')).not.toBeChecked()

    page.once('dialog', (d) => d.accept())
    await release.click()
    await expect(page.getByTestId('release-receipt')).toHaveText(/Sent to the party pool/) // exact payload: API's TestReleasePayload_CloseOutExclusions
  } finally {
    await page.getByRole('button', { name: /^Close/ }).click().catch(() => {})
    await deleteEncounter(page, name)
  }

  expect(apiErrors, 'no API request should return 4xx/5xx').toEqual([])
})

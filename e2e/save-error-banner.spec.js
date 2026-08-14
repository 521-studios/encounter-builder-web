import { test, expect } from '@playwright/test'
import { login, openFirstCampaign, createEncounter, deleteEncounter } from './helpers/login.js'

// e9aj: a background autosave that fails AFTER the editor closes (the flush-on-leave
// PUT) has no on-screen "Save failed" indicator left — it unmounted with the editor.
// So it must surface durably as an app-level banner.
test('a background save that fails after the editor closes surfaces an app-level banner', async ({ page, baseURL }) => {
  await login(page, baseURL)
  await openFirstCampaign(page)

  const name = `SaveErr ${Date.now()}`
  await createEncounter(page, name) // the rename PUT succeeds (route not installed yet)

  // From here every encounter PUT fails — the flush-on-leave save will reject.
  await page.route('**/api/app/campaigns/*/encounters/*', (route) =>
    route.request().method() === 'PUT'
      ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' })
      : route.continue(),
  )

  // Make a pending edit, then close — the flush-on-leave fires the PUT, which fails
  // once the editor (and its indicator) is already gone.
  await page.locator('.description-input').fill('a doomed edit')
  await page.getByRole('button', { name: /^Close/ }).click()

  const banner = page.getByTestId('save-error-banner')
  await expect(banner).toBeVisible()
  await expect(banner).toContainText(name) // it names the record that failed to save
  await banner.getByRole('button', { name: /Dismiss/ }).click()
  await expect(banner).toHaveCount(0)

  // Cleanup — stop failing PUTs first (delete uses DELETE, not PUT).
  await page.unroute('**/api/app/campaigns/*/encounters/*')
  await deleteEncounter(page, name)
})

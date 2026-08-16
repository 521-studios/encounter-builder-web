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

// 3kni: the app banner is keyed by record id. (1) A failed autosave while the editor
// is still mounted now also surfaces the app banner (the mounted-catch routes to
// onSaveError — closes the mid-flight-at-Close swallow). (2) When the SAME record then
// saves successfully, the banner auto-clears without a manual Dismiss — because it's
// id-keyed, a different record saving can't wrongly wipe it.
test('the app banner auto-clears when the same record saves successfully (id-keyed recovery)', async ({ page, baseURL }) => {
  await login(page, baseURL)
  await openFirstCampaign(page)

  const name = `SaveRec ${Date.now()}`
  await createEncounter(page, name)

  // Fail encounter PUTs while `failing` is true (toggled from Node — the route
  // handler runs in Node, so the closure var is live).
  let failing = true
  await page.route('**/api/app/campaigns/*/encounters/*', (route) =>
    route.request().method() === 'PUT' && failing
      ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' })
      : route.continue(),
  )

  // An edit → autosave fails while the editor is still open → the app banner appears
  // (part 1: the mounted autosave catch now routes to onSaveError).
  await page.locator('.description-input').fill('a doomed edit')
  const banner = page.getByTestId('save-error-banner')
  await expect(banner).toBeVisible()
  await expect(banner).toContainText(name)

  // Stop failing; a further edit saves successfully → the banner auto-clears with NO
  // Dismiss click (part 2: same-record id-keyed clear).
  failing = false
  await page.locator('.description-input').fill('a recovered edit')
  await expect(page.getByTestId('save-state')).toHaveText('Saved')
  await expect(banner).toHaveCount(0)

  await page.unroute('**/api/app/campaigns/*/encounters/*')
  await deleteEncounter(page, name)
})

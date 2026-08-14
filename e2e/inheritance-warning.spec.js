import { test, expect } from '@playwright/test'
import { login, openFirstCampaign, createChapter, deleteChapter } from './helpers/login.js'

// fb4e: when the campaign settings fetch fails, a chapter's inherited party values
// can't be trusted — the detail must WARN (not silently fall back to the app
// default) and stay editable.
test('a chapter detail warns when inherited party values fail to load, and stays editable', async ({ page, baseURL }) => {
  await login(page, baseURL)
  await openFirstCampaign(page)

  const chapterName = `InheritWarn ${Date.now()}`
  await createChapter(page, chapterName) // creation reads settings fine (route not yet installed)

  // Now fail the campaign SETTINGS GET (leave PUT working, so edits still persist).
  await page.route('**/api/app/campaigns/*/settings', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ status: 500, contentType: 'application/json', body: '{}' })
      : route.continue(),
  )

  await page.getByRole('button', { name: `Open chapter ${chapterName}` }).click()
  const detail = page.getByTestId('chapter-detail')
  await expect(detail).toBeVisible()

  // The inheritance warning shows (settingsError → PartyFields inheritedError)…
  await expect(detail.locator('.party-inherit-error')).toBeVisible()
  await expect(detail.locator('.party-inherit-error')).toContainText(/inherited party values/)

  // …and the page stays editable — the chapter's own override still takes and persists.
  await detail.getByLabel('party level').fill('7')
  await expect(detail.getByTestId('chapter-saved')).toHaveText('Saved')

  await page.unroute('**/api/app/campaigns/*/settings')
  await detail.getByRole('button', { name: 'Close' }).click()
  await deleteChapter(page, chapterName)
})

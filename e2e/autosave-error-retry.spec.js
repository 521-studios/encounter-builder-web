import { test, expect } from '@playwright/test'
import { login, openFirstCampaign, createEncounter, deleteEncounter } from './helpers/login.js'

// 85qx: a MOUNTED autosave that fails shows the inline "Save failed" indicator +
// an error alert (and keeps the edit dirty), then the next edit retries and reaches
// "Saved". (The flush-on-leave/banner path is covered by save-error-banner.spec.)
test('a failed autosave shows "Save failed" and the next edit retries to "Saved"', async ({ page, baseURL }) => {
  await login(page, baseURL)
  await openFirstCampaign(page)

  const name = `AutosaveErr ${Date.now()}`
  await createEncounter(page, name) // the rename PUT succeeds

  // Fail exactly the NEXT encounter PUT, then let subsequent ones through.
  let failNext = true
  await page.route('**/api/app/campaigns/*/encounters/*', (route) => {
    if (route.request().method() === 'PUT' && failNext) {
      failNext = false
      return route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' })
    }
    return route.continue()
  })

  // Edit → the debounced autosave PUT fails while the editor is still open.
  await page.locator('.description-input').fill('first edit')
  await expect(page.getByTestId('save-state')).toHaveText('Save failed')
  await expect(page.locator('.editor .error[role="alert"]')).toBeVisible()

  // The next edit retries (the route now lets PUT through) → Saved.
  await page.locator('.description-input').fill('second edit')
  await expect(page.getByTestId('save-state')).toHaveText('Saved')
  await expect(page.locator('.editor .error[role="alert"]')).toHaveCount(0)

  await page.unroute('**/api/app/campaigns/*/encounters/*')
  await page.getByRole('button', { name: /^Close/ }).click()
  await deleteEncounter(page, name)
})

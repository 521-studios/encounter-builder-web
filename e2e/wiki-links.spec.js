import { test, expect } from '@playwright/test'
import { login, trackApiErrors, openFirstCampaign, createEncounter } from './helpers/login.js'

// w08f: a [[wiki-link]] in an encounter's markdown description resolves to another
// encounter and becomes a clickable link that opens it.
test('wiki-links: [[Name]] in a description links to and opens that encounter', async ({ page, baseURL }) => {
  const apiErrors = trackApiErrors(page)
  await login(page, baseURL)
  await openFirstCampaign(page)

  const ts = Date.now()
  const roomB = `Walkway ${ts}`
  const roomA = `Start ${ts}`
  await createEncounter(page, roomB) // link target
  await createEncounter(page, roomA) // opens A's editor

  // Author a wiki-link to B in A's description; it renders as a clickable link.
  await page.locator('.description-input').fill(`Cross to [[${roomB}]] to continue.`)
  await expect(page.getByTestId('save-state')).toHaveText('Saved')
  const link = page.getByTestId('description-preview').getByRole('link', { name: roomB })
  await expect(link).toBeVisible()

  // Clicking it opens Room B's editor.
  await link.click()
  await expect(page.locator('.editor')).toBeVisible()
  await expect(page.getByLabel('encounter name')).toHaveValue(roomB)

  expect(apiErrors).toEqual([])
})

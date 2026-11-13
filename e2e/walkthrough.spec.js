import { test, expect } from './helpers/fixtures.js'
import { login, trackApiErrors, createEncounter, deleteEncounter, addContent, openEncounter } from './helpers/login.js'

// The end-to-end acceptance loop: sign in → pick a campaign → build an encounter
// (monster search + stat block) → autosave → persist across reload → release.
// This is the spec form of the manual walkthrough that first validated the app.
test('GM builds and releases an encounter end-to-end', async ({ page, baseURL }) => {
  const apiErrors = trackApiErrors(page)

  await login(page, baseURL)

  const campaigns = page.locator('button.campaign')
  await expect(campaigns.first()).toBeVisible()
  await campaigns.first().click()
  await expect(page.locator('[data-testid="chapter-tree"]')).toBeVisible()

  // Create an (unsorted) encounter via the always-present bottom "+ encounter"
  // (creates an untitled encounter + opens the editor; we name it there).
  const name = `E2E ${Date.now()}`
  await createEncounter(page, name)

  // Add a monster via the library CreatureSearch and confirm the stat block renders.
  await addContent(page, 'Monster')
  await page.locator('.monster-search [data-testid="creature-search"]').first().fill('goblin')
  await expect(page.locator('.monster-search [data-testid="search-result"]').first()).toBeVisible()
  await page.locator('.monster-search [data-testid="search-result"]').first().click()
  await expect(page.getByTestId('monster-header')).toBeVisible()
  await page.getByRole('button', { name: /^show stat block for/ }).first().click()
  await expect(page.locator('.statblock')).toBeVisible()

  // Give it a markdown section and confirm the library Markdown renders it.
  await addContent(page, 'Markdown section')
  await page.locator('.description-input').fill('# The Vault\n\nA **giant** guards the door.')
  await page.locator('.text-block').getByRole('button', { name: 'Done' }).click()
  await expect(page.locator('.description-preview h1')).toHaveText('The Vault')
  await expect(page.locator('.description-preview strong')).toHaveText('giant')

  // Autosave — wait for the status indicator to reach "Saved" before reloading.
  // It flips to "Saved" only after the debounced PUT resolves with no pending
  // edits, so this guarantees the save landed (a reload here can't abort it) and
  // that it succeeded (a failed PUT shows "Save failed", not "Saved").
  await expect(page.getByTestId('save-state')).toHaveText('Saved')
  await expect(page.locator('.editor .error[role="alert"]')).toHaveCount(0)

  // Reload and re-open the encounter — confirm the *monster* persisted, not just
  // the name (a silently-failed save would still show the name in the list).
  await page.reload()
  await expect(page.getByTestId('chapter-tree')).toBeVisible() // reload restores the two-pane directly (no campaign picker)
  const encounterBtn = page.locator('button.encounter', { hasText: name })
  await expect(encounterBtn).toBeVisible()
  await openEncounter(page, name)
  // The markdown section persisted (rendered in preview).
  await expect(page.locator('.description-preview h1')).toHaveText('The Vault')
  await expect(page.getByTestId('monster-header')).toBeVisible()
  await page.getByRole('button', { name: /^show stat block for/ }).first().click()
  await expect(page.locator('.statblock')).toBeVisible()

  // Release → read-only.
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: /Release/ }).click()
  await expect(page.getByText(/Released/)).toBeVisible()

  expect(apiErrors, 'no API request should return 4xx/5xx').toEqual([])

  // Clean up so staging doesn't accumulate one encounter per run. (Left to the
  // end rather than afterEach: a failure earlier leaves one row, which is
  // acceptable on throwaway staging and keeps the failure's state inspectable.)
  await page.getByRole('button', { name: /^Close/ }).click()
  await deleteEncounter(page, name)
})

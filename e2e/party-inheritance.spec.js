import { test, expect } from '@playwright/test'
import { login, trackApiErrors, openFirstCampaign, createEncounter, deleteEncounter, deleteChapter } from './helpers/login.js'

// Slice 3: expected-party inheritance across campaign -> chapter -> encounter.
// Set a campaign default, override it on a chapter (seeing the inherited value),
// then override again on an encounter, and confirm each layer resolves + persists.
// Everything persists on change — no Save button anywhere.
test('party level/size inherits campaign -> chapter -> encounter with per-layer override', async ({ page, baseURL }) => {
  const apiErrors = trackApiErrors(page)
  await login(page, baseURL)
  await openFirstCampaign(page)

  const stamp = Date.now()
  const chapterName = `Party Ch ${stamp}`
  const encName = `Party Enc ${stamp}`

  // --- Campaign default: level 5, 4 PCs (persists on change) ---
  await page.getByTestId('campaign-settings').click()
  const campaignDetail = page.getByTestId('campaign-detail')
  await expect(campaignDetail).toBeVisible()
  await campaignDetail.getByLabel('party level').fill('5')
  await campaignDetail.getByLabel('party size').fill('4')
  await expect(page.getByTestId('settings-saved')).toHaveText('Saved')

  // --- Chapter: "+ chapter" creates + opens it; name it, see the inherited
  //     campaign values as placeholders, then override level to 8 ---
  await page.getByTestId('add-chapter').click()
  const chapterDetail = page.getByTestId('chapter-detail')
  await expect(chapterDetail).toBeVisible()
  await expect(chapterDetail.getByLabel('party level')).toHaveAttribute('placeholder', '5')
  await expect(chapterDetail.getByLabel('party size')).toHaveAttribute('placeholder', '4')
  await chapterDetail.getByLabel('chapter name').fill(chapterName)
  await chapterDetail.getByLabel('party level').fill('8')
  await expect(chapterDetail.getByTestId('chapter-saved')).toHaveText('Saved')
  await chapterDetail.getByRole('button', { name: 'Close' }).click()

  // --- Encounter in that chapter: inherits level 8 from chapter, then override to 10 ---
  const group = page.locator('.chapter-group', {
    has: page.locator('.chapter-name', { hasText: chapterName }),
  })
  await createEncounter(page, encName, group)
  const editorLevel = page.locator('.editor').getByLabel('party level')
  // Inherits the chapter's 8 (placeholder) and campaign's 4 for size.
  await expect(editorLevel).toHaveAttribute('placeholder', '8')
  await expect(page.locator('.editor').getByLabel('party size')).toHaveAttribute('placeholder', '4')
  await editorLevel.fill('10')
  await expect(page.getByTestId('save-state')).toHaveText('Saved') // autosave persisted

  // --- Persistence: reload, re-open the encounter, the override sticks ---
  await page.reload()
  await page.locator('button.campaign').first().click()
  await page.locator('button.encounter', { hasText: encName }).first().click()
  await expect(page.locator('.editor')).toBeVisible()
  await expect(page.locator('.editor').getByLabel('party level')).toHaveValue('10')
  await expect(page.locator('.editor').getByLabel('party size')).toHaveAttribute('placeholder', '4') // still inheriting

  // --- Clear-to-inherit, per layer, and confirm the resolved value reverts ---
  // Clear the encounter's own level override → it inherits the chapter's 8.
  const encLevel = page.locator('.editor').getByLabel('party level')
  await encLevel.fill('')
  await expect(page.getByTestId('save-state')).toHaveText('Saved')
  await expect(encLevel).toHaveValue('')
  await expect(encLevel).toHaveAttribute('placeholder', '8') // now inherits the chapter

  // Clear the CHAPTER's level override → the encounter's inherited level reverts
  // from 8 to the campaign's 5 (proves chapter clear-to-inherit via full-replace).
  await page.getByRole('button', { name: `Open chapter ${chapterName}` }).click()
  const chapterDetail2 = page.getByTestId('chapter-detail')
  await chapterDetail2.getByLabel('party level').fill('')
  await expect(chapterDetail2.getByTestId('chapter-saved')).toHaveText('Saved')
  await page.locator('button.encounter', { hasText: encName }).first().click()
  await expect(page.locator('.editor').getByLabel('party level')).toHaveAttribute('placeholder', '5')

  // --- Cleanup: delete the encounter + chapter, and clear the campaign default ---
  await page.getByRole('button', { name: /^Close/ }).click()
  await deleteEncounter(page, encName)
  await deleteChapter(page, chapterName)
  await expect(group).toHaveCount(0)

  // Clear the campaign default and confirm it reverts (reopen → fields empty).
  await page.getByTestId('campaign-settings').click()
  const detail2 = page.getByTestId('campaign-detail')
  await detail2.getByLabel('party level').fill('')
  await detail2.getByLabel('party size').fill('')
  await expect(page.getByTestId('settings-saved')).toHaveText('Saved')
  await detail2.getByRole('button', { name: 'Close' }).click()
  await page.getByTestId('campaign-settings').click()
  await expect(page.getByTestId('campaign-detail').getByLabel('party level')).toHaveValue('')

  expect(apiErrors, 'no API request should return 4xx/5xx').toEqual([])
})

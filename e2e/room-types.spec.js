import { test, expect } from '@playwright/test'
import { login, trackApiErrors, openFirstCampaign, createEncounter } from './helpers/login.js'

// ablm: room/area types. A non-combat room (knowledge/social/…) drops the meaningless
// combat difficulty band + Table 5-3 chart and shows its type instead; it carries
// non-treasure reward slots (information/ritual/ally/item). Everything persists.
test('room types: knowledge room suppresses the band, carries reward slots, persists', async ({ page, baseURL }) => {
  const apiErrors = trackApiErrors(page)
  await login(page, baseURL)
  await openFirstCampaign(page)

  const name = `Knowledge ${Date.now()}`
  await createEncounter(page, name)

  // Default is Combat → a difficulty band badge shows. Switch to Knowledge.
  await expect(page.getByTestId('encounter-threat')).toBeVisible()
  await page.getByLabel('room type').selectOption('knowledge')

  // The band is gone; the badge + budget now show the room type, and the Table 5-3
  // chart is hidden.
  await expect(page.getByTestId('difficulty-badge')).toHaveText('Knowledge')
  await expect(page.getByTestId('room-type')).toHaveText('Knowledge')
  await expect(page.getByTestId('encounter-threat')).toHaveCount(0)
  await expect(page.locator('.treasure-chart')).toHaveCount(0)

  // Add a reward slot: an item (the unique book), plus a blank-label row that must
  // be dropped on save.
  await page.getByRole('button', { name: '+ reward' }).click()
  const reward = page.getByTestId('reward')
  await expect(reward).toHaveCount(1)
  await reward.getByLabel('reward kind').selectOption('item')
  await reward.getByLabel('reward label').fill('The Whispering Reeds')
  await reward.getByLabel('reward description').fill('# a unique magic book')

  await page.getByRole('button', { name: '+ reward' }).click() // blank second row → dropped
  await expect(page.getByTestId('save-state')).toHaveText('Saved')

  // Persist across reload: room type + the one valued reward survive; blank one gone.
  await page.reload()
  await expect(page.getByTestId('chapter-tree')).toBeVisible()
  await page.locator('button.encounter', { hasText: name }).click()
  await expect(page.getByLabel('room type')).toHaveValue('knowledge')
  await expect(page.getByTestId('difficulty-badge')).toHaveText('Knowledge')
  const rewards2 = page.getByTestId('reward')
  await expect(rewards2).toHaveCount(1)
  await expect(rewards2.getByLabel('reward kind')).toHaveValue('item')
  await expect(rewards2.getByLabel('reward label')).toHaveValue('The Whispering Reeds')

  // Removing the reward clears it.
  await rewards2.getByRole('button', { name: 'remove' }).click()
  await expect(page.getByTestId('reward')).toHaveCount(0)
  await expect(page.getByTestId('save-state')).toHaveText('Saved')

  expect(apiErrors).toEqual([])
})

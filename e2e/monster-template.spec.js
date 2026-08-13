import { test, expect } from '@playwright/test'
import { login, trackApiErrors } from './helpers/login.js'

// Applying a pfsrd2 template to a monster via the library TemplatePicker:
// highlights the changed values, stores the derived ref, and — crucially —
// re-derives (reconstructs the stack) after a reload so the templated block +
// highlighting come back.
test('apply a template to a monster: highlights, persists, and re-derives on reload', async ({ page, baseURL }) => {
  const apiErrors = trackApiErrors(page)
  await login(page, baseURL)
  await page.locator('button.campaign').first().click()

  const name = `Tpl ${Date.now()}`
  await page.getByTestId('new-encounter').locator('input').fill(name)
  await page.getByTestId('new-encounter').locator('button').click()
  await expect(page.locator('.editor')).toBeVisible()

  // Add a monster and open its stat block (which hosts the TemplatePicker).
  await page.getByRole('button', { name: '+ monster' }).click()
  await page.locator('.monster-search [data-testid="creature-search"]').first().fill('goblin')
  await page.locator('.monster-search [data-testid="search-result"]').first().click()
  await page.getByRole('button', { name: 'stat block' }).first().click()
  const block = page.locator('.monster-view .statblock')
  await expect(block.locator('.Monster')).toBeVisible()
  await expect(block.locator('.Monster__changed')).toHaveCount(0) // nothing applied yet

  // Apply a template (wait for the picker's options to load first).
  const select = page.getByTestId('template-select')
  const realOptions = select.locator('option:not([disabled])')
  await expect(realOptions.first()).toBeAttached()
  const labels = await realOptions.allTextContents()
  const choice = labels.find((l) => /elite/i.test(l)) || labels[0]
  await select.selectOption({ label: choice })

  // Highlighting appears, and a template tag is shown.
  await expect(block.locator('.Monster__changed').first()).toBeVisible()
  await expect(page.getByTestId('template-tag')).toContainText(choice)

  // The library renders the applied template's OWN section (the app now passes
  // appliedTemplates; the gathering lives in the library).
  await expect(block.locator('.Monster__template-title').first()).toBeVisible()
  await expect(block.locator('.Monster__template-title').first()).toContainText('Template')

  // Autosave persists the applied template; wait for the indicator, then reload and re-open.
  await expect(page.getByTestId('save-state')).toHaveText('Saved')

  await page.reload()
  await page.locator('button.campaign').first().click()
  await page.locator('button.encounter', { hasText: name }).click()
  await page.getByRole('button', { name: 'stat block' }).first().click()
  const block2 = page.locator('.monster-view .statblock')
  await expect(block2.locator('.Monster__changed').first()).toBeVisible() // re-derived highlighting
  await expect(block2.locator('.Monster__template-title').first()).toBeVisible() // section re-derives too
  await expect(page.getByTestId('template-tag')).toContainText(choice)

  // Cleanup.
  await page.getByRole('button', { name: /^Close/ }).click()
  const row = page.locator('li', { has: page.locator('button.encounter', { hasText: name }) })
  await row.getByRole('button', { name: `Delete ${name}` }).click()
  await expect(row).toHaveCount(0)

  expect(apiErrors, 'no API request should return 4xx/5xx').toEqual([])
})

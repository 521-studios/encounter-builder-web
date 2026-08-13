import { expect } from '@playwright/test'

// Staging test GM. NON-SECRET per Devon ("the staging creds aren't a secret") —
// staging-only, throwaway test data. Override via env for other accounts.
const EMAIL = process.env.EB_EMAIL || 'gm@example.com'
const PASSWORD = process.env.EB_PASSWORD || '81d9fddc25f16c0ab099462ea4d64fcf'

// Drive the full OIDC Authorization-Code+PKCE login: SPA "Sign in" → lets-roll
// Devise form → back to the SPA authed, campaigns loaded. Reusable across specs.
export async function login(page, baseURL) {
  await page.goto(baseURL, { waitUntil: 'domcontentloaded' })

  const signIn = page.getByRole('button', { name: /sign in/i })
  await signIn.waitFor({ timeout: 15_000 }) // wait for React to render the button
  await signIn.click()

  await page.locator('#user_email').waitFor({ timeout: 20_000 })
  await page.locator('#user_email').fill(EMAIL)
  await page.locator('#user_password').fill(PASSWORD)
  await page.locator('input[type="submit"], button[type="submit"]').first().click()

  await page.waitForURL((u) => u.toString().startsWith(baseURL), { timeout: 20_000 })
  // settle into authed: campaigns list (or the "no GM campaigns" empty state)
  await page.locator('.campaigns, .empty').first().waitFor({ timeout: 15_000 })
  await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible()
}

// Select the first campaign and wait for the chapter tree to render.
export async function openFirstCampaign(page) {
  await page.locator('button.campaign').first().click()
  await expect(page.getByTestId('chapter-tree')).toBeVisible()
}

// Create-and-open an encounter: click "+ encounter" (Unsorted by default, or the
// per-chapter button inside `group`), name it in the now-open editor, and wait for
// the rename to persist. Leaves the editor open (like a real GM continuing to build).
export async function createEncounter(page, name, group) {
  if (group) await group.getByRole('button', { name: '+ encounter' }).click()
  else await page.getByTestId('new-encounter').click()
  await expect(page.locator('.editor')).toBeVisible()
  // Wait until the editor has actually loaded the new (untitled) encounter before
  // typing — otherwise, when switching from a previously-open editor, the async
  // GET for the new encounter can resolve AFTER the fill and overwrite the name.
  await expect(page.getByLabel('encounter name')).toHaveValue('Untitled encounter')
  // Then wait for the rename PUT itself: the editor shows "Saved" for the clean
  // load, so a bare toHaveText('Saved') could match that before the rename lands.
  const put = page.waitForResponse((r) => r.request().method() === 'PUT' && /\/encounters\/[^/]+$/.test(r.url()))
  await page.getByLabel('encounter name').fill(name)
  await put
  await expect(page.getByTestId('save-state')).toHaveText('Saved')
}

// Create-and-open a chapter, name it, wait for the rename to persist, and close
// back to the tree.
export async function createChapter(page, name) {
  await page.getByTestId('add-chapter').click()
  const detail = page.getByTestId('chapter-detail')
  await expect(detail).toBeVisible()
  const put = page.waitForResponse((r) => r.request().method() === 'PUT' && /\/chapters\/[^/]+$/.test(r.url()))
  await detail.getByLabel('chapter name').fill(name)
  await put
  await expect(detail.getByTestId('chapter-saved')).toHaveText('Saved')
  await detail.getByRole('button', { name: 'Close' }).click()
}

// Open an encounter from the sidebar and delete it from inside the editor.
export async function deleteEncounter(page, name) {
  await page.locator('button.encounter', { hasText: name }).first().click()
  await expect(page.locator('.editor')).toBeVisible()
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: `Delete ${name}` }).click()
  await expect(page.locator('button.encounter', { hasText: name })).toHaveCount(0)
}

// Open a chapter (via its name) and delete it from inside the detail page.
export async function deleteChapter(page, name) {
  await page.getByRole('button', { name: `Open chapter ${name}` }).click()
  const detail = page.getByTestId('chapter-detail')
  await expect(detail).toBeVisible()
  page.once('dialog', (d) => d.accept())
  await detail.getByRole('button', { name: `Delete chapter ${name}` }).click()
  await expect(page.getByRole('button', { name: `Open chapter ${name}` })).toHaveCount(0)
}

// Fail a test if any app/pfsrd2/lets-roll API call returned 4xx/5xx — this is how
// the game-id-502, OAC-403, and colon-404 bugs would have been caught automatically.
export function trackApiErrors(page) {
  const errors = []
  page.on('response', (r) => {
    const u = r.url()
    const watched = u.includes('/api/app/') || u.includes('/api/v1/') || u.includes('/api/pfsrd2/')
    if (watched && r.status() >= 400) errors.push(`${r.status()} ${r.request().method()} ${u}`)
  })
  return errors
}

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

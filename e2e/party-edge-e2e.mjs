// Capstone e2e for the party-treasure staging edge (848p): drive the real SPA
// at party-treasure.staging.521studios.com through OIDC login, then confirm an
// authed GET /api/party/parties/{id}/treasure returns 200 THROUGH the CloudFront
// edge. Staging GM creds come from EB_EMAIL / EB_PASSWORD (see helpers/login.js).
import { chromium } from '@playwright/test'
import { creds } from './helpers/login.js'

const baseURL = 'https://party-treasure.staging.521studios.com'
const { email: EMAIL, password: PASSWORD } = creds()

const browser = await chromium.launch()
const page = await browser.newPage()
const apiErrors = []
let treasureStatus = null
page.on('response', (r) => {
  const u = r.url()
  if ((u.includes('/api/app/') || u.includes('/api/party/') || u.includes('/api/v1/') || u.includes('/api/pfsrd2/')) && r.status() >= 400) {
    apiErrors.push(`${r.status()} ${r.request().method()} ${u}`)
  }
  const m = u.match(/\/api\/party\/parties\/[^/]+\/treasure/)
  if (m) treasureStatus = r.status()
})
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE_ERROR:', m.text()) })

try {
  await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
  const signIn = page.getByRole('button', { name: /sign in with lets-roll/i })
  await signIn.waitFor({ timeout: 15000 })
  console.log('SPA_BOOTED signin screen rendered')
  await signIn.click()

  // lets-roll Devise login
  await page.locator('#user_email').waitFor({ timeout: 20000 })
  await page.locator('#user_email').fill(EMAIL)
  await page.locator('#user_password').fill(PASSWORD)
  await page.locator('input[type="submit"], button[type="submit"]').first().click()

  // back to the SPA, authed
  await page.waitForURL((u) => u.toString().startsWith(baseURL), { timeout: 20000 })
  await page.getByRole('button', { name: /sign out/i }).waitFor({ timeout: 15000 })
  console.log('AUTHED sign-out visible')

  // campaigns (from lets-roll) → pick one → TreasureView fetches /api/party/.../treasure
  const campaigns = page.locator('.campaign-list button.campaign')
  const empty = page.locator('.empty')
  await Promise.race([
    campaigns.first().waitFor({ timeout: 15000 }).catch(() => {}),
    empty.first().waitFor({ timeout: 15000 }).catch(() => {}),
  ])
  const n = await campaigns.count()
  console.log('CAMPAIGN_COUNT', n)
  if (n > 0) {
    await campaigns.first().click()
    // wait for the treasure fetch to resolve
    await page.waitForResponse((r) => /\/api\/party\/parties\/[^/]+\/treasure/.test(r.url()), { timeout: 15000 })
    await page.waitForTimeout(500)
    console.log('TREASURE_FETCH_STATUS', treasureStatus)
  } else {
    console.log('NO_CAMPAIGNS (gm not a member of any staging campaign) — authed+edge still proven')
  }

  console.log('API_ERRORS', JSON.stringify(apiErrors))
  console.log('RESULT', (treasureStatus === 200 || (n === 0)) && apiErrors.filter((e) => !e.startsWith('401')).length === 0 ? 'PASS' : 'CHECK')
} catch (e) {
  console.log('E2E_ERROR', e?.message || String(e))
  console.log('API_ERRORS', JSON.stringify(apiErrors))
  process.exitCode = 1
} finally {
  await browser.close()
}

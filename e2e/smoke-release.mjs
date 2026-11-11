// Slice-5 release smoke: log in as the staging GM, create an encounter with
// treasure + coins, release it, and print the ids. The release triggers
// encounter-builder-api's SigV4 push to party-treasure (service path). We verify
// the loot landed by querying party-treasure's DynamoDB directly (separate step).
import { chromium } from '@playwright/test'
import { createHash } from 'node:crypto'
import { login, openFirstCampaign } from './helpers/login.js'

// CloudFront OAC does not compute the body hash for POST/PUT, so the Lambda
// Function URL's SigV4 check needs the client to supply x-amz-content-sha256.
const sha256hex = (s) => createHash('sha256').update(s, 'utf8').digest('hex')

const baseURL = 'https://encounters.staging.521studios.com'
const browser = await chromium.launch()
const page = await browser.newPage()

let campaignID = null
page.on('request', (r) => {
  if (campaignID) return
  const m = r.url().match(/\/api\/app\/campaigns\/([^/]+)\//)
  if (m) campaignID = decodeURIComponent(m[1])
})

try {
  await login(page, baseURL)
  await openFirstCampaign(page)
  if (!campaignID) throw new Error('could not determine campaignID')

  const token = await page.evaluate(() => {
    const scan = (s) => { for (let i = 0; i < s.length; i++) { const k = s.key(i); if (k && k.startsWith('oidc.user:')) { try { return JSON.parse(s.getItem(k)).access_token } catch {} } } return null }
    return scan(window.sessionStorage) || scan(window.localStorage)
  })
  if (!token) throw new Error('no access token in storage')

  const auth = { 'X-Access-Token': token }
  const stamp = Date.now()
  const body = JSON.stringify({
    name: `smoke-release-${stamp}`,
    content: [
      { type: 'treasure', treasure: { ref: { game_id: `SmokeItem:${stamp}` }, qty: 2 } },
      { type: 'coin', coin: { gp: 10, sp: 5 } },
    ],
  })

  const create = await page.request.post(`${baseURL}/api/app/campaigns/${campaignID}/encounters/`, {
    headers: { ...auth, 'Content-Type': 'application/json', 'x-amz-content-sha256': sha256hex(body) },
    data: body,
  })
  const created = await create.json().catch(() => ({}))
  console.log('CREATE_STATUS', create.status())
  if (create.status() !== 201) { console.log('CREATE_BODY', JSON.stringify(created)); throw new Error('create failed') }
  const encID = created.id

  const rel = await page.request.post(`${baseURL}/api/app/campaigns/${campaignID}/encounters/${encID}/release?force=true`, {
    headers: { ...auth, 'x-amz-content-sha256': sha256hex('') },
  })
  console.log('RELEASE_STATUS', rel.status())
  console.log('RELEASE_BODY', (await rel.text()).slice(0, 300))

  console.log('CAMPAIGN_ID', campaignID)
  console.log('ENCOUNTER_ID', encID)
  console.log('ITEM_REF', `SmokeItem:${stamp}`)
} finally {
  await browser.close()
}

import { test as base, expect } from '@playwright/test'

export { expect }

// tc0g: every encounter/chapter a test creates is deleted at teardown, even when
// the test fails part-way, so specs stop leaking rows onto the staging GM account
// (1,600 had piled up by 2026-11-12). Creates are captured from the SPA's own
// POST responses; deletes replay its X-Access-Token (a bodiless DELETE needs no
// OAC payload hash). A spec's own UI delete still runs as part of what it tests,
// and a row already gone just 404s here, which is ignored.
const CREATE = /\/api\/app\/campaigns\/[^/]+\/(encounters|chapters)\/?$/

export const test = base.extend({
  page: async ({ page }, use) => {
    const created = []
    const pending = []
    page.on('response', (r) => {
      const req = r.request()
      if (req.method() !== 'POST' || r.status() !== 201 || !CREATE.test(r.url())) return
      const token = req.headers()['x-access-token']
      pending.push(
        r
          .json()
          .then((body) => body?.id && created.push({ url: `${r.url().replace(/\/$/, '')}/${body.id}`, token }))
          .catch(() => {}),
      )
    })
    await use(page)
    await Promise.all(pending)
    // Newest first: encounters before the chapters they were made in.
    for (const { url, token } of created.reverse()) {
      await page.request.delete(url, { headers: token ? { 'X-Access-Token': token } : {} }).catch(() => {})
    }
  },
})

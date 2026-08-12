import { defineConfig, devices } from '@playwright/test'

// Functional tests run against the DEPLOYED staging SPA (not a local server) —
// they exercise the real OIDC + CloudFront/OAC + Lambda + lets-roll chain, which
// is where the bugs live. Override the target with EB_BASE_URL.
export default defineConfig({
  testDir: '.',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: process.env.EB_BASE_URL || 'https://encounters.staging.521studios.com',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})

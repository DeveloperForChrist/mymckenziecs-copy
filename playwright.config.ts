import dotenv from 'dotenv'
import { defineConfig } from '@playwright/test'

dotenv.config({ path: '.env.local' })

const baseURL = process.env.E2E_BASE_URL || 'https://www.mymckenziecs.com'

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: {
    timeout: 15_000,
  },
  fullyParallel: false,
  reporter: 'line',
  use: {
    baseURL,
    browserName: 'chromium',
    headless: true,
    ignoreHTTPSErrors: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium',
    },
  },
})

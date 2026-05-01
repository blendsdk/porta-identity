import { defineConfig } from '@playwright/test';

export default defineConfig({
  globalSetup: './tests/global-setup.ts',
  testDir: './tests',
  timeout: 30_000,
  retries: 0,
  workers: 1,                    // Serial — shared state
  fullyParallel: false,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'https://app.test:4100',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
    ignoreHTTPSErrors: true,      // Accept self-signed cert for Porta HTTPS
  },
  projects: [
    {
      name: 'spa',
      testMatch: /spa-.*\.spec\.ts/,
      use: { baseURL: 'https://app.test:4100' },
    },
    {
      name: 'bff',
      testMatch: /bff-.*\.spec\.ts/,
      use: { baseURL: 'http://app.test:4101' },
    },
  ],
  // No webServer — harness must be started separately via start.sh
});

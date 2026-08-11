import { defineConfig } from '@playwright/test';

const appUrl = process.env.HARNESS_APP_URL ?? 'https://app-harness.ci.portaidentity.com:4100';
const bffUrl = process.env.HARNESS_BFF_URL ?? 'http://app-harness.ci.portaidentity.com:4101';

export default defineConfig({
  globalSetup: './tests/global-setup.ts',
  testDir: './tests',
  timeout: 30_000,
  retries: 0,
  workers: 1, // Serial — shared state
  fullyParallel: false,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: appUrl,
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
    ignoreHTTPSErrors: true, // Accept self-signed cert for Porta HTTPS
  },
  projects: [
    {
      name: 'spa',
      testMatch: /spa-.*\.spec\.ts/,
      use: { baseURL: appUrl },
    },
    {
      name: 'bff',
      testMatch: /bff-.*\.spec\.ts/,
      use: { baseURL: bffUrl },
    },
  ],
  // No webServer — harness must be started separately via start.sh
});

/**
 * Playwright configuration for Porta UI tests.
 *
 * Runs browser-based tests against a real Porta server to verify
 * authentication UI flows (login, consent, magic link, 2FA) and
 * security properties (CSRF enforcement, cookie flags) that
 * HTTP-level tests cannot catch.
 *
 * Uses a dedicated port (49200) to avoid conflicts with other test
 * suites (E2E uses random ports, dev server uses 3000).
 *
 * Global setup starts a real Porta server with DB/Redis; global
 * teardown stops it cleanly. Test data is seeded once and shared
 * across all spec files via environment variables.
 */

import { defineConfig, devices } from '@playwright/test';

/** Headed mode: activated via --headed flag or HEADED env var */
const isHeaded = process.argv.includes('--headed') || !!process.env.HEADED;

export default defineConfig({
  /* Test directory — relative to this config file */
  testDir: '.',

  /* Run spec files in parallel for speed */
  fullyParallel: true,

  /* Fail CI if test.only() is accidentally left in */
  forbidOnly: !!process.env.CI,

  /* Retry flaky tests in CI only */
  retries: process.env.CI ? 2 : 0,

  /* Single worker in CI for deterministic results */
  workers: process.env.CI ? 1 : undefined,

  /* Reporters: list for terminal, HTML for debugging failures */
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
  ],

  /* Shared settings for all projects */
  use: {
    /* Base URL for all page.goto() calls — set by global setup */
    baseURL: process.env.TEST_UI_BASE_URL ?? 'http://localhost:49200',

    /* Capture trace on first retry for debugging */
    trace: 'on-first-retry',

    /* Screenshot only when a test fails */
    screenshot: 'only-on-failure',

    /* Timeout for individual Playwright actions (click, fill, etc.) */
    actionTimeout: 15_000,
  },

  /* Browser projects — Chromium only for now */
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        /* In headed mode, slow down actions so you can watch the flow */
        launchOptions: isHeaded ? { slowMo: 500 } : {},
      },
    },
  ],

  /* Global setup: start Porta server, run migrations, seed test data */
  globalSetup: './setup/global-setup.ts',

  /* Global teardown: stop server, disconnect DB/Redis */
  globalTeardown: './setup/global-teardown.ts',

  /* Per-test timeout — auth flows involve redirects, so allow 30s */
  timeout: 30_000,
});

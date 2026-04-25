/**
 * Playwright configuration for Admin GUI E2E tests.
 *
 * Runs browser-based tests against a real Porta server + Admin GUI BFF
 * to verify the complete admin GUI user experience: authentication,
 * navigation, page rendering, data display, and cross-page workflows.
 *
 * Architecture:
 *   - Porta server on port 49300 (OIDC provider + admin API)
 *   - Admin GUI BFF on port 49301 (Koa + session + API proxy + built SPA)
 *   - Playwright tests interact with the BFF as a real user would
 *
 * Auth flow: magic link via MailHog → BFF session cookie → storageState
 *
 * Ports chosen to avoid conflicts with:
 *   - Dev servers (4000/4002/4003)
 *   - Porta UI tests (49200)
 *   - E2E/pentest tests (random ports)
 */

import { defineConfig } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Porta OIDC server port for E2E tests */
const PORT_PORTA = 49300;

/** Admin GUI BFF port for E2E tests */
const PORT_BFF = 49301;

/** Headed mode: activated via --headed flag or HEADED env var */
const isHeaded = process.argv.includes('--headed') || !!process.env.HEADED;

export default defineConfig({
  /* Test directory — relative to this config file */
  testDir: './tests/e2e',

  /* Serial execution — no parallelism (per requirement) */
  workers: 1,
  fullyParallel: false,

  /* Fail CI if test.only() is accidentally left in */
  forbidOnly: !!process.env.CI,

  /* Timeouts */
  timeout: 30_000, // 30s per test
  expect: { timeout: 10_000 }, // 10s for assertions

  /* Retries — in CI only */
  retries: process.env.CI ? 2 : 0,

  /* Reporters: HTML for debugging, list for terminal */
  reporter: process.env.CI
    ? [['html', { open: 'never' }], ['github']]
    : [['html', { open: 'on-failure' }], ['list']],

  /* Global setup: start Porta + BFF, run migrations, seed data */
  globalSetup: './tests/e2e/setup/global-setup.ts',

  /* Global teardown: stop servers, disconnect DB/Redis */
  globalTeardown: './tests/e2e/setup/global-teardown.ts',

  /* Shared settings for all projects */
  use: {
    /* Base URL is the BFF (serves SPA + API proxy) */
    baseURL: `http://localhost:${PORT_BFF}`,

    /* Browser settings */
    headless: !isHeaded,
    viewport: { width: 1280, height: 720 },

    /* Artifacts on failure */
    screenshot: 'only-on-failure',
    trace: process.env.CI ? 'on-first-retry' : 'retain-on-failure',
    video: 'off',

    /* Timeout for individual Playwright actions (click, fill, etc.) */
    actionTimeout: 15_000,

    /* Slow down for headed debugging */
    ...(isHeaded ? { launchOptions: { slowMo: 1000 } } : {}),
  },

  projects: [
    // ── Auth setup — runs FIRST, no storageState ────────────────────
    // Performs the real magic-link auth flow and saves browser state
    {
      name: 'auth-setup',
      testMatch: /setup\/auth-setup\.ts/,
      use: { storageState: undefined },
    },

    // ── Unauthenticated tests — no storageState ────────────────────
    // Tests login redirect behavior for unauthenticated users
    {
      name: 'unauthenticated',
      testMatch: /auth\/.*\.spec\.ts/,
      use: { storageState: undefined },
      dependencies: ['auth-setup'],
    },

    // ── Authenticated tests — uses cached storageState ──────────────
    // All navigation, page, and workflow tests run authenticated
    {
      name: 'authenticated',
      testMatch: /\/(navigation|pages|workflows)\/.*\.spec\.ts/,
      use: {
        storageState: path.resolve(__dirname, 'tests/e2e/.auth/admin-session.json'),
      },
      dependencies: ['auth-setup'],
    },
  ],
});

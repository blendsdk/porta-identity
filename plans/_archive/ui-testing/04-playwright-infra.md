# Playwright Infrastructure

> **Document**: 04-playwright-infra.md
> **Parent**: [Index](00-index.md)

## Overview

Playwright Test configuration, global setup/teardown, and shared fixtures for browser-based UI testing of Porta's authentication flows.

## Architecture

### Directory Structure

```
tests/ui/
├── playwright.config.ts          # Playwright configuration
├── setup/
│   ├── global-setup.ts          # Start Porta server + seed data
│   └── global-teardown.ts       # Stop server + cleanup
├── fixtures/
│   └── test-fixtures.ts         # Shared page fixtures + helpers
├── flows/                        # Happy-path browser flow tests
│   ├── password-login.spec.ts   # Login → consent → callback
│   ├── magic-link.spec.ts       # Magic link request → email → callback
│   ├── consent.spec.ts          # Consent approve/deny
│   └── two-factor.spec.ts       # 2FA challenge flow
└── security/                     # Security-focused browser tests
    ├── csrf-protection.spec.ts  # CSRF token enforcement
    └── cookie-flags.spec.ts     # HttpOnly, SameSite verification
```

## Implementation Details

### Playwright Configuration (`playwright.config.ts`)

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
  ],
  use: {
    baseURL: process.env.TEST_UI_BASE_URL ?? 'http://localhost:49200',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  globalSetup: require.resolve('./setup/global-setup.ts'),
  globalTeardown: require.resolve('./setup/global-teardown.ts'),
  timeout: 30_000,
});
```

### Global Setup (`setup/global-setup.ts`)

Reuses the existing `tests/helpers/server-setup.ts` to start a real Porta server:

```typescript
/**
 * Playwright global setup.
 *
 * 1. Connects to Docker services (Postgres, Redis)
 * 2. Runs migrations
 * 3. Seeds test data (org, app, client, user)
 * 4. Starts Koa server with OIDC provider
 * 5. Exports server URL for tests
 */
export default async function globalSetup(): Promise<void> {
  // Start server on dedicated port for UI tests
  // Store server reference for teardown
  // Set TEST_UI_BASE_URL environment variable
}
```

### Global Teardown (`setup/global-teardown.ts`)

```typescript
/**
 * Playwright global teardown.
 *
 * 1. Stop Koa server
 * 2. Disconnect Redis
 * 3. Disconnect PostgreSQL
 */
export default async function globalTeardown(): Promise<void> {
  // Clean shutdown
}
```

### Test Fixtures (`fixtures/test-fixtures.ts`)

```typescript
import { test as base, expect, type Page } from '@playwright/test';

/** Test data seeded in global setup */
export interface TestData {
  orgSlug: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  userEmail: string;
  userPassword: string;
  baseUrl: string;
}

/**
 * Extended test fixture with helpers for OIDC flows.
 */
export const test = base.extend<{
  testData: TestData;
  startAuthFlow: (page: Page) => Promise<string>;  // Returns interaction URL
}>({
  testData: async ({}, use) => {
    // Read from environment (set by global setup)
    await use({
      orgSlug: process.env.TEST_ORG_SLUG!,
      clientId: process.env.TEST_CLIENT_ID!,
      clientSecret: process.env.TEST_CLIENT_SECRET!,
      redirectUri: process.env.TEST_REDIRECT_URI!,
      userEmail: process.env.TEST_USER_EMAIL!,
      userPassword: process.env.TEST_USER_PASSWORD!,
      baseUrl: process.env.TEST_UI_BASE_URL!,
    });
  },

  startAuthFlow: async ({ page, testData }, use) => {
    // Helper: initiate OIDC auth flow and return the login page URL
    const startFlow = async (p: Page): Promise<string> => {
      // Build authorization URL with PKCE
      // Navigate to it — browser follows redirect to /interaction/:uid
      // Return the final URL (login page)
      return '';
    };
    await use(startFlow);
  },
});

export { expect };
```

### Package.json Script

```json
{
  "scripts": {
    "test:ui": "npx playwright test --config tests/ui/playwright.config.ts"
  }
}
```

### Dependencies

```json
{
  "devDependencies": {
    "@playwright/test": "^1.49.0"
  }
}
```

After install: `npx playwright install chromium` to download the browser binary.

## Integration with Existing Infrastructure

| Component | Reuse Strategy |
|---|---|
| Docker services | Same `docker/docker-compose.yml` (Postgres, Redis, MailHog) |
| Server setup | Reuse `tests/helpers/server-setup.ts` |
| Test database | Reuse `porta_test` database (same as integration/E2E tests) |
| Seed data | Use `tests/integration/helpers/factories.ts` for test data creation |
| MailHog | Reuse `tests/e2e/helpers/mailhog.ts` for magic link email verification |

## Error Handling

| Error Case | Handling Strategy |
|---|---|
| Docker services not running | Global setup fails with clear error message |
| Port conflict | Use dedicated port (49200) distinct from E2E (49123) |
| Browser download needed | `npx playwright install chromium` in CI setup step |
| Server startup timeout | 30s timeout in global setup with descriptive error |
| Flaky network timing | Playwright auto-wait + explicit `waitForURL` |

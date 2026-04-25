/**
 * Auth setup — performs the real magic-link authentication flow.
 *
 * This is NOT a test file — it's a setup step that runs BEFORE all
 * other tests. It authenticates via the complete OIDC magic-link flow:
 *
 *   1. Navigate to BFF root → SPA redirects to /login → /auth/login
 *   2. BFF redirects to Porta's OIDC authorize endpoint
 *   3. Porta shows the login interaction page
 *   4. Fill in email, click "Send Magic Link"
 *   5. Porta sends magic link email → MailHog captures it
 *   6. Extract magic link URL from MailHog
 *   7. Navigate to magic link → Porta validates → redirects to BFF callback
 *   8. BFF exchanges code → creates session → redirects to Dashboard
 *   9. Save browser storageState (cookies) for all subsequent tests
 *
 * The saved storageState includes the BFF session cookie, so all
 * authenticated tests skip the login flow entirely.
 *
 * Configured as the 'auth-setup' project in playwright.config.ts
 * with `storageState: undefined` (no pre-existing auth).
 */

import { test as setup, expect } from '@playwright/test';
import path from 'node:path';
import { MailHogClient } from '../fixtures/mailhog.js';

/** Path where authenticated browser state is saved */
const AUTH_STATE_PATH = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  '../.auth/admin-session.json',
);

/** Admin email — set by global setup, also hardcoded as fallback */
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@porta-test.local';

/** MailHog API URL — set by global setup */
const MAILHOG_URL = process.env.MAILHOG_API_URL ?? 'http://localhost:8025';

setup('authenticate via magic link', async ({ page }) => {
  const mailhog = new MailHogClient(MAILHOG_URL);

  // ── Step 0: Clear MailHog inbox to avoid stale emails ────────────
  await mailhog.clearAll();

  // ── Step 1: Navigate to the BFF root ─────────────────────────────
  // The SPA loads, checks /auth/me (unauthenticated), and redirects
  // through /login → /auth/login → Porta's authorize endpoint →
  // Porta's login interaction page.
  //
  // This involves multiple redirects, so we wait for the Porta login
  // page to settle (it has the #email input).
  await page.goto('/');

  // Wait for the login page to fully load — Porta's interaction page
  // has an email input field. The redirect chain is:
  //   BFF / → SPA RequireAuth → /login → /auth/login → Porta authorize → Porta login
  await page.waitForSelector('#email', { timeout: 30_000 });

  // ── Step 2: Fill email and request magic link ────────────────────
  await page.fill('#email', ADMIN_EMAIL);

  // Click the magic link button — this submits the magic link form.
  // The button exists because the org's default_login_methods includes
  // 'magic_link' (the default: ['password', 'magic_link']).
  await page.click('#magic-link-btn');

  // ── Step 3: Wait for confirmation page ───────────────────────────
  // After submitting, Porta shows a "check your email" page.
  // We don't need to assert on it — we just need to wait for the
  // email to arrive in MailHog.

  // ── Step 4: Retrieve magic link from MailHog ─────────────────────
  const message = await mailhog.waitForMessage(ADMIN_EMAIL, 15_000);
  const magicLink = mailhog.extractMagicLink(message);

  // The magic link URL points to Porta (e.g., http://localhost:49300/porta-admin/auth/magic-link/TOKEN)
  expect(magicLink).toContain('/magic-link/');

  // ── Step 5: Click the magic link ─────────────────────────────────
  // Navigate to the magic link URL. Porta verifies the token,
  // resumes the OIDC interaction, and redirects through:
  //   Porta magic-link verify → Porta consent (auto) → BFF /auth/callback → BFF /
  await page.goto(magicLink);

  // ── Step 6: Wait for authenticated Dashboard ─────────────────────
  // After the auth flow completes, the BFF redirects to / and the
  // SPA loads the Dashboard. We wait for a known element that only
  // appears when authenticated.
  //
  // The Dashboard should have a heading or the AppShell layout visible.
  // We use a generous timeout because the redirect chain is long.
  await page.waitForURL('**/');

  // Verify we're on the authenticated app — the AppShell sidebar
  // should be visible, or at minimum the /auth/me call returns
  // authenticated: true. Let's check for the sidebar navigation.
  await expect(page.locator('nav, [role="navigation"]').first()).toBeVisible({
    timeout: 15_000,
  });

  // ── Step 7: Save authenticated browser state ─────────────────────
  // This saves cookies (including the BFF session cookie) to a file.
  // All 'authenticated' project tests load this state, skipping login.
  await page.context().storageState({ path: AUTH_STATE_PATH });
});

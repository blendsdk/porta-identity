/**
 * Playwright auth setup — authenticates as admin via magic link.
 *
 * This is a special Playwright "test" that runs as the first project
 * (before any actual tests). It performs a real magic-link login flow:
 *
 *   1. Clear MailHog inbox
 *   2. Navigate to BFF /auth/login → OIDC authorize → Porta login page
 *   3. Fill email + click "Send me a sign-in link"
 *   4. Poll MailHog for the magic link email
 *   5. Navigate to the magic link URL → Porta validates → BFF callback
 *   6. BFF creates session → redirect to / (SPA loads)
 *   7. Save storageState for all subsequent authenticated tests
 *
 * The saved storageState file (.auth/admin-session.json) contains the
 * BFF session cookie, allowing all "authenticated" project tests to
 * skip the login flow entirely.
 *
 * @see playwright.config.ts — "auth-setup" project configuration
 * @see fixtures/mailhog.ts — MailHog client for email retrieval
 * @see fixtures/seed-data.ts — Seed data (admin user, BFF client)
 */

import { test as setup, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MailHogClient } from '../fixtures/mailhog.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Path where authenticated browser state (cookies + storage) is saved.
 * This directory is gitignored (tests/e2e/.auth/).
 */
const AUTH_FILE = path.resolve(__dirname, '../.auth/admin-session.json');

/** Admin email address — set by global-setup via env var */
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@porta-test.local';

/** MailHog API URL — set by global-setup via env var */
const MAILHOG_API_URL = process.env.MAILHOG_API_URL ?? 'http://localhost:8025';

/** BFF base URL — set by global-setup via env var */
const ADMIN_GUI_URL = process.env.ADMIN_GUI_URL ?? 'http://localhost:49301';

setup('authenticate as admin via magic link', async ({ page }) => {
  setup.setTimeout(60_000); // Allow 60s for the full auth flow

  const mailhog = new MailHogClient(MAILHOG_API_URL);

  // ── 1. Clear MailHog inbox ──────────────────────────────────────────
  // Ensures we only find the magic link email sent during THIS flow,
  // not leftover emails from previous test runs.
  await mailhog.clearAll();

  // ── 2. Navigate to BFF login — starts OIDC auth flow ──────────────
  // GET /auth/login on the BFF:
  //   → generates PKCE challenge (S256) + random state
  //   → stores code_verifier + state in Koa session
  //   → redirects to Porta's OIDC /authorize endpoint
  // Porta's authorize endpoint:
  //   → creates interaction (login prompt)
  //   → redirects to /:orgSlug/interaction/:uid/login
  await page.goto(`${ADMIN_GUI_URL}/auth/login`);

  // ── 3. Wait for Porta's login interaction page ────────────────────
  // The login page is server-rendered by Porta (Handlebars template).
  // It contains an email input and either:
  //   - Both password + magic link forms ("both" mode)
  //   - Magic link form only ("magic-link only" mode)
  // We wait for the email input to confirm the page has loaded.
  const emailInput = page.locator('input[name="email"], #email');
  await expect(emailInput.first()).toBeVisible({ timeout: 15_000 });

  // ── 4. Fill email address ─────────────────────────────────────────
  // Fill the visible email field. In "both" mode, template JS copies
  // this value to the magic link form's hidden email field on submit.
  await emailInput.first().fill(ADMIN_EMAIL);

  // ── 5. Click the magic link button ────────────────────────────────
  // The button text is "Send me a sign-in link" in all template modes.
  // This submits POST /:orgSlug/interaction/:uid/magic-link which
  // triggers Porta to send the magic link email via SMTP → MailHog.
  const magicLinkButton = page.locator(
    'button:has-text("sign-in link"), ' +
    'input[type="submit"][value*="sign-in link"]',
  );
  await magicLinkButton.first().click();

  // ── 6. Wait for confirmation ──────────────────────────────────────
  // After submitting, the page either:
  //   - Shows a "check your email" inline message
  //   - Redirects to a magic-link-sent confirmation page
  // Wait briefly to ensure the email has been queued for sending.
  await page.waitForTimeout(1_000);

  // ── 7. Poll MailHog for the magic link email ──────────────────────
  // Porta sends the email via SMTP to MailHog (running on port 1025).
  // We poll MailHog's REST API until the email arrives.
  const message = await mailhog.waitForMessage(ADMIN_EMAIL, 30_000);
  const magicLinkUrl = mailhog.extractMagicLink(message);

  // ── 8. Navigate to the magic link URL ─────────────────────────────
  // The URL points to Porta (e.g., http://localhost:49300/:orgSlug/auth/magic-link?token=...&email=...).
  // Porta validates the token, completes the OIDC interaction, and redirects:
  //   → BFF /auth/callback?code=...&state=...
  //   → BFF exchanges code for tokens (PKCE), creates session
  //   → BFF redirects to / (SPA loads)
  await page.goto(magicLinkUrl);

  // ── 9. Wait for authenticated SPA to load ─────────────────────────
  // After the BFF callback creates the session and redirects to /,
  // the SPA loads and the AppShell renders (sidebar, topbar, content).
  // We wait for the app-shell data-testid to confirm full load.
  await page.waitForURL(`${ADMIN_GUI_URL}/**`, { timeout: 30_000 });

  // Verify the SPA is loaded and authenticated
  const appShell = page.locator('[data-testid="app-shell"]');
  await expect(appShell).toBeVisible({ timeout: 15_000 });

  // Double-check: sidebar should be visible (proves auth + SPA loaded)
  const sidebar = page.locator('[data-testid="sidebar"]');
  await expect(sidebar).toBeVisible({ timeout: 5_000 });

  // ── 10. Save authenticated browser state ──────────────────────────
  // Saves cookies (BFF session cookie) and localStorage/sessionStorage
  // to a JSON file. The "authenticated" Playwright project uses this
  // file as its storageState, skipping the login flow for all tests.
  await page.context().storageState({ path: AUTH_FILE });
});

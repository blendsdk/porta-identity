/**
 * OIDC Test Harness — Shared Playwright Helpers
 *
 * Used by all 6 test specs for:
 *   - Password login on Porta's login page
 *   - Magic link flow (start + MailHog email retrieval)
 *   - Consent page handling
 *   - JSON result assertion
 *
 * See: plans/oidc-test-harness/07-testing-strategy.md
 */

import { Page, expect } from '@playwright/test';

// ── Config ──────────────────────────────────────────────

export const TEST_USER = {
  email: 'testuser@test.org',
  password: 'TestPassword123!',
};

export const MAILHOG_API = 'http://localhost:8025/api';

// ── Porta Login Page Helpers ────────────────────────────

/**
 * Fill in password credentials on Porta's login page and submit.
 * Works for both SPA and BFF flows — Porta's login page is the same.
 *
 * Porta's login template (templates/default/pages/login.hbs) uses:
 *   - input[name="email"]  (type="email", id="email")
 *   - input[name="password"] (type="password", id="password")
 *   - button[type="submit"]
 */
export async function loginWithPassword(page: Page): Promise<void> {
  // Wait for Porta's login page to load
  await page.waitForSelector('input[name="email"]', { timeout: 10_000 });

  // Fill credentials
  await page.fill('input[name="email"]', TEST_USER.email);
  await page.fill('input[name="password"]', TEST_USER.password);

  // Submit
  await page.click('button[type="submit"]');

  // Handle consent page if it appears
  await handleConsentIfPresent(page);
}

/**
 * Start magic link flow on Porta's login page.
 * Returns after the "check your email" page is shown.
 *
 * Porta's login template in dual-method mode (password + magic_link):
 *   - Both forms are rendered SIMULTANEOUSLY (no toggle, no tab)
 *   - Password form: input#email (shared), input#password, button.btn-primary
 *   - Divider: <div class="divider"><span>or</span></div>
 *   - Magic link form: hidden input[name="email"], button#magic-link-btn.btn-secondary
 *   - JS on the magic-link form's submit copies #email value to the hidden field
 *
 * Flow: fill the shared #email input → click #magic-link-btn → JS auto-copies
 * email to hidden field and submits the magic link form.
 *
 * Source: templates/default/pages/login.hbs (verified against actual template)
 */
export async function startMagicLinkFlow(page: Page): Promise<void> {
  // Wait for Porta's login page
  await page.waitForSelector('input[name="email"]', { timeout: 10_000 });

  // Fill the shared email input (used by both password and magic link forms)
  await page.fill('input[name="email"]', TEST_USER.email);

  // Click the magic link button (NOT the password submit button!)
  await page.click('#magic-link-btn');

  // Wait for "check your email" confirmation
  await page.waitForSelector('text=check your email', { timeout: 10_000 });
}

/**
 * Handle consent page if Porta shows it (first-party clients may auto-consent).
 */
export async function handleConsentIfPresent(page: Page): Promise<void> {
  try {
    const consentBtn = await page.waitForSelector(
      'button[type="submit"][name="consent"], button:has-text("Allow"), button:has-text("Authorize")',
      { timeout: 3_000 },
    );
    if (consentBtn) {
      await consentBtn.click();
    }
  } catch {
    // No consent page — auto-consented or not needed
  }
}

/**
 * Handle Porta's sign-out confirmation page.
 * Porta shows a "Sign out" page with a confirmation button instead of auto-redirecting.
 */
export async function handleSignOutConfirmation(page: Page): Promise<void> {
  try {
    const signOutBtn = await page.waitForSelector(
      'button:has-text("Sign out")',
      { timeout: 5_000 },
    );
    if (signOutBtn) {
      await signOutBtn.click();
    }
  } catch {
    // No sign-out confirmation page — auto-redirected
  }
}

// ── MailHog Helpers ─────────────────────────────────────

/**
 * Delete all emails in MailHog (clean slate before magic link tests).
 */
export async function clearMailHog(): Promise<void> {
  await fetch(`${MAILHOG_API}/v1/messages`, { method: 'DELETE' });
}

/**
 * Wait for an email to arrive in MailHog for the given recipient.
 * Returns the email body as a string.
 */
export async function waitForEmail(
  recipientEmail: string,
  maxWaitMs = 10_000,
  pollIntervalMs = 500,
): Promise<string> {
  const start = Date.now();

  while (Date.now() - start < maxWaitMs) {
    const resp = await fetch(
      `${MAILHOG_API}/v2/search?kind=to&query=${encodeURIComponent(recipientEmail)}`,
    );
    const data = await resp.json();

    if (data.items && data.items.length > 0) {
      const latestEmail = data.items[data.items.length - 1];
      // MailHog stores body in Content.Body
      return latestEmail.Content?.Body || latestEmail.Raw?.Data || '';
    }

    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }

  throw new Error(`No email received for ${recipientEmail} within ${maxWaitMs}ms`);
}

/**
 * Extract magic link URL from email body.
 * Looks for href containing "/magic" or a full URL with a token.
 *
 * Handles MIME quoted-printable encoding (=\r\n soft line breaks)
 * and HTML entities (&amp; → &) that MailHog may preserve.
 */
export function extractMagicLink(emailBody: string): string {
  // 1. Decode quoted-printable soft line breaks (=\r\n or =\n)
  let decoded = emailBody.replace(/=\r?\n/g, '');
  // 2. Decode HTML entities in hrefs
  decoded = decoded.replace(/&amp;/g, '&');

  // Magic link emails typically contain a URL like:
  // https://porta.local:3443/test-org/interaction/{uid}/magic-link/verify?token={token}
  const urlMatch = decoded.match(/https?:\/\/[^\s"<>]+magic[^\s"<>]*/i);
  if (!urlMatch) {
    // Fallback: find any porta.local:3443 or localhost:3443 URL (Porta via nginx TLS proxy)
    const fallbackMatch = decoded.match(/https?:\/\/(?:porta\.test|localhost):3443[^\s"<>]+/i);
    if (!fallbackMatch) {
      throw new Error('Could not find magic link URL in email body');
    }
    return fallbackMatch[0];
  }
  return urlMatch[0];
}

// ── Assertion Helpers ───────────────────────────────────

/**
 * Assert that a JSON result is displayed in the given testid element.
 */
export async function assertJsonResult(
  page: Page,
  testId: string,
): Promise<Record<string, unknown>> {
  const el = page.locator(`[data-testid="${testId}"]`);
  await expect(el).toBeVisible({ timeout: 10_000 });
  const text = await el.textContent();
  expect(text).toBeTruthy();
  const parsed = JSON.parse(text!);
  expect(parsed).toBeTruthy();
  return parsed;
}

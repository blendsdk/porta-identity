/** Real browser preferences affect invitation copy without changing stored account language. */
import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { Pool } from 'pg';
import { DEFAULT_TEST_PASSWORD, TEST_DATABASE_URL } from '../../helpers/constants.js';
import type { DbHelpers } from '../fixtures/db-helpers.js';
import { expect, test } from '../fixtures/test-fixtures.js';
import type { TestData } from '../fixtures/test-fixtures.js';

/** Database observations exclude credentials and profile fields from assertion output. */
interface InvitationState {
  used_at: Date | null;
  expires_at: Date;
  locale: string | null;
}

/** Browser errors can contain URLs or filled values; preserve failure with a non-secret message. */
async function browserAction<T>(label: string, operation: () => Promise<T>): Promise<T> {
  try { return await operation(); }
  catch { throw new Error(`Invitation browser action failed: ${label}`); }
}

/** Use the shared token factory, updating only this test's unique invitation locale. */
async function createInvitation(pool: Pool, helpers: DbHelpers, data: TestData) {
  const organizationId = await helpers.getOrgIdBySlug(data.orgSlug);
  const organization = await pool.query<{ default_locale: string }>(
    'SELECT default_locale FROM organizations WHERE id = $1', [organizationId],
  );
  expect(organization.rows[0]?.default_locale).toBe('en');
  const email = `localized-browser-${randomUUID()}@example.test`;
  const token = await helpers.createInvitationToken(email, organizationId);
  const updated = await pool.query(
    'UPDATE invitation_tokens SET locale = $1 WHERE organization_id = $2 AND email = $3 AND used_at IS NULL',
    ['nl', organizationId, email],
  );
  expect(updated.rowCount).toBe(1);
  const path = `/${data.orgSlug}/auth/accept-invite/${token}`;
  return { organizationId, email, path, url: `${data.baseUrl}${path}` };
}

/** Scoped metadata proves pending/consumed state, unchanged expiry and the accepted account locale. */
async function state(pool: Pool, organizationId: string, email: string) {
  const invitation = await pool.query<InvitationState>(
    'SELECT used_at, expires_at, locale FROM invitation_tokens WHERE organization_id = $1 AND email = $2',
    [organizationId, email],
  );
  const accounts = await pool.query<{ locale: string | null }>(
    'SELECT locale FROM users WHERE organization_id = $1 AND email = $2', [organizationId, email],
  );
  return { invitations: invitation.rows, accounts: accounts.rows };
}

/** Keep existing title branding while checking the exact heading and the real document language. */
async function presentation(page: Page, locale: string, title: string) {
  const actual = await browserAction('read localized presentation', async () => ({
    locale: await page.locator('html').getAttribute('lang'),
    heading: (await page.locator('h1').innerText()).trim(),
    title: await page.title(),
  }));
  expect(actual.locale === locale, 'Document language must follow the selected locale').toBe(true);
  expect(actual.heading === title, 'Page heading must use the exact translated copy').toBe(true);
  expect(actual.title.startsWith(title), 'Document title must use the translated page title').toBe(true);
}

/** One ordinary button click must produce a real POST with the intended fields and a server response. */
async function submit(page: Page, path: string, password: string, confirmation = password) {
  const response = await browserAction('submit the invitation form', async () => {
    await page.fill('#password', password);
    await page.fill('#confirmPassword', confirmation);
    const [posted] = await Promise.all([
      page.waitForResponse((candidate) => candidate.request().method() === 'POST' &&
        new URL(candidate.url()).pathname === path),
      page.click('button[type="submit"]'),
    ]);
    await page.waitForLoadState('networkidle');
    return posted;
  });
  const fields = new URLSearchParams(response.request().postData() ?? '');
  expect(response.request().method() === 'POST', 'The server must receive a POST').toBe(true);
  expect(fields.get('password') === password, 'The submitted password must reach the server').toBe(true);
  expect(fields.get('confirmPassword') === confirmation, 'The submitted confirmation must reach the server').toBe(true);
  expect(Boolean(fields.get('_csrf')), 'The ordinary form must retain its CSRF field').toBe(true);
  return response;
}

for (const journey of [
  {
    browser: 'fr-FR', locale: 'nl', confirmation: 'U bent uitgenodigd',
    form: 'Accepteer uw uitnodiging', success: 'Uw account is aangemaakt!',
  },
  {
    browser: 'en-US', locale: 'en', confirmation: "You've been invited",
    form: 'Accept your invitation', success: 'Account created!',
  },
] as const) {
  test.describe(`Invitation localization with browser ${journey.browser}`, () => {
    // This changes the real Chromium context, including its Accept-Language header.
    test.use({ locale: journey.browser });

    test('should localize the complete journey and preserve the stored Dutch account locale', async ({ page, testData, dbHelpers }) => {
      const pool = new Pool({ connectionString: TEST_DATABASE_URL });
      try {
        const invitation = await createInvitation(pool, dbHelpers, testData);
        const initial = await state(pool, invitation.organizationId, invitation.email);
        expect(initial.invitations).toHaveLength(1);
        expect(initial.invitations[0]).toMatchObject({ used_at: null, locale: 'nl' });
        expect(initial.accounts).toHaveLength(0);

        const opened = await browserAction('open invitation confirmation', () =>
          page.goto(invitation.url, { waitUntil: 'networkidle' }));
        expect(opened?.status()).toBe(200);
        expect(page.url() === invitation.url, 'Confirmation must retain the invitation destination').toBe(true);
        await presentation(page, journey.locale, journey.confirmation);
        expect(await state(pool, invitation.organizationId, invitation.email)).toEqual(initial);

        await browserAction('continue to password form', async () => {
          await page.click('a[href*="step=password"]');
          await page.waitForLoadState('networkidle');
        });
        await presentation(page, journey.locale, journey.form);
        const action = await browserAction('read form destination', () => page.locator('form').getAttribute('action'));
        expect(action?.includes(invitation.path), 'Form action must retain the same invitation token').toBe(true);
        expect(await state(pool, invitation.organizationId, invitation.email)).toEqual(initial);

        if (journey.locale === 'nl') {
          const mismatch = await submit(page, invitation.path, DEFAULT_TEST_PASSWORD, `${DEFAULT_TEST_PASSWORD}different`);
          const mismatchHtml = await browserAction('read mismatch response', () => mismatch.text());
          expect(mismatchHtml.includes('De wachtwoorden komen niet overeen')).toBe(true);
          expect(await browserAction('read mismatch message', () =>
            page.getByText('De wachtwoorden komen niet overeen', { exact: true }).isVisible())).toBe(true);
          await presentation(page, 'nl', journey.form);
          expect(await state(pool, invitation.organizationId, invitation.email)).toEqual(initial);

          // Only this deliberately invalid submission bypasses native minimum-length checking.
          await browserAction('remove only password minimum-length attributes', () =>
            page.locator('#password, #confirmPassword').evaluateAll((inputs) => {
              if (inputs.length !== 2) throw new Error('Expected both invitation password fields');
              for (const input of inputs) input.removeAttribute('minlength');
            }));
          const short = await submit(page, invitation.path, 'short!!');
          const shortHtml = await browserAction('read short-password response', () => short.text());
          expect(shortHtml.includes('Het wachtwoord moet minimaal 8 tekens bevatten')).toBe(true);
          expect(await browserAction('read short-password message', () =>
            page.getByText('Het wachtwoord moet minimaal 8 tekens bevatten', { exact: true }).isVisible())).toBe(true);
          await presentation(page, 'nl', journey.form);
          expect(await state(pool, invitation.organizationId, invitation.email)).toEqual(initial);
        }

        const accepted = await submit(page, invitation.path, DEFAULT_TEST_PASSWORD);
        expect(accepted.status()).toBe(200);
        await presentation(page, journey.locale, journey.success);
        if (journey.locale === 'nl') {
          expect(await browserAction('read invitation success message', () =>
            page.getByText('Uw uitnodiging is geaccepteerd.', { exact: true }).isVisible())).toBe(true);
        }
        const final = await state(pool, invitation.organizationId, invitation.email);
        expect(final.invitations).toHaveLength(1);
        expect(final.invitations[0].used_at instanceof Date).toBe(true);
        expect(final.invitations[0].expires_at).toEqual(initial.invitations[0].expires_at);
        expect(final.invitations[0].locale).toBe('nl');
        expect(final.accounts).toEqual([{ locale: 'nl' }]);
      } finally {
        await pool.end();
      }
    });
  });
}

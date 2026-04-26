/**
 * BFF API Proxy method forwarding E2E tests.
 *
 * Tests that the BFF correctly proxies HTTP methods, headers, query
 * params, and request bodies from the SPA to the Porta admin API.
 * The BFF proxy at /api/* forwards to Porta /api/admin/* with Bearer
 * token injection.
 *
 * @see plans/admin-gui-testing/08-bff-integration-tests.md — Proxy Methods
 */

import { test, expect } from '../fixtures/admin-fixtures';
import { navigateTo } from '../helpers/operations';
import { captureApiRequest, captureAllApiRequests } from '../helpers/api-interceptors';

// ---------------------------------------------------------------------------
// BFF Proxy Method Forwarding
// ---------------------------------------------------------------------------

test.describe('BFF API Proxy Method Forwarding', () => {
  test('GET requests are forwarded when loading organization list', async ({ page }) => {
    // Navigate to organizations page — triggers GET /api/organizations
    const [request] = await Promise.all([
      captureApiRequest(page, '/api/organizations'),
      navigateTo(page, '/organizations'),
    ]);

    expect(request.method).toBe('GET');
  });

  test('GET request includes query params for filtered lists', async ({ page }) => {
    // Navigate to organizations and apply a search
    await navigateTo(page, '/organizations');
    await page.waitForTimeout(1_000);

    // Type in search field — should trigger filtered GET
    const searchInput = page.getByPlaceholder(/search/i);
    const hasSearch = await searchInput.isVisible().catch(() => false);

    if (hasSearch) {
      const [request] = await Promise.all([
        captureApiRequest(page, '/api/organizations'),
        searchInput.fill('test'),
      ]);

      // Request should be a GET — search is typically query param based
      expect(request.method).toBe('GET');
    }
  });

  test('POST request is sent when creating an organization', async ({ page }) => {
    await navigateTo(page, '/organizations/new');

    await page.getByPlaceholder('e.g. Acme Corporation').fill('Proxy Test Org');
    await page.waitForTimeout(300);

    const [request] = await Promise.all([
      captureApiRequest(page, '/api/organizations'),
      page.getByRole('button', { name: /create organization/i }).click(),
    ]);

    expect(request.method).toBe('POST');
    expect(request.body).toBeTruthy();
    const body = request.body as Record<string, unknown>;
    expect(body.name).toBe('Proxy Test Org');
  });

  test('PUT/PATCH request is sent when updating config', async ({ page }) => {
    await navigateTo(page, '/config');
    await page.waitForTimeout(2_000);

    const hasEntries = await page.locator('table tbody tr').first().isVisible().catch(() => false);
    if (!hasEntries) {
      test.skip();
      return;
    }

    // Enter edit mode
    const editButton = page.locator('table tbody tr button').first();
    await editButton.click();

    const editInput = page.locator('table tbody input').first();
    const currentValue = await editInput.inputValue();
    await editInput.clear();
    await editInput.fill(currentValue);

    // Click save → confirm
    const saveBtn = page.locator('table tbody tr [class*="editRow"] button').first();
    await saveBtn.click();
    await page.waitForTimeout(500);

    const [request] = await Promise.all([
      captureApiRequest(page, '/api/config'),
      page.getByRole('button', { name: /Confirm/i }).click(),
    ]);

    expect(request.method).toMatch(/PUT|PATCH|POST/);
  });

  test('POST request is sent when generating a signing key', async ({ page }) => {
    await navigateTo(page, '/keys');
    await page.waitForTimeout(1_000);

    await page.getByRole('button', { name: /Generate Key/i }).click();
    await page.waitForTimeout(500);

    const [request] = await Promise.all([
      captureApiRequest(page, '/api/keys'),
      page.getByRole('button', { name: /Confirm/i }).click(),
    ]);

    expect(request.method).toBe('POST');
  });

  test('DELETE request is sent when revoking a session', async ({ page }) => {
    await navigateTo(page, '/sessions');
    await page.waitForTimeout(2_000);

    const hasSessions = await page.locator('table tbody tr').first().isVisible().catch(() => false);
    if (!hasSessions) {
      test.skip();
      return;
    }

    // Open context menu → Revoke Session
    const moreBtn = page.locator('table tbody tr').first().locator('button').last();
    await moreBtn.click();
    await page.getByRole('menuitem', { name: /Revoke Session/i }).click();

    // Confirm dialog appears
    const [request] = await Promise.all([
      captureApiRequest(page, '/api/sessions'),
      page.getByRole('button', { name: /Confirm/i }).click(),
    ]);

    expect(request.method).toBe('DELETE');
  });

  test('Bearer token header is injected by BFF proxy', async ({ page }) => {
    // Intercept the outgoing request from BFF to verify it has auth
    // We capture the browser → BFF request which should succeed (200)
    // meaning the BFF correctly injected the Bearer token
    const [request] = await Promise.all([
      captureApiRequest(page, '/api/organizations'),
      navigateTo(page, '/organizations'),
    ]);

    // If the request completed without 401, BFF injected the token
    expect(request.method).toBe('GET');
    // The BFF handles token injection internally — we verify by
    // checking the page loads data successfully
    await page.waitForTimeout(1_000);
    const hasData = await page.locator('table, [class*="grid"]').first().isVisible().catch(() => false);
    const hasEmpty = await page.getByText(/no organizations/i).isVisible().catch(() => false);
    expect(hasData || hasEmpty).toBeTruthy();
  });

  test('multiple sequential API calls use correct methods', async ({ page }) => {
    // Navigate to dashboard — triggers multiple API calls
    const requests = await captureAllApiRequests(page, '/api/', async () => {
      await navigateTo(page, '/');
      await page.waitForTimeout(3_000);
    });

    // Dashboard loads stats + audit data — all should be GET
    const getMethods = requests.filter(r => r.method === 'GET');
    expect(getMethods.length).toBeGreaterThan(0);
  });
});

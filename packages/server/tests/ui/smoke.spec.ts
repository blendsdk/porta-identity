/**
 * Smoke test — verifies the Playwright UI test infrastructure is working.
 *
 * This minimal spec confirms that:
 *   - Global setup started the Porta server successfully
 *   - The health endpoint is reachable via browser
 *   - Test fixtures (testData) are populated from environment variables
 *
 * Acts as a canary — if this test fails, the entire UI test infrastructure
 * is broken and no other specs should be trusted.
 */

import { test, expect } from './fixtures/test-fixtures.js';

test.describe('UI test infrastructure', () => {
  test('health endpoint is reachable', async ({ page, testData }) => {
    // Navigate to the health endpoint — should return 200 with JSON
    const response = await page.goto(`${testData.baseUrl}/health`);

    // Verify the server responded successfully
    expect(response).not.toBeNull();
    expect(response!.status()).toBe(200);
  });

  test('test data fixtures are populated', async ({ testData }) => {
    // Verify all required test data is present from global setup
    expect(testData.orgSlug).toBeTruthy();
    expect(testData.clientId).toBeTruthy();
    expect(testData.clientSecret).toBeTruthy();
    expect(testData.redirectUri).toBeTruthy();
    expect(testData.userEmail).toBeTruthy();
    expect(testData.userPassword).toBeTruthy();
    expect(testData.baseUrl).toContain('http://localhost:49200');
  });

  test('Phase 2 user fixtures are populated', async ({ testData }) => {
    // Verify additional user data for status/error state tests
    expect(testData.suspendedUserEmail).toBeTruthy();
    expect(testData.inactiveUserEmail).toBeTruthy();
    expect(testData.lockedUserEmail).toBeTruthy();
    expect(testData.lockableUserEmail).toBeTruthy();
    expect(testData.lockableUserPassword).toBeTruthy();
    expect(testData.invitedUserEmail).toBeTruthy();
    expect(testData.resettableUserEmail).toBeTruthy();
    expect(testData.resettableUserPassword).toBeTruthy();
    expect(testData.resettableUserId).toBeTruthy();
  });

  test('Phase 2 org fixtures are populated', async ({ testData }) => {
    // Verify additional org data for tenant isolation tests
    expect(testData.suspendedOrgSlug).toBe('suspended-org');
    expect(testData.archivedOrgSlug).toBe('archived-org');
  });
});

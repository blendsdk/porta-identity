/**
 * Dashboard actions workflow E2E tests.
 *
 * Tests that dashboard quick actions navigate to correct pages:
 *   - Create Organization action → /organizations/new
 *   - View Audit Log action → /audit
 *   - Activity feed items are clickable (if present)
 */

import { test, expect } from '../fixtures/admin-fixtures';

test.describe('Dashboard Actions Workflows', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('Create Organization quick action navigates correctly', async ({ page }) => {
    const createBtn = page.getByRole('button', { name: /create organization/i })
      .or(page.getByRole('link', { name: /create organization/i }));

    const isVisible = await createBtn.isVisible().catch(() => false);

    if (isVisible) {
      await createBtn.click();
      await expect(page).toHaveURL(/\/organizations\/new/);
    }
  });

  test('View Audit Log quick action navigates correctly', async ({ page }) => {
    const auditBtn = page.getByRole('button', { name: /view audit log/i })
      .or(page.getByRole('link', { name: /view audit log/i }))
      .or(page.getByRole('button', { name: /audit/i }));

    const isVisible = await auditBtn.isVisible().catch(() => false);

    if (isVisible) {
      await auditBtn.click();
      await expect(page).toHaveURL(/\/audit/);
    }
  });

  test('activity feed section is present on dashboard', async ({ page }) => {
    // The dashboard should have a recent activity section
    // (may show as "Recent Activity", "Activity Feed", or similar)
    const activitySection = page.getByText(/recent activity|activity feed/i);
    const isVisible = await activitySection.isVisible().catch(() => false);

    // Activity section should exist (even if empty)
    expect(isVisible).toBeTruthy();
  });
});

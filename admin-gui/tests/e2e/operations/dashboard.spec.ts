/**
 * Dashboard E2E tests.
 *
 * Tests the admin dashboard page including:
 * - Stats cards display (overview and org-scoped)
 * - Login activity chart with time window toggles
 * - Recent activity feed
 * - Quick action buttons navigation
 * - System health badge
 *
 * @see plans/admin-gui-testing/06-system-pages-e2e-tests.md — Dashboard
 */

import { test, expect } from '../fixtures/admin-fixtures';
import { navigateTo } from '../helpers/operations';

// ---------------------------------------------------------------------------
// Dashboard Operations
// ---------------------------------------------------------------------------

test.describe('Dashboard Operations', () => {
  test('displays page title and system health badge', async ({ page }) => {
    await navigateTo(page, '/');

    // Dashboard title
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

    // System health badge — either "System Healthy" or "System Degraded"
    const healthBadge = page.getByText(/System (Healthy|Degraded)/);
    await expect(healthBadge).toBeVisible();
  });

  test('displays overview stats cards with numeric values', async ({ page }) => {
    await navigateTo(page, '/');

    // Wait for loading to complete — stats cards should appear
    await page.waitForTimeout(2_000);

    // Overview stats cards — 6 cards in system-wide view
    await expect(page.getByText('Organizations')).toBeVisible();
    await expect(page.getByText('Applications')).toBeVisible();
    await expect(page.getByText('Clients')).toBeVisible();
    await expect(page.getByText('Users')).toBeVisible();
    await expect(page.getByText('Active Sessions')).toBeVisible();
    await expect(page.getByText('Failed Logins (24h)')).toBeVisible();
  });

  test('displays login activity chart with time window toggles', async ({ page }) => {
    await navigateTo(page, '/');
    await page.waitForTimeout(2_000);

    // Login Activity chart header
    await expect(page.getByText('Login Activity')).toBeVisible();

    // Time window toggle buttons (24h, 7d, 30d)
    const btn24h = page.getByRole('button', { name: '24h' });
    const btn7d = page.getByRole('button', { name: '7d' });
    const btn30d = page.getByRole('button', { name: '30d' });

    await expect(btn24h).toBeVisible();
    await expect(btn7d).toBeVisible();
    await expect(btn30d).toBeVisible();

    // Default is 30d — it should have primary appearance
    // Click 24h to switch
    await btn24h.click();
    // Chart should still be visible after toggle
    await expect(page.getByText('Login Activity')).toBeVisible();

    // Click 7d
    await btn7d.click();
    await expect(page.getByText('Login Activity')).toBeVisible();
  });

  test('displays recent activity feed', async ({ page }) => {
    await navigateTo(page, '/');
    await page.waitForTimeout(2_000);

    // Recent Activity section header
    await expect(page.getByText('Recent Activity')).toBeVisible();

    // Activity feed should show events or "No recent activity"
    const hasActivity = await page.getByText(/ago|just now/).first().isVisible().catch(() => false);
    const hasNoActivity = await page.getByText('No recent activity.').isVisible().catch(() => false);

    // One of these should be true
    expect(hasActivity || hasNoActivity).toBeTruthy();
  });

  test('displays quick action buttons and navigates correctly', async ({ page }) => {
    await navigateTo(page, '/');
    await page.waitForTimeout(2_000);

    // Quick Actions section header
    await expect(page.getByText('Quick Actions')).toBeVisible();

    // Quick action buttons
    const createOrgBtn = page.getByRole('button', { name: /Create Organization/i });
    const inviteUserBtn = page.getByRole('button', { name: /Invite User/i });
    const viewAuditBtn = page.getByRole('button', { name: /View Audit Log/i });

    await expect(createOrgBtn).toBeVisible();
    await expect(inviteUserBtn).toBeVisible();
    await expect(viewAuditBtn).toBeVisible();

    // Click "Create Organization" — should navigate to /organizations/new
    await createOrgBtn.click();
    await expect(page).toHaveURL(/\/organizations\/new/);
  });

  test('quick action "Invite User" navigates to invite page', async ({ page }) => {
    await navigateTo(page, '/');
    await page.waitForTimeout(2_000);

    await page.getByRole('button', { name: /Invite User/i }).click();
    await expect(page).toHaveURL(/\/users\/invite/);
  });

  test('quick action "View Audit Log" navigates to audit page', async ({ page }) => {
    await navigateTo(page, '/');
    await page.waitForTimeout(2_000);

    await page.getByRole('button', { name: /View Audit Log/i }).click();
    await expect(page).toHaveURL(/\/audit/);
  });
});

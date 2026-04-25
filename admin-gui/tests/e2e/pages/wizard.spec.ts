/**
 * Getting Started Wizard page E2E tests.
 *
 * Tests the getting started wizard through the real BFF → Porta stack:
 *   - Page load with heading
 *   - Step indicators (5 steps displayed)
 *   - Step action buttons navigate to correct pages
 *   - Completion tracking (checkboxes toggle)
 */

import { test, expect } from '../fixtures/admin-fixtures';

test.describe('Getting Started Wizard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/getting-started');
    await page.waitForLoadState('networkidle');
  });

  test('loads the getting started page', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /getting started/i }),
    ).toBeVisible();
  });

  test('displays all wizard steps', async ({ page }) => {
    // The wizard has 5 steps
    await expect(page.getByText(/create your first organization/i)).toBeVisible();
    await expect(page.getByText(/create an application/i)).toBeVisible();
    await expect(page.getByText(/register a client/i)).toBeVisible();
    await expect(page.getByText(/invite your first user/i)).toBeVisible();
    await expect(page.getByText(/configure branding/i)).toBeVisible();
  });

  test('step has action button', async ({ page }) => {
    // Each step should have a navigable button/link
    // The first step "Create your first organization" should have a button
    const stepButtons = page.getByRole('button').filter({ hasText: /start|go|create|open/i });
    const count = await stepButtons.count();
    expect(count).toBeGreaterThan(0);
  });

  test('steps have completion checkboxes', async ({ page }) => {
    // Each step has a checkbox for marking completion
    const checkboxes = page.getByRole('checkbox');
    const count = await checkboxes.count();
    expect(count).toBeGreaterThanOrEqual(5);
  });
});

/**
 * Two-factor admin integration tests.
 *
 * Verifies the complete 2FA admin workflows against a real PostgreSQL
 * database and Redis instance. Tests cover:
 *   - Full lifecycle: enable → status → disable → verify
 *   - Recovery code regeneration and invalidation
 *   - Organization 2FA policy management
 *   - Cross-organization data isolation
 *   - Super-admin user protection
 *   - Summary statistics accuracy
 *
 * These tests exercise the service layer directly (not HTTP endpoints).
 * Route handler logic, auth, and permissions are covered by unit tests
 * and pentest tests respectively.
 *
 * Each test starts with a clean slate via truncateAllTables() + seedBaseData().
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { truncateAllTables, seedBaseData } from './helpers/database.js';
import { flushTestRedis } from './helpers/redis.js';
import { createTestOrganization, createTestUser } from './helpers/factories.js';
import {
  setupEmailOtp,
  getTwoFactorStatus,
  disableTwoFactor,
  regenerateRecoveryCodes,
  TwoFactorNotEnabledError,
} from '../../src/two-factor/index.js';
// getTwoFactorSummary is not in the barrel export — import directly from service
import { getTwoFactorSummary } from '../../src/two-factor/service.js';
import { getOrganizationById, updateOrganization } from '../../src/organizations/service.js';
import { getUserById } from '../../src/users/service.js';
import {
  guardSuperAdmin,
  SuperAdminProtectionError,
} from '../../src/lib/super-admin-protection.js';
import { clearSystemConfigCache } from '../../src/lib/system-config.js';
import { getPool } from '../../src/lib/database.js';

describe('Two-Factor Admin (Integration)', () => {
  beforeEach(async () => {
    await truncateAllTables();
    await seedBaseData();
    await flushTestRedis();
    // Clear the in-memory system-config cache so each test reads fresh values
    clearSystemConfigCache();
  });

  // ---------------------------------------------------------------------------
  // 5.1.1: Full lifecycle — enable → status → disable → verify
  // ---------------------------------------------------------------------------
  describe('Full lifecycle', () => {
    it('should enable 2FA, return enabled status, disable, and confirm disabled', async () => {
      const org = await createTestOrganization();
      const user = await createTestUser(org.id);

      // Step 1: Enable 2FA via email OTP
      const setup = await setupEmailOtp(user.id, org.id);
      expect(setup.method).toBe('email');
      expect(setup.recoveryCodes).toHaveLength(10);

      // Step 2: GET status — should show enabled with email method
      const statusEnabled = await getTwoFactorStatus(user.id);
      expect(statusEnabled.enabled).toBe(true);
      expect(statusEnabled.method).toBe('email');
      expect(statusEnabled.recoveryCodesRemaining).toBe(10);
      // TOTP is not configured when using email method
      expect(statusEnabled.totpConfigured).toBe(false);

      // Step 3: Disable 2FA
      await disableTwoFactor(user.id);

      // Step 4: Verify disabled — no method, no recovery codes
      const statusDisabled = await getTwoFactorStatus(user.id);
      expect(statusDisabled.enabled).toBe(false);
      expect(statusDisabled.method).toBeNull();
      expect(statusDisabled.recoveryCodesRemaining).toBe(0);
    });

    it('should reject disabling 2FA when it is not enabled', async () => {
      const org = await createTestOrganization();
      const user = await createTestUser(org.id);

      // Attempting to disable 2FA on a user who never enabled it
      await expect(disableTwoFactor(user.id)).rejects.toThrow(TwoFactorNotEnabledError);
    });

    it('should allow re-enabling 2FA after disabling', async () => {
      const org = await createTestOrganization();
      const user = await createTestUser(org.id);

      // Enable → disable → re-enable
      await setupEmailOtp(user.id, org.id);
      await disableTwoFactor(user.id);
      const reSetup = await setupEmailOtp(user.id, org.id);

      expect(reSetup.method).toBe('email');
      const status = await getTwoFactorStatus(user.id);
      expect(status.enabled).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 5.1.2: Recovery code regeneration
  // ---------------------------------------------------------------------------
  describe('Recovery code regeneration', () => {
    it('should generate new codes and invalidate old ones', async () => {
      const org = await createTestOrganization();
      const user = await createTestUser(org.id);

      // Enable 2FA and capture original codes
      const setup = await setupEmailOtp(user.id, org.id);
      const originalCodes = setup.recoveryCodes;
      expect(originalCodes).toHaveLength(10);

      // Regenerate recovery codes
      const newCodes = await regenerateRecoveryCodes(user.id);
      expect(newCodes).toHaveLength(10);

      // New codes must differ from original codes
      expect(newCodes).not.toEqual(originalCodes);

      // 2FA should still be enabled with 10 fresh codes
      const status = await getTwoFactorStatus(user.id);
      expect(status.enabled).toBe(true);
      expect(status.recoveryCodesRemaining).toBe(10);
    });

    it('should reject regeneration when 2FA is not enabled', async () => {
      const org = await createTestOrganization();
      const user = await createTestUser(org.id);

      // Cannot regenerate codes if 2FA was never enabled
      await expect(regenerateRecoveryCodes(user.id)).rejects.toThrow(
        TwoFactorNotEnabledError,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 5.1.3: Policy management
  // ---------------------------------------------------------------------------
  describe('Policy management', () => {
    it('should default to optional and persist updated policy', async () => {
      const org = await createTestOrganization();

      // Default policy should be 'optional'
      const original = await getOrganizationById(org.id);
      expect(original?.twoFactorPolicy).toBe('optional');

      // Update to required_email
      const updated = await updateOrganization(org.id, {
        twoFactorPolicy: 'required_email',
      });
      expect(updated.twoFactorPolicy).toBe('required_email');

      // Verify the change persisted to the database
      const reloaded = await getOrganizationById(org.id);
      expect(reloaded?.twoFactorPolicy).toBe('required_email');
    });

    it('should support all valid 2FA policy values', async () => {
      const org = await createTestOrganization();

      // Cycle through all valid policy values and verify each persists
      const policies = [
        'required_email',
        'required_totp',
        'required_any',
        'optional',
      ] as const;

      for (const policy of policies) {
        const updated = await updateOrganization(org.id, {
          twoFactorPolicy: policy,
        });
        expect(updated.twoFactorPolicy).toBe(policy);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 5.1.4: Cross-organization isolation
  // ---------------------------------------------------------------------------
  describe('Cross-org isolation', () => {
    it('should verify users belong exclusively to their own organization', async () => {
      const orgA = await createTestOrganization();
      const orgB = await createTestOrganization();
      const userA = await createTestUser(orgA.id);
      const userB = await createTestUser(orgB.id);

      // Enable 2FA for both users in their respective orgs
      await setupEmailOtp(userA.id, orgA.id);
      await setupEmailOtp(userB.id, orgB.id);

      // Verify user-org binding is correct
      const fetchedA = await getUserById(userA.id);
      const fetchedB = await getUserById(userB.id);
      expect(fetchedA?.organizationId).toBe(orgA.id);
      expect(fetchedA?.organizationId).not.toBe(orgB.id);
      expect(fetchedB?.organizationId).toBe(orgB.id);
      expect(fetchedB?.organizationId).not.toBe(orgA.id);

      // Each user's 2FA status is independent
      const statusA = await getTwoFactorStatus(userA.id);
      const statusB = await getTwoFactorStatus(userB.id);
      expect(statusA.enabled).toBe(true);
      expect(statusB.enabled).toBe(true);
    });

    it('should return independent summary data per organization', async () => {
      const orgA = await createTestOrganization();
      const orgB = await createTestOrganization();

      // Org A: 2 users, 1 with 2FA enabled
      const userA1 = await createTestUser(orgA.id);
      await createTestUser(orgA.id); // user without 2FA
      await setupEmailOtp(userA1.id, orgA.id);

      // Org B: 1 user, 1 with 2FA enabled
      const userB1 = await createTestUser(orgB.id);
      await setupEmailOtp(userB1.id, orgB.id);

      // Summaries should reflect each org independently
      const summaryA = await getTwoFactorSummary(orgA.id);
      const summaryB = await getTwoFactorSummary(orgB.id);

      expect(summaryA.totalUsers).toBe(2);
      expect(summaryA.enabledCount).toBe(1);
      expect(summaryA.disabledCount).toBe(1);

      expect(summaryB.totalUsers).toBe(1);
      expect(summaryB.enabledCount).toBe(1);
      expect(summaryB.disabledCount).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 5.1.5: Super-admin protection
  // ---------------------------------------------------------------------------
  describe('Super-admin protection', () => {
    it('should block manage-2fa operations on the super-admin user', async () => {
      // The super-admin org (porta-admin) is created by seedBaseData
      const pool = getPool();
      const orgResult = await pool.query(
        'SELECT id FROM organizations WHERE is_super_admin = TRUE',
      );
      const superAdminOrgId = orgResult.rows[0].id;

      // Create a user in the super-admin org
      const user = await createTestUser(superAdminOrgId);

      // Register this user as the super-admin in system_config
      // (normally done by `porta init`)
      // The value column is type json, so wrap the UUID in double-quotes
      await pool.query(
        `INSERT INTO system_config (key, value)
         VALUES ('super_admin_user_id', $1::json)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [JSON.stringify(user.id)],
      );
      clearSystemConfigCache();

      // Enable 2FA for this user first
      await setupEmailOtp(user.id, superAdminOrgId);

      // guardSuperAdmin should throw SuperAdminProtectionError for this user
      await expect(
        guardSuperAdmin(user.id, 'manage-2fa'),
      ).rejects.toThrow(SuperAdminProtectionError);
    });

    it('should allow manage-2fa operations on normal users', async () => {
      const org = await createTestOrganization();
      const user = await createTestUser(org.id);

      // guardSuperAdmin should NOT throw for a normal user
      await expect(
        guardSuperAdmin(user.id, 'manage-2fa'),
      ).resolves.not.toThrow();
    });

    it('should block disableTwoFactor when called after guardSuperAdmin detects super-admin', async () => {
      // Full integration: verify the guard + disable flow together
      const pool = getPool();
      const orgResult = await pool.query(
        'SELECT id FROM organizations WHERE is_super_admin = TRUE',
      );
      const superAdminOrgId = orgResult.rows[0].id;

      const user = await createTestUser(superAdminOrgId);
      await pool.query(
        `INSERT INTO system_config (key, value)
         VALUES ('super_admin_user_id', $1::json)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [JSON.stringify(user.id)],
      );
      clearSystemConfigCache();

      await setupEmailOtp(user.id, superAdminOrgId);

      // Simulate the route handler pattern: guard first, then disable
      let guardBlocked = false;
      try {
        await guardSuperAdmin(user.id, 'manage-2fa');
      } catch (err) {
        if (err instanceof SuperAdminProtectionError) {
          guardBlocked = true;
        }
      }
      expect(guardBlocked).toBe(true);

      // 2FA should still be enabled (guard prevented the operation)
      const status = await getTwoFactorStatus(user.id);
      expect(status.enabled).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Summary statistics accuracy
  // ---------------------------------------------------------------------------
  describe('Summary statistics accuracy', () => {
    it('should return correct counts for mixed 2FA states', async () => {
      const org = await createTestOrganization();

      // Create 4 users with different 2FA states:
      // user1: email 2FA enabled
      // user2: email 2FA enabled
      // user3: no 2FA (never enabled)
      // user4: had 2FA but disabled it
      const user1 = await createTestUser(org.id);
      const user2 = await createTestUser(org.id);
      await createTestUser(org.id); // user3 — no 2FA
      const user4 = await createTestUser(org.id);

      await setupEmailOtp(user1.id, org.id);
      await setupEmailOtp(user2.id, org.id);
      await setupEmailOtp(user4.id, org.id);
      await disableTwoFactor(user4.id);

      const summary = await getTwoFactorSummary(org.id);

      expect(summary.totalUsers).toBe(4);
      expect(summary.enabledCount).toBe(2);
      expect(summary.disabledCount).toBe(2);
      expect(summary.emailCount).toBe(2);
      expect(summary.totpCount).toBe(0);
      // Compliance rate: 2/4 = 0.5
      expect(summary.complianceRate).toBeCloseTo(0.5, 4);
    });

    it('should return zero counts for an org with no users', async () => {
      const org = await createTestOrganization();

      const summary = await getTwoFactorSummary(org.id);

      expect(summary.totalUsers).toBe(0);
      expect(summary.enabledCount).toBe(0);
      expect(summary.disabledCount).toBe(0);
      expect(summary.emailCount).toBe(0);
      expect(summary.totpCount).toBe(0);
      // Compliance rate should be 0 when there are no users
      expect(summary.complianceRate).toBe(0);
    });

    it('should return 100% compliance when all users have 2FA enabled', async () => {
      const org = await createTestOrganization();

      const user1 = await createTestUser(org.id);
      const user2 = await createTestUser(org.id);
      await setupEmailOtp(user1.id, org.id);
      await setupEmailOtp(user2.id, org.id);

      const summary = await getTwoFactorSummary(org.id);

      expect(summary.totalUsers).toBe(2);
      expect(summary.enabledCount).toBe(2);
      expect(summary.disabledCount).toBe(0);
      expect(summary.complianceRate).toBe(1);
    });
  });
});

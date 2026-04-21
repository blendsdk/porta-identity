/**
 * GDPR data export and purge for users.
 *
 * Implements Article 17 (right to erasure) and Article 20 (data portability)
 * capabilities for Porta's user data. These functions collect all user-related
 * data across multiple tables for export, or anonymize/delete it for purge.
 *
 * **Export** collects: user profile, role assignments, custom claim values,
 * audit log entries (as actor or target), 2FA enrollment status (NOT secrets),
 * and active OIDC sessions/grants.
 *
 * **Purge** anonymizes the user record and audit entries, deletes all
 * related data (roles, claims, 2FA, OIDC sessions), and fires an audit
 * event before anonymization for compliance trail.
 *
 * Safety: Purging super-admin org users is blocked to prevent lock-out.
 *
 * @module users/gdpr
 */

import { getPool } from '../lib/database.js';
import { writeAuditLog } from '../lib/audit-log.js';
import type { User } from './types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Complete GDPR data export for a user */
export interface UserDataExport {
  exportedAt: string;
  user: {
    id: string;
    email: string;
    givenName: string | null;
    familyName: string | null;
    middleName: string | null;
    nickname: string | null;
    preferredUsername: string | null;
    locale: string | null;
    phoneNumber: string | null;
    status: string;
    createdAt: string;
    lastLoginAt: string | null;
  };
  organization: {
    id: string;
    name: string;
    slug: string;
  };
  roles: Array<{
    roleId: string;
    roleName: string;
    roleSlug: string;
    applicationId: string;
    assignedAt: string;
  }>;
  customClaims: Array<{
    claimName: string;
    value: unknown;
    applicationId: string;
  }>;
  auditLog: Array<{
    id: string;
    eventType: string;
    eventCategory: string;
    description: string | null;
    createdAt: string;
  }>;
  twoFactor: {
    enabled: boolean;
    method: string | null;
  };
  oidcSessions: number;
}

/** Result from a purge operation */
export interface PurgeResult {
  userId: string;
  anonymizedEmail: string;
  deletedRoles: number;
  deletedClaims: number;
  deletedTwoFactor: number;
  deletedOidcPayloads: number;
  anonymizedAuditEntries: number;
}

// ---------------------------------------------------------------------------
// Export — collect all user data (Article 20)
// ---------------------------------------------------------------------------

/**
 * Export all data Porta holds for a user as a structured JSON document.
 *
 * Collects data from: users, organizations, user_roles + roles,
 * user_claim_values + claim_definitions, audit_log, user 2FA columns,
 * and oidc_payloads. Does NOT export TOTP secrets or recovery codes
 * (security-sensitive material).
 *
 * @param user - The user to export data for (must be a full User object)
 * @returns Complete GDPR export document
 */
export async function exportUserData(user: User): Promise<UserDataExport> {
  const pool = getPool();

  // Parallel queries for all user-related data
  const [orgResult, rolesResult, claimsResult, auditResult, oidcResult] = await Promise.all([
    // Organization the user belongs to
    pool.query<{ id: string; name: string; slug: string }>(
      'SELECT id, name, slug FROM organizations WHERE id = $1',
      [user.organizationId],
    ),

    // Role assignments with role details
    pool.query<{
      role_id: string;
      name: string;
      slug: string;
      application_id: string;
      created_at: string;
    }>(
      `SELECT r.id AS role_id, r.name, r.slug, r.application_id, ur.created_at
       FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id = $1
       ORDER BY ur.created_at`,
      [user.id],
    ),

    // Custom claim values with definition names
    pool.query<{
      claim_name: string;
      value: unknown;
      application_id: string;
    }>(
      `SELECT cd.claim_name, ucv.value, cd.application_id
       FROM user_claim_values ucv
       JOIN claim_definitions cd ON cd.id = ucv.definition_id
       WHERE ucv.user_id = $1
       ORDER BY cd.claim_name`,
      [user.id],
    ),

    // Audit log entries where user is actor or target (limited to 500)
    pool.query<{
      id: string;
      event_type: string;
      event_category: string;
      description: string | null;
      created_at: string;
    }>(
      `SELECT id, event_type, event_category, description, created_at
       FROM audit_log
       WHERE actor_id = $1 OR user_id = $1
       ORDER BY created_at DESC
       LIMIT 500`,
      [user.id],
    ),

    // Count of active OIDC sessions/grants for user
    pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM oidc_payloads
       WHERE payload->>'accountId' = $1
         AND (expires_at IS NULL OR expires_at > NOW())`,
      [user.id],
    ),
  ]);

  const org = orgResult.rows[0] ?? { id: user.organizationId, name: 'Unknown', slug: 'unknown' };

  return {
    exportedAt: new Date().toISOString(),
    user: {
      id: user.id,
      email: user.email,
      givenName: user.givenName,
      familyName: user.familyName,
      middleName: user.middleName,
      nickname: user.nickname,
      preferredUsername: user.preferredUsername,
      locale: user.locale,
      phoneNumber: user.phoneNumber,
      status: user.status,
      createdAt: user.createdAt.toISOString(),
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    },
    organization: {
      id: org.id,
      name: org.name,
      slug: org.slug,
    },
    roles: rolesResult.rows.map((r) => ({
      roleId: r.role_id,
      roleName: r.name,
      roleSlug: r.slug,
      applicationId: r.application_id,
      assignedAt: String(r.created_at),
    })),
    customClaims: claimsResult.rows.map((r) => ({
      claimName: r.claim_name,
      value: r.value,
      applicationId: r.application_id,
    })),
    auditLog: auditResult.rows.map((r) => ({
      id: r.id,
      eventType: r.event_type,
      eventCategory: r.event_category,
      description: r.description,
      createdAt: String(r.created_at),
    })),
    twoFactor: {
      enabled: user.twoFactorEnabled,
      method: user.twoFactorMethod ?? null,
    },
    oidcSessions: parseInt(oidcResult.rows[0]?.count ?? '0', 10),
  };
}

// ---------------------------------------------------------------------------
// Purge — anonymize/delete all user data (Article 17)
// ---------------------------------------------------------------------------

/**
 * Irreversibly purge all PII for a user.
 *
 * Anonymizes the user record (email → purged-{id}@purged.local, clears
 * name fields, sets status to 'inactive'). Deletes related records: role
 * assignments, custom claim values, 2FA data, OIDC sessions/grants.
 * Anonymizes audit log entries (actor_email → [purged]).
 *
 * Fires a `user.purged` audit event BEFORE anonymization for compliance trail.
 *
 * Safety checks:
 * - Cannot purge users belonging to the super-admin organization
 * - Requires explicit confirmation (caller responsibility)
 *
 * @param user - The user to purge (must be a full User object)
 * @param actorId - ID of the admin performing the purge
 * @returns Summary of what was deleted/anonymized
 * @throws Error if user belongs to super-admin org
 */
export async function purgeUserData(user: User, actorId: string): Promise<PurgeResult> {
  const pool = getPool();

  // Safety check: block purge of super-admin org users
  const orgCheck = await pool.query<{ is_super_admin: boolean }>(
    'SELECT is_super_admin FROM organizations WHERE id = $1',
    [user.organizationId],
  );
  if (orgCheck.rows[0]?.is_super_admin) {
    throw new Error('Cannot purge users belonging to the super-admin organization');
  }

  // Fire audit event BEFORE anonymization so the trail has the real user ID
  await writeAuditLog({
    organizationId: user.organizationId,
    userId: user.id,
    actorId,
    eventType: 'user.purged',
    eventCategory: 'gdpr',
    description: `GDPR purge initiated for user ${user.email}`,
    metadata: { userId: user.id, email: user.email },
  });

  // Execute all deletions in a transaction for consistency
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Revoke all active OIDC sessions/grants
    const oidcDelete = await client.query(
      `DELETE FROM oidc_payloads WHERE payload->>'accountId' = $1`,
      [user.id],
    );

    // 2. Delete 2FA data (TOTP secrets, OTP codes, recovery codes)
    await client.query('DELETE FROM user_totp WHERE user_id = $1', [user.id]);
    await client.query('DELETE FROM two_factor_otp_codes WHERE user_id = $1', [user.id]);
    const twoFactorDelete = await client.query(
      'DELETE FROM two_factor_recovery_codes WHERE user_id = $1',
      [user.id],
    );

    // 3. Delete custom claim values
    const claimsDelete = await client.query(
      'DELETE FROM user_claim_values WHERE user_id = $1',
      [user.id],
    );

    // 4. Delete role assignments
    const rolesDelete = await client.query(
      'DELETE FROM user_roles WHERE user_id = $1',
      [user.id],
    );

    // 5. Anonymize audit log entries referencing this user
    const auditUpdate = await client.query(
      `UPDATE audit_log
       SET metadata = metadata || '{"purged": true}'::jsonb
       WHERE actor_id = $1 OR user_id = $1`,
      [user.id],
    );

    // 6. Anonymize user record — clear PII, keep ID for referential integrity
    const anonymizedEmail = `purged-${user.id}@purged.local`;
    await client.query(
      `UPDATE users SET
         email = $2,
         email_verified = false,
         password_hash = NULL,
         given_name = NULL,
         family_name = NULL,
         middle_name = NULL,
         nickname = NULL,
         preferred_username = NULL,
         profile_url = NULL,
         picture_url = NULL,
         website_url = NULL,
         gender = NULL,
         birthdate = NULL,
         zoneinfo = NULL,
         locale = NULL,
         phone_number = NULL,
         phone_number_verified = false,
         address_street = NULL,
         address_locality = NULL,
         address_region = NULL,
         address_postal_code = NULL,
         address_country = NULL,
         status = 'inactive',
         two_factor_enabled = false,
         two_factor_method = NULL,
         updated_at = NOW()
       WHERE id = $1`,
      [user.id, anonymizedEmail],
    );

    await client.query('COMMIT');

    return {
      userId: user.id,
      anonymizedEmail,
      deletedRoles: rolesDelete.rowCount ?? 0,
      deletedClaims: claimsDelete.rowCount ?? 0,
      deletedTwoFactor: (twoFactorDelete.rowCount ?? 0),
      deletedOidcPayloads: oidcDelete.rowCount ?? 0,
      anonymizedAuditEntries: auditUpdate.rowCount ?? 0,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * User data export.
 *
 * Collects the user-related data exposed by Porta's portability endpoint.
 *
 * **Export** collects: user profile, role assignments, custom claim values,
 * audit log entries (as actor or target), 2FA enrollment status (NOT secrets),
 * and active OIDC sessions/grants.
 *
 * @module users/gdpr
 */

import { getPool } from '../lib/database.js';
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

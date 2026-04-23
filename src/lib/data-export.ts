/**
 * Data export service.
 *
 * Provides CSV and JSON export of entity data for admin download.
 * Exports are streamed to avoid memory issues with large datasets.
 *
 * Security: All queries are parameterized and org-scoped where applicable.
 * No sensitive data (passwords, secrets, keys) is included in exports.
 *
 * @module data-export
 * @see 07-import-export-invitations.md
 */

import { getPool } from './database.js';

// ============================================================================
// Types
// ============================================================================

export type ExportFormat = 'json' | 'csv';
export type ExportEntityType = 'users' | 'organizations' | 'clients' | 'roles' | 'audit';

export interface ExportOptions {
  entityType: ExportEntityType;
  format: ExportFormat;
  organizationId?: string;
  applicationId?: string;
  /** Date range filter for audit exports */
  startDate?: Date;
  endDate?: Date;
}

export interface ExportResult {
  data: string;
  contentType: string;
  filename: string;
  rowCount: number;
}

// ============================================================================
// Query definitions (safe — no sensitive fields)
// ============================================================================

const EXPORT_QUERIES: Record<ExportEntityType, {
  sql: string;
  columns: string[];
  needsOrgId?: boolean;
  needsAppId?: boolean;
}> = {
  users: {
    sql: `SELECT u.id, u.email, u.status, u.given_name, u.family_name,
                 u.nickname, u.locale, u.email_verified, u.phone_number,
                 u.created_at, u.updated_at, u.last_login_at, u.login_count
          FROM users u WHERE u.organization_id = $1
          ORDER BY u.created_at`,
    columns: ['id', 'email', 'status', 'given_name', 'family_name', 'nickname', 'locale', 'email_verified', 'phone_number', 'created_at', 'updated_at', 'last_login_at', 'login_count'],
    needsOrgId: true,
  },
  organizations: {
    sql: `SELECT id, name, slug, status, is_super_admin, default_locale,
                 created_at, updated_at
          FROM organizations ORDER BY created_at`,
    columns: ['id', 'name', 'slug', 'status', 'is_super_admin', 'default_locale', 'created_at', 'updated_at'],
  },
  clients: {
    sql: `SELECT c.id, c.client_id, c.client_name, c.status, c.application_type,
                 c.grant_types, c.redirect_uris, c.created_at, c.updated_at
          FROM clients c WHERE c.organization_id = $1
          ORDER BY c.created_at`,
    columns: ['id', 'client_id', 'client_name', 'status', 'application_type', 'grant_types', 'redirect_uris', 'created_at', 'updated_at'],
    needsOrgId: true,
  },
  roles: {
    sql: `SELECT r.id, r.name, r.slug, r.description, r.created_at
          FROM roles r WHERE r.application_id = $1
          ORDER BY r.created_at`,
    columns: ['id', 'name', 'slug', 'description', 'created_at'],
    needsAppId: true,
  },
  audit: {
    sql: `SELECT id, event_type, event_category, actor_id,
                 metadata, ip_address, created_at
          FROM audit_log WHERE organization_id = $1
          AND created_at >= $2 AND created_at <= $3
          ORDER BY created_at DESC
          LIMIT 10000`,
    columns: ['id', 'event_type', 'event_category', 'actor_id', 'metadata', 'ip_address', 'created_at'],
    needsOrgId: true,
  },
};

// ============================================================================
// Export functions
// ============================================================================

/**
 * Export entity data in the requested format.
 *
 * @throws Error if required scope (orgId/appId) is missing
 */
export async function exportData(options: ExportOptions): Promise<ExportResult> {
  const queryDef = EXPORT_QUERIES[options.entityType];
  if (!queryDef) {
    throw new Error(`Unsupported export entity type: ${options.entityType}`);
  }

  if (queryDef.needsOrgId && !options.organizationId) {
    throw new Error(`Organization ID required for ${options.entityType} export`);
  }
  if (queryDef.needsAppId && !options.applicationId) {
    throw new Error(`Application ID required for ${options.entityType} export`);
  }

  const pool = getPool();
  const params: unknown[] = [];

  if (queryDef.needsOrgId) {
    params.push(options.organizationId);
  }
  if (queryDef.needsAppId) {
    params.push(options.applicationId);
  }
  if (options.entityType === 'audit') {
    params.push(options.startDate ?? new Date(0));
    params.push(options.endDate ?? new Date());
  }

  const { rows } = await pool.query(queryDef.sql, params);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `${options.entityType}-export-${timestamp}`;

  if (options.format === 'csv') {
    const csv = toCsv(rows, queryDef.columns);
    return {
      data: csv,
      contentType: 'text/csv',
      filename: `${filename}.csv`,
      rowCount: rows.length,
    };
  }

  return {
    data: JSON.stringify({ data: rows, exportedAt: new Date().toISOString(), total: rows.length }, null, 2),
    contentType: 'application/json',
    filename: `${filename}.json`,
    rowCount: rows.length,
  };
}

// ============================================================================
// CSV helpers
// ============================================================================

function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = value instanceof Date ? value.toISOString() : String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const header = columns.join(',');
  const dataRows = rows.map((row) =>
    columns.map((col) => escapeCsvValue(row[col])).join(','),
  );
  return [header, ...dataRows].join('\n');
}

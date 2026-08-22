/**
 * Bounded administrative data export.
 *
 * Every query selects an explicit public field list, reads one row beyond the public limit, and
 * writes a content-free audit record in the same repeatable-read transaction. CSV output is
 * neutralized before quoting so spreadsheet applications cannot execute imported formulas.
 */

import type { PoolClient } from 'pg';
import { getPool } from './database.js';

/** Closed serialization formats accepted by the export service. */
export type ExportFormat = 'json' | 'csv';

/** Closed entity catalog accepted by the export service. */
export type ExportEntityType = 'users' | 'organizations' | 'clients' | 'roles' | 'audit';

/** Maximum number of rows returned by one export. */
export const MAXIMUM_EXPORT_ROWS = 10_000;

/** Input for one authorized administrative export. */
export interface ExportOptions {
  /** Entity catalog to serialize. */
  entityType: ExportEntityType;
  /** Public output representation. */
  format: ExportFormat;
  /** Exact tenant scope for tenant-owned data. */
  organizationId?: string;
  /** Exact application relationship required for role data. */
  applicationId?: string;
  /** Inclusive audit-window start. */
  startDate?: Date;
  /** Inclusive audit-window end. */
  endDate?: Date;
  /** Authenticated administrator recorded without export content. */
  actorId?: string;
}

/** Serialized export admitted after scope, bound, and audit checks. */
export interface ExportResult {
  /** Complete serialized document. */
  data: string;
  /** Public response media type. */
  contentType: string;
  /** Attachment filename without user-controlled input. */
  filename: string;
  /** Exact number of exported rows. */
  rowCount: number;
}

/** Stable public export failures. */
export type ExportFailureCode =
  'export_scope_required' | 'export_invalid_range' | 'export_too_large' | 'export_failed';

/** Minimal export failure which never retains query or row diagnostics. */
export class ExportOperationError extends Error {
  /** Stable public failure discriminator. */
  public readonly code: ExportFailureCode;

  /** Recommended HTTP status. */
  public readonly status: 400 | 413 | 503;

  /**
   * Create a closed export failure.
   *
   * @param code - Stable public failure discriminator.
   * @param status - Recommended route status.
   */
  public constructor(code: ExportFailureCode, status: 400 | 413 | 503) {
    super('Export request could not be completed');
    this.name = 'ExportOperationError';
    this.code = code;
    this.status = status;
  }
}

/** One closed parameterized query and its exact public columns. */
interface ExportQueryDefinition {
  readonly sql: string;
  readonly columns: readonly string[];
  readonly requiredScope: 'none' | 'organization' | 'organization-and-application' | 'audit';
}

const EXPORT_QUERIES: Readonly<Record<ExportEntityType, ExportQueryDefinition>> = Object.freeze({
  users: {
    sql: `SELECT u.id, u.email, u.status, u.given_name, u.family_name, u.nickname, u.locale,
                 u.email_verified, u.phone_number, u.created_at, u.updated_at, u.last_login_at,
                 u.login_count
          FROM users u WHERE u.organization_id = $1
          ORDER BY u.created_at LIMIT 10001`,
    columns: [
      'id',
      'email',
      'status',
      'given_name',
      'family_name',
      'nickname',
      'locale',
      'email_verified',
      'phone_number',
      'created_at',
      'updated_at',
      'last_login_at',
      'login_count',
    ],
    requiredScope: 'organization',
  },
  organizations: {
    sql: `SELECT id, name, slug, status, is_super_admin, default_locale, created_at, updated_at
          FROM organizations ORDER BY created_at LIMIT 10001`,
    columns: [
      'id',
      'name',
      'slug',
      'status',
      'is_super_admin',
      'default_locale',
      'created_at',
      'updated_at',
    ],
    requiredScope: 'none',
  },
  clients: {
    sql: `SELECT c.id, c.client_id, c.client_name, c.client_type, c.status,
                 c.application_type, c.grant_types, c.redirect_uris, c.created_at, c.updated_at
          FROM clients c WHERE c.organization_id = $1
          ORDER BY c.created_at LIMIT 10001`,
    columns: [
      'id',
      'client_id',
      'client_name',
      'client_type',
      'status',
      'application_type',
      'grant_types',
      'redirect_uris',
      'created_at',
      'updated_at',
    ],
    requiredScope: 'organization',
  },
  roles: {
    sql: `SELECT r.id, r.name, r.slug, r.description, r.created_at
          FROM roles r
          WHERE r.application_id = $2
            AND EXISTS (
              SELECT 1 FROM clients c
              WHERE c.application_id = r.application_id AND c.organization_id = $1
            )
          ORDER BY r.created_at LIMIT 10001`,
    columns: ['id', 'name', 'slug', 'description', 'created_at'],
    requiredScope: 'organization-and-application',
  },
  audit: {
    sql: `SELECT id, event_type, event_category, actor_id, metadata, created_at
          FROM audit_log
          WHERE organization_id = $1 AND created_at >= $2 AND created_at <= $3
          ORDER BY created_at DESC LIMIT 10001`,
    columns: ['id', 'event_type', 'event_category', 'actor_id', 'created_at', 'safe_details'],
    requiredScope: 'audit',
  },
});

/** Metadata fields safe to disclose for explicitly recognized event types. */
const SAFE_AUDIT_DETAIL_FIELDS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  'admin.import': ['mode', 'manifestVersion', 'manifestDigest', 'created', 'updated', 'skipped'],
  'admin.export': ['entityType', 'format', 'rowCount'],
});

/** Validate scope requirements and return the query parameters in SQL order. */
function exportParameters(options: ExportOptions, definition: ExportQueryDefinition): unknown[] {
  if (definition.requiredScope !== 'none' && options.organizationId === undefined) {
    throw new ExportOperationError('export_scope_required', 400);
  }
  if (
    definition.requiredScope === 'organization-and-application' &&
    options.applicationId === undefined
  ) {
    throw new ExportOperationError('export_scope_required', 400);
  }
  if (definition.requiredScope === 'audit') {
    if (options.startDate === undefined || options.endDate === undefined) {
      throw new ExportOperationError('export_scope_required', 400);
    }
    if (options.startDate.getTime() > options.endDate.getTime()) {
      throw new ExportOperationError('export_invalid_range', 400);
    }
    return [options.organizationId, options.startDate, options.endDate];
  }
  if (definition.requiredScope === 'organization-and-application') {
    return [options.organizationId, options.applicationId];
  }
  return definition.requiredScope === 'organization' ? [options.organizationId] : [];
}

/** Copy only event-specific safe details from one audit metadata object. */
function safeAuditDetails(eventType: string, metadata: unknown): Readonly<Record<string, unknown>> {
  if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) return {};
  const entries = new Map(Object.entries(metadata));
  const safe: Record<string, unknown> = {};
  for (const field of SAFE_AUDIT_DETAIL_FIELDS[eventType] ?? []) {
    const value = entries.get(field);
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      value === null
    ) {
      safe[field] = value;
    }
  }
  return safe;
}

/** Replace private audit metadata with the closed event-specific safe-detail object. */
function sanitizeRows(
  entityType: ExportEntityType,
  rows: readonly Record<string, unknown>[],
): Record<string, unknown>[] {
  if (entityType !== 'audit') return rows.map((row) => ({ ...row }));
  return rows.map((row) => ({
    id: row.id,
    event_type: row.event_type,
    event_category: row.event_category,
    actor_id: row.actor_id,
    created_at: row.created_at,
    safe_details:
      typeof row.event_type === 'string' ? safeAuditDetails(row.event_type, row.metadata) : {},
  }));
}

/** Write one content-free audit row through the export transaction. */
async function writeExportAudit(
  client: PoolClient,
  options: ExportOptions,
  rowCount: number,
): Promise<void> {
  if (options.actorId === undefined) return;
  await client.query(
    `INSERT INTO audit_log (
       organization_id, actor_id, event_type, event_category, metadata
     ) VALUES ($1, $2, 'admin.export', 'admin', $3)`,
    [
      options.organizationId ?? null,
      options.actorId,
      JSON.stringify({ entityType: options.entityType, format: options.format, rowCount }),
    ],
  );
}

/** Prove that the requested application participates in the requested tenant before role access. */
async function requireRoleRelationship(client: PoolClient, options: ExportOptions): Promise<void> {
  if (options.entityType !== 'roles') return;
  const relationship = await client.query(
    `SELECT 1 FROM clients
     WHERE organization_id = $1 AND application_id = $2
     LIMIT 1`,
    [options.organizationId, options.applicationId],
  );
  if (relationship.rowCount !== 1) {
    throw new ExportOperationError('export_scope_required', 400);
  }
}

/**
 * Export one authorized entity set through a bounded repeatable-read transaction.
 *
 * @param options - Exact entity, representation, scope, and actor.
 * @returns Complete serialized export and exact row count.
 * @throws ExportOperationError when scope is incomplete, the bound is exceeded, or persistence
 * fails.
 */
export async function exportData(options: ExportOptions): Promise<ExportResult> {
  const definition = EXPORT_QUERIES[options.entityType];
  const parameters = exportParameters(options, definition);
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
    await requireRoleRelationship(client, options);
    const queryResult = await client.query(definition.sql, parameters);
    if (queryResult.rows.length > MAXIMUM_EXPORT_ROWS) {
      throw new ExportOperationError('export_too_large', 413);
    }
    const rows = sanitizeRows(options.entityType, queryResult.rows);
    await writeExportAudit(client, options, rows.length);
    await client.query('COMMIT');

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `${options.entityType}-export-${timestamp}`;
    if (options.format === 'csv') {
      return {
        data: toCsv(rows, definition.columns),
        contentType: 'text/csv',
        filename: `${filename}.csv`,
        rowCount: rows.length,
      };
    }
    return {
      data: JSON.stringify(
        { data: rows, exportedAt: new Date().toISOString(), total: rows.length },
        null,
        2,
      ),
      contentType: 'application/json',
      filename: `${filename}.json`,
      rowCount: rows.length,
    };
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // The original error remains authoritative; releasing the connection handles cleanup.
    }
    throw error instanceof ExportOperationError
      ? error
      : new ExportOperationError('export_failed', 503);
  } finally {
    client.release();
  }
}

/** Prefix spreadsheet formula input after leading whitespace with an inert apostrophe. */
function neutralizeFormula(value: string): string {
  const firstContent = value.search(/\S/);
  if (firstContent === -1 || !['=', '+', '-', '@'].includes(value[firstContent])) return value;
  return `${value.slice(0, firstContent)}'${value.slice(firstContent)}`;
}

/** Serialize one CSV cell after formula neutralization and RFC-compatible quote escaping. */
function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  const source = value instanceof Date ? value.toISOString() : String(value);
  const safe = neutralizeFormula(source);
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Serialize rows using one exact ordered public column list. */
function toCsv(rows: readonly Record<string, unknown>[], columns: readonly string[]): string {
  const dataRows = rows.map((row) =>
    columns.map((column) => escapeCsvValue(row[column])).join(','),
  );
  return [columns.join(','), ...dataRows].join('\r\n');
}

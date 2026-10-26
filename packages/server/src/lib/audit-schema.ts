import type { Pool } from 'pg';

import { getPool } from './database.js';

/** Columns and constraint required by the current transactional audit writer. */
const REQUIRED_AUDIT_COLUMNS = [
  'actor_type',
  'actor_client_id',
  'actor_client_name',
] as const;

/** Query surface needed to inspect the live PostgreSQL schema. */
type AuditSchemaQueryable = Pick<Pool, 'query'>;

/** Schema facts used to decide whether the audit writer can run safely. */
export interface AuditSchemaMetadata {
  /** Required column names mapped to PostgreSQL `is_nullable` values. */
  readonly columns: ReadonlyMap<string, string>;
  /** Whether the actor-shape check constraint is present. */
  readonly hasShapeConstraint: boolean;
}

/** Safe startup error raised when the audit schema is older than the running server build. */
export class AuditSchemaError extends Error {
  /** Stable machine-readable code for startup diagnostics. */
  readonly code = 'audit_schema_outdated';

  constructor() {
    super(
      'Audit schema is not current; apply pending database migrations before starting Porta',
    );
    this.name = 'AuditSchemaError';
  }
}

/**
 * Reject schema metadata that cannot support transactional administrative audit writes.
 *
 * The check is intentionally fail-closed. Weakening the actor columns or the shape constraint would
 * allow unattributed administrative mutations, so the server must stop instead of serving with an
 * incompatible schema.
 *
 * @param metadata Live or test schema facts.
 * @throws {AuditSchemaError} When any required column, nullability, or constraint is missing.
 */
export function assertAuditSchemaMetadata(metadata: AuditSchemaMetadata): void {
  const missingColumn = REQUIRED_AUDIT_COLUMNS.some((column) => !metadata.columns.has(column));
  const nullableActorType = metadata.columns.get('actor_type') !== 'NO';

  if (missingColumn || nullableActorType || !metadata.hasShapeConstraint) {
    throw new AuditSchemaError();
  }
}

/**
 * Verify the live audit schema before the server accepts requests.
 *
 * The guard runs after PostgreSQL connectivity and before the HTTP listener starts. A missing
 * migration therefore fails deployment health instead of surfacing later as a generic admin-write
 * outage.
 *
 * @param queryable PostgreSQL pool or a compatible query surface.
 * @throws {AuditSchemaError} When the audit schema is not current or cannot be inspected.
 */
export async function assertAuditSchema(
  queryable: AuditSchemaQueryable = getPool(),
): Promise<void> {
  let relation;
  let columns;
  let shapeConstraint;

  try {
    relation = await queryable.query<{ schema_name: string; relation_oid: string }>(
      `SELECT namespace_record.nspname AS schema_name, table_record.oid::text AS relation_oid
         FROM pg_class AS table_record
         JOIN pg_namespace AS namespace_record ON namespace_record.oid = table_record.relnamespace
        WHERE table_record.oid = to_regclass('audit_log')`,
    );
    const relationRow = relation.rows[0];
    if (!relationRow) throw new AuditSchemaError();

    columns = await queryable.query<{ column_name: string; is_nullable: string }>(
      `SELECT column_name, is_nullable
         FROM information_schema.columns
        WHERE table_schema = $1
          AND table_name = 'audit_log'
          AND column_name = ANY($2::text[])`,
      [relationRow.schema_name, REQUIRED_AUDIT_COLUMNS],
    );
    shapeConstraint = await queryable.query(
      `SELECT 1
         FROM pg_constraint AS constraint_record
        WHERE constraint_record.conrelid = $1::oid
          AND constraint_record.conname = 'audit_log_actor_shape'
        LIMIT 1`,
      [relationRow.relation_oid],
    );
  } catch {
    throw new AuditSchemaError();
  }

  assertAuditSchemaMetadata({
    columns: new Map(columns.rows.map((row) => [row.column_name, row.is_nullable])),
    hasShapeConstraint: (shapeConstraint.rowCount ?? 0) > 0,
  });
}

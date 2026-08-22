/**
 * Audit-log writers for best-effort events and transaction-bound administrative mutations.
 *
 * Most existing callers use the compatibility writer, which keeps historical best-effort
 * semantics. Administrative data mutations use the transaction-bound writer so their mutation
 * and durable audit row either commit together or both roll back.
 *
 * This module is not specific to organizations and is shared by users, clients, authentication,
 * and administrative workflows.
 */

import type { PoolClient } from 'pg';
import { afterDatabaseCommit, getPool } from './database.js';
import { logger } from './logger.js';

// ---------------------------------------------------------------------------
// Audit log entry type
// ---------------------------------------------------------------------------

/** Input data for writing an audit log entry */
export interface AuditLogEntry {
  organizationId?: string;
  userId?: string;
  actorId?: string;
  eventType: string;
  eventCategory: string;
  description?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

// ---------------------------------------------------------------------------
// Writer
// ---------------------------------------------------------------------------

/**
 * Write an audit log entry to the database.
 *
 * Compatibility events never change the owning operation's result. Outside a database transaction
 * they are written immediately; inside one they are deferred until commit. Errors are reduced to a
 * privacy-safe warning and are never thrown to the caller.
 *
 * @param entry - Audit log entry data
 */
export async function writeAuditLog(entry: AuditLogEntry): Promise<void> {
  await afterDatabaseCommit(async () => {
    try {
      const pool = getPool();
      await pool.query(
        `INSERT INTO audit_log (
         organization_id, user_id, actor_id,
         event_type, event_category, description,
         metadata, ip_address, user_agent
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          entry.organizationId ?? null,
          entry.userId ?? null,
          entry.actorId ?? null,
          entry.eventType,
          entry.eventCategory,
          entry.description ?? null,
          entry.metadata ? JSON.stringify(entry.metadata) : '{}',
          entry.ipAddress ?? null,
          entry.userAgent ?? null,
        ],
      );
    } catch {
      logger.warn(
        { event: 'compatibility-audit-write-failed', eventType: entry.eventType },
        'Compatibility audit write failed',
      );
    }
  });
}

/**
 * Persist a business audit row through the caller's open transaction.
 *
 * Unlike the compatibility writer above, this function deliberately propagates failures. Covered
 * administrative mutations must call it before commit so an unavailable durable audit boundary
 * rolls back the mutation instead of creating an unaudited success.
 *
 * @param client - PostgreSQL client which owns the mutation transaction.
 * @param entry - Closed business audit entry.
 */
export async function writeAuditLogInTransaction(
  client: PoolClient,
  entry: AuditLogEntry,
): Promise<void> {
  await client.query(
    `INSERT INTO audit_log (
       organization_id, user_id, actor_id,
       event_type, event_category, description,
       metadata, ip_address, user_agent
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      entry.organizationId ?? null,
      entry.userId ?? null,
      entry.actorId ?? null,
      entry.eventType,
      entry.eventCategory,
      entry.description ?? null,
      entry.metadata ? JSON.stringify(entry.metadata) : '{}',
      entry.ipAddress ?? null,
      entry.userAgent ?? null,
    ],
  );
}

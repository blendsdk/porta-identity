/**
 * Generic audit log writer.
 *
 * Inserts entries into the `audit_log` table using fire-and-forget
 * semantics — audit write failures are caught and logged but never
 * propagate to callers. This ensures audit logging never blocks
 * core business operations.
 *
 * This module is NOT specific to organizations — it will be reused
 * by future features (users, clients, auth workflows, etc.).
 */

import { getPool } from './database.js';
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
 * Uses fire-and-forget pattern: errors are caught and logged as warnings
 * but never thrown to the caller. This ensures that audit logging never
 * blocks or breaks the primary operation.
 *
 * @param entry - Audit log entry data
 */
export async function writeAuditLog(entry: AuditLogEntry): Promise<void> {
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
  } catch (err) {
    // Fire-and-forget: log the failure but never throw
    logger.warn(
      { err, eventType: entry.eventType, eventCategory: entry.eventCategory },
      'Failed to write audit log entry',
    );
  }
}

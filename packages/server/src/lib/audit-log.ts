/**
 * Audit-log writers for best-effort events and transaction-bound administrative mutations.
 *
 * Most existing callers use the compatibility writer, which keeps historical best-effort
 * semantics. Administrative data mutations use the transaction-bound writer so their mutation
 * and durable audit row either commit together or both roll back.
 *
 * Every row records one actor class: a Porta user, an OAuth service client, or the system. A
 * client actor never gets a synthetic user identifier, and a mutation writer failure propagates so
 * the owning transaction can roll back.
 *
 * This module is not specific to organizations and is shared by users, clients, authentication,
 * and administrative workflows.
 */

import type { PoolClient } from 'pg';
import type { TenantActor } from '../middleware/tenant-user-auth.js';
import type { InviteActor } from '../users/invite-service.js';
import { afterDatabaseCommit, getPool } from './database.js';
import { logger } from './logger.js';

// ---------------------------------------------------------------------------
// Audit actor and entry types
// ---------------------------------------------------------------------------

/** Normalized audit actor. */
export type AuditActor =
  | { readonly kind: 'user'; readonly userId: string }
  | { readonly kind: 'service'; readonly clientId: string; readonly clientName: string }
  | { readonly kind: 'system' };

/** Input data for writing an audit log entry. */
export interface AuditLogEntry {
  organizationId?: string;
  userId?: string;
  actorId?: string;
  actorType?: 'user' | 'client' | 'system';
  actorClientId?: string | null;
  actorClientName?: string | null;
  eventType: string;
  eventCategory: string;
  description?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

/** Column values shared by both writers after actor normalization. */
interface NormalizedAuditRow {
  readonly actorId: string | null;
  readonly actorType: 'user' | 'client' | 'system';
  readonly actorClientId: string | null;
  readonly actorClientName: string | null;
}

/**
 * Derive the actor columns from the entry.
 *
 * Explicit actor type wins. Otherwise a user actor is inferred from `actorId`,
 * a client actor from `actorClientId`, and everything else is system. A client
 * actor must carry a client identifier; silently writing an anonymous client
 * row would defeat accountability.
 *
 * @param entry - Audit entry supplied by a caller
 * @returns Normalized actor columns
 * @throws Error when a client actor has no client identifier
 */
function normalizeActor(entry: AuditLogEntry): NormalizedAuditRow {
  const actorType =
    entry.actorType ?? (entry.actorId ? 'user' : entry.actorClientId ? 'client' : 'system');

  if (actorType === 'client') {
    if (!entry.actorClientId) {
      throw new Error('Client audit actor requires a client identifier');
    }
    return {
      actorId: null,
      actorType,
      actorClientId: entry.actorClientId,
      actorClientName: entry.actorClientName ?? null,
    };
  }

  if (actorType === 'user') {
    return {
      actorId: entry.actorId ?? null,
      actorType,
      actorClientId: null,
      actorClientName: null,
    };
  }

  return {
    actorId: null,
    actorType: 'system',
    actorClientId: null,
    actorClientName: null,
  };
}

/** Build the positional values used by both INSERT statements. */
function insertValues(entry: AuditLogEntry): unknown[] {
  const actor = normalizeActor(entry);
  return [
    entry.organizationId ?? null,
    entry.userId ?? null,
    actor.actorId,
    actor.actorType,
    actor.actorClientId,
    actor.actorClientName,
    entry.eventType,
    entry.eventCategory,
    entry.description ?? null,
    entry.metadata ? JSON.stringify(entry.metadata) : '{}',
    entry.ipAddress ?? null,
    entry.userAgent ?? null,
  ];
}

// ---------------------------------------------------------------------------
// Actor mapping helpers
// ---------------------------------------------------------------------------

/**
 * Map a tenant request actor to the audit contract.
 *
 * @param actor - Authenticated tenant service client or user
 * @returns Audit actor
 */
export function tenantActorToAuditActor(actor: TenantActor): AuditActor {
  return actor.kind === 'service'
    ? { kind: 'service', clientId: actor.clientId, clientName: actor.clientName }
    : { kind: 'user', userId: actor.userId };
}

/**
 * Map an invitation actor to the audit contract.
 *
 * Invitation keeps its own `InviteActor` contract because it carries the
 * display name for the email and the delegation permission set. The audit
 * boundary only needs the stable actor identity.
 *
 * @param actor - Invitation actor
 * @returns Audit actor
 */
export function inviteActorToAuditActor(actor: InviteActor): AuditActor {
  if (actor.kind === 'service' && actor.clientId) {
    return { kind: 'service', clientId: actor.clientId, clientName: actor.displayName };
  }
  return actor.userId ? { kind: 'user', userId: actor.userId } : { kind: 'system' };
}

// ---------------------------------------------------------------------------
// Writer
// ---------------------------------------------------------------------------

/**
 * Write an audit log entry to the database.
 *
 * Compatibility events never change the owning operation's result. Outside a database transaction
 * they are written immediately; inside one they are deferred until commit. Database errors are
 * reduced to a privacy-safe warning and are never thrown to the caller. Actor-shape errors are
 * programming errors and are raised before the write is scheduled.
 *
 * @param entry - Audit log entry data
 */
export async function writeAuditLog(entry: AuditLogEntry): Promise<void> {
  const values = insertValues(entry);

  await afterDatabaseCommit(async () => {
    try {
      const pool = getPool();
      await pool.query(
        `INSERT INTO audit_log (
         organization_id, user_id, actor_id, actor_type, actor_client_id, actor_client_name,
         event_type, event_category, description,
         metadata, ip_address, user_agent
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        values,
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
 * @param client - Query boundary currently routed through the mutation transaction.
 * @param entry - Closed business audit entry.
 */
export async function writeAuditLogInTransaction(
  client: Pick<PoolClient, 'query'>,
  entry: AuditLogEntry,
): Promise<void> {
  const values = insertValues(entry);

  await client.query(
    `INSERT INTO audit_log (
       organization_id, user_id, actor_id, actor_type, actor_client_id, actor_client_name,
       event_type, event_category, description,
       metadata, ip_address, user_agent
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    values,
  );
}

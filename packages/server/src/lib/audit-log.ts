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

/** Optional request metadata attached to a mutation audit row. */
export interface AuditRequestContext {
  /** Trusted client IP resolved by the server. */
  readonly ipAddress?: string;
  /** Sanitized user-agent header. */
  readonly userAgent?: string;
}

/** Input data for writing an audit log entry. */
export interface AuditLogEntry {
  organizationId?: string;
  userId?: string;
  /** Porta user identifier for a user actor. */
  actorId?: string;
  /** Actor class: a Porta user, an OAuth service client, or the system. */
  actorType?: 'user' | 'client' | 'system';
  /** OAuth client identifier for a client actor. */
  actorClientId?: string | null;
  /** OAuth client name captured at event time for a client actor. */
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
function insertValues(entry: AuditLogEntry, actor: NormalizedAuditRow): unknown[] {
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

/**
 * Convert a normalized audit actor into the columns accepted by an audit entry.
 *
 * Mutation services call this once so actor-kind handling cannot drift between
 * invitation, user, and role writes.
 *
 * @param actor - Normalized audit actor
 * @returns Actor fields ready to spread into an audit entry
 */
export function auditActorColumns(
  actor: AuditActor,
): Pick<AuditLogEntry, 'actorId' | 'actorType' | 'actorClientId' | 'actorClientName'> {
  if (actor.kind === 'service') {
    return {
      actorId: undefined,
      actorType: 'client',
      actorClientId: actor.clientId,
      actorClientName: actor.clientName,
    };
  }
  if (actor.kind === 'user') {
    return {
      actorId: actor.userId,
      actorType: 'user',
      actorClientId: null,
      actorClientName: null,
    };
  }
  return {
    actorId: undefined,
    actorType: 'system',
    actorClientId: null,
    actorClientName: null,
  };
}

// ---------------------------------------------------------------------------
// Writer
// ---------------------------------------------------------------------------

/**
 * Write an audit log entry to the database.
 *
 * Compatibility events never change the owning operation's result. Outside a database transaction
 * they are written immediately; inside one they are deferred until commit. Storage and metadata
 * serialization errors are reduced to a privacy-safe warning and are never thrown to the caller.
 * Actor-shape errors are programming errors and are raised before the write is scheduled.
 *
 * @param entry - Audit log entry data
 */
export async function writeAuditLog(entry: AuditLogEntry): Promise<void> {
  const actor = normalizeActor(entry);

  await afterDatabaseCommit(async () => {
    try {
      const values = insertValues(entry, actor);
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
  const actor = normalizeActor(entry);
  const values = insertValues(entry, actor);

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

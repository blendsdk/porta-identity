/**
 * Audit log types for the Porta SDK.
 *
 * Matches the server audit route response shape exactly.
 * Server selects from audit_log table and maps snake_case → camelCase.
 *
 * @module types/audit
 */

export interface AuditEntry {
  /** Audit entry ID (UUID) */
  id: string;
  /** Event type (e.g., "user.login", "org.created") */
  eventType: string;
  /** Event category (e.g., "auth", "admin") */
  eventCategory: string;
  /** Actor ID — the user who performed the action */
  actorId: string | null;
  /** Organization ID scope */
  organizationId: string | null;
  /** User ID — the user affected by the action */
  userId: string | null;
  /** Human-readable event description */
  description: string | null;
  /** Additional event metadata (JSON) */
  metadata: Record<string, unknown> | null;
  /** IP address of the actor */
  ipAddress: string | null;
  /** Timestamp (ISO 8601) */
  createdAt: string;
}

export interface AuditListParams {
  /** Maximum results (default: 50, max: 500) */
  limit?: number;
  /** Filter by event_type */
  event?: string;
  /** Filter by organization_id */
  org?: string;
  /** Filter by user_id */
  user?: string;
  /** Filter events after this ISO 8601 date */
  since?: string;
  [key: string]: string | number | boolean | undefined | null;
}

/**
 * Audit log types for the Porta SDK.
 *
 * @module types/audit
 */

export interface AuditEntry {
  id: string;
  eventType: string;
  actorId: string | null;
  actorEmail: string | null;
  organizationId: string | null;
  resourceType: string | null;
  resourceId: string | null;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
}

export interface AuditListParams {
  page?: number;
  pageSize?: number;
  cursor?: string;
  eventType?: string;
  actorId?: string;
  organizationId?: string;
  resourceType?: string;
  resourceId?: string;
  from?: string;
  to?: string;
}

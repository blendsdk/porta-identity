/**
 * Session management types for the Porta SDK.
 *
 * @module types/sessions
 */

export interface AdminSession {
  sessionId: string;
  userId: string;
  clientId: string | null;
  organizationId: string | null;
  grantId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  lastActivityAt: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
}

export interface SessionListParams {
  page?: number;
  pageSize?: number;
  userId?: string;
  [key: string]: string | number | boolean | undefined | null;
}

/** Result of revoking all sessions for a user */
export interface RevokeUserSessionsResult {
  /** Number of sessions revoked */
  revoked: number;
}

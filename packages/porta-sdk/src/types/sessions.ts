/**
 * Session management types for the Porta SDK.
 *
 * @module types/sessions
 */

export interface AdminSession {
  id: string;
  userId: string;
  userEmail: string;
  ipAddress: string | null;
  userAgent: string | null;
  lastActivityAt: string;
  createdAt: string;
  expiresAt: string;
}

export interface SessionListParams {
  page?: number;
  pageSize?: number;
  userId?: string;
}

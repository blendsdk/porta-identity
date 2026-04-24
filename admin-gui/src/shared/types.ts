/**
 * Types shared between the BFF server and the React client.
 * These define the contract between server-side session data
 * and what the client receives via /auth/me.
 */

/** User info stored in the BFF session and exposed to the React app */
export interface AdminUser {
  /** Porta user ID */
  id: string;
  /** User email address */
  email: string;
  /** Display name */
  name: string;
  /** Admin roles (e.g., ['porta-admin']) */
  roles: string[];
  /** Organization ID the user belongs to */
  orgId: string;
}

/** Session info returned by GET /auth/me */
export interface SessionInfo {
  /** Whether the user is authenticated */
  authenticated: boolean;
  /** User info (null if not authenticated) */
  user: AdminUser | null;
  /** Environment info for the UI */
  environment: EnvironmentInfo;
}

/** Environment metadata injected into the SPA */
export interface EnvironmentInfo {
  /** Current environment (production/staging/development) */
  environment: string;
  /** Porta version string */
  version: string;
}

/** BFF health check response */
export interface HealthStatus {
  status: 'ok' | 'degraded' | 'error';
  checks: {
    redis: 'ok' | 'error';
    porta: 'ok' | 'error';
  };
  uptime: number;
}

// ---------------------------------------------------------------------------
// Pagination types (shared between BFF proxy responses and client hooks)
// ---------------------------------------------------------------------------

/** Cursor-based pagination info returned by Porta admin API */
export interface PaginationInfo {
  /** Total number of items matching the query */
  total: number;
  /** Maximum items per page */
  limit: number;
  /** Current offset */
  offset: number;
  /** Whether more items exist beyond this page */
  hasMore: boolean;
}

/** Paginated API response wrapper */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationInfo;
}

/** Parameters for list/search requests */
export interface ListParams {
  /** Number of items per page (default 20) */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
  /** Sort field */
  sortBy?: string;
  /** Sort direction */
  sortOrder?: 'asc' | 'desc';
  /** Search/filter query string */
  search?: string;
  /** Status filter */
  status?: string;
}

/** Client-side pagination state for UI components */
export interface PaginationState {
  /** Current page number (0-indexed) */
  page: number;
  /** Items per page */
  pageSize: number;
  /** Total items available */
  total: number;
  /** Sort field */
  sortBy: string;
  /** Sort direction */
  sortOrder: 'asc' | 'desc';
}

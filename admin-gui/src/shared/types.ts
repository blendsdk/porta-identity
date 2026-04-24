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

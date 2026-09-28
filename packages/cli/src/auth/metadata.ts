/**
 * Admin metadata and server discovery.
 *
 * Fetches server metadata from the unauthenticated endpoint
 * `GET /api/admin/metadata` to discover the OIDC client_id,
 * issuer URL, and organization slug needed for the login flow.
 *
 * Also provides a health check fetch for the `doctor` command.
 *
 * @module auth/metadata
 */

import type { AdminMetadata } from './types.js';
import type { CliAuthOperationOptions } from './types.js';

const ORGANIZATION_SLUG = /^[a-z0-9][a-z0-9-]{1,98}[a-z0-9]$/;

/** Returns true for a bounded, non-empty discovery string. */
function isDiscoveryString(value: unknown, maximumLength: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maximumLength;
}

/** Validates metadata and binds its issuer to the selected Porta origin. */
function parseAdminMetadata(value: unknown, server: URL): AdminMetadata {
  if (!value || typeof value !== 'object') throw new Error('Authentication failed');
  const candidate = value as Record<string, unknown>;
  if (
    !isDiscoveryString(candidate.clientId, 256) ||
    !isDiscoveryString(candidate.orgSlug, 100) ||
    !ORGANIZATION_SLUG.test(candidate.orgSlug) ||
    !isDiscoveryString(candidate.issuer, 2_048)
  ) {
    throw new Error('Authentication failed');
  }
  let issuer: URL;
  try {
    issuer = new URL(candidate.issuer);
  } catch {
    throw new Error('Authentication failed');
  }
  const expectedPath = `/${candidate.orgSlug}`;
  if (
    issuer.protocol !== 'https:' ||
    issuer.username ||
    issuer.password ||
    issuer.origin !== server.origin ||
    issuer.pathname.replace(/\/+$/, '') !== expectedPath ||
    issuer.search ||
    issuer.hash
  ) {
    throw new Error('Authentication failed');
  }
  return {
    issuer: issuer.toString().replace(/\/$/, ''),
    clientId: candidate.clientId,
    orgSlug: candidate.orgSlug,
  };
}

// ---------------------------------------------------------------------------
// Metadata Fetch
// ---------------------------------------------------------------------------

/**
 * Fetch admin metadata from the Porta server.
 *
 * Calls `GET /api/admin/metadata` — an unauthenticated endpoint
 * that only exposes public info needed to initiate the login flow.
 *
 * @param server - Porta server base URL (e.g., "https://porta.local:3443")
 * @returns Admin metadata (issuer, clientId, orgSlug)
 * @throws Error if the server is not reachable or not initialized
 */
export async function fetchAdminMetadata(
  server: string,
  options?: CliAuthOperationOptions,
): Promise<AdminMetadata> {
  let selectedServer: URL;
  try {
    selectedServer = new URL(server);
    if (
      selectedServer.protocol !== 'https:' ||
      selectedServer.username ||
      selectedServer.password ||
      !/^\/*$/.test(selectedServer.pathname) ||
      selectedServer.search ||
      selectedServer.hash
    ) {
      throw new Error('invalid server');
    }
  } catch {
    throw new Error('Authentication failed');
  }
  let response: Response;
  try {
    response = await fetch(`${selectedServer.origin}/api/admin/metadata`, {
      signal: options?.signal ?? AbortSignal.timeout(10_000),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new Error('Cannot connect to the Porta server. Is it running?', { cause: error });
  }

  if (!response.ok) {
    if (response.status === 503) {
      throw new Error('Server not initialized. Run "porta init" on the server first.');
    }
    throw new Error(`Cannot fetch admin metadata: HTTP ${response.status}`);
  }

  try {
    return parseAdminMetadata(await response.json(), selectedServer);
  } catch {
    throw new Error('Authentication failed');
  }
}

// ---------------------------------------------------------------------------
// Health Check
// ---------------------------------------------------------------------------

/**
 * Health check response from `GET /health`.
 *
 * The server reports `status: 'healthy'` with per-dependency `checks` on HTTP
 * 200, and `status: 'unhealthy'` with the failing entries on HTTP 503. The
 * legacy `status: 'ok'` and `services` fields are accepted for older servers.
 */
export interface HealthResponse {
  /** Overall status: `healthy`, `unhealthy`, or the legacy `ok` */
  status: string;
  /** Per-dependency statuses (`server`, `database`, `redis`) on current servers */
  checks?: Record<string, string>;
  /** Individual service statuses sent by legacy servers */
  services?: Record<string, string>;
}

/**
 * Check server health via `GET /health`.
 *
 * This is an unauthenticated endpoint — no credentials needed.
 * Used by the `doctor` command to verify server connectivity.
 *
 * The endpoint returns HTTP 200 for a healthy server and HTTP 503 for a
 * degraded one; both responses carry the same JSON body, so both are parsed
 * and returned. Any other response is not a valid health answer.
 *
 * @param server - Porta server base URL
 * @returns Health response or null if server is unreachable
 */
export async function fetchHealthStatus(server: string): Promise<HealthResponse | null> {
  try {
    const response = await fetch(`${server}/health`, {
      signal: AbortSignal.timeout(5_000), // 5s timeout
    });

    if (response.ok || response.status === 503) {
      return response.json() as Promise<HealthResponse>;
    }
    return null;
  } catch {
    return null;
  }
}

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
): Promise<AdminMetadata> {
  let response: Response;
  try {
    response = await fetch(`${server}/api/admin/metadata`, {
      signal: AbortSignal.timeout(10_000), // 10s timeout
    });
  } catch {
    throw new Error(
      `Cannot connect to ${server}. Is the server running?`,
    );
  }

  if (!response.ok) {
    if (response.status === 503) {
      throw new Error(
        'Server not initialized. Run "porta init" on the server first.',
      );
    }
    throw new Error(`Cannot fetch admin metadata: HTTP ${response.status}`);
  }

  return response.json() as Promise<AdminMetadata>;
}

// ---------------------------------------------------------------------------
// Health Check
// ---------------------------------------------------------------------------

/**
 * Health check response from `GET /health`.
 */
export interface HealthResponse {
  /** Overall status */
  status: string;
  /** Individual service statuses */
  services?: Record<string, string>;
}

/**
 * Check server health via `GET /health`.
 *
 * This is an unauthenticated endpoint — no credentials needed.
 * Used by the `doctor` command to verify server connectivity.
 *
 * @param server - Porta server base URL
 * @returns Health response or null if server is unreachable
 */
export async function fetchHealthStatus(
  server: string,
): Promise<HealthResponse | null> {
  try {
    const response = await fetch(`${server}/health`, {
      signal: AbortSignal.timeout(5_000), // 5s timeout
    });

    if (response.ok) {
      return response.json() as Promise<HealthResponse>;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Configuration module for the standalone Admin GUI BFF server.
 *
 * Resolves Porta server URL, port, and options from:
 *   1. Programmatic options (highest priority — from `porta gui` CLI)
 *   2. Environment variables (PORTA_SERVER, PORTA_GUI_PORT)
 *   3. Credentials file (~/.porta/credentials.json, set by `porta login`)
 *
 * @module config
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

/** Options accepted by `startServer()` — the public API for launching the BFF. */
export interface StartServerOptions {
  /** Porta server URL (overrides env/credentials). */
  server?: string;
  /** BFF listen port (default: 4002). */
  port?: number;
  /**
   * Public-facing port for OIDC redirect URIs (default: same as port).
   * In dev mode, Vite runs on this port and proxies to the BFF.
   * The OIDC callback goes to this port, not the BFF listen port.
   */
  publicPort?: number;
  /** Auto-open browser on startup (default: true). */
  open?: boolean;
  /** Skip TLS certificate verification for self-signed certs (default: false). */
  insecure?: boolean;
}

/** Fully resolved configuration used internally by the BFF. */
export interface ResolvedConfig {
  /** Porta server base URL (e.g. "https://porta.example.com"). */
  serverUrl: string;
  /** BFF listen port. */
  port: number;
  /** Public-facing port for OIDC redirect URIs (may differ from listen port in dev). */
  publicPort: number;
  /** Whether to open the browser after startup. */
  open: boolean;
  /** Whether TLS verification is disabled. */
  insecure: boolean;
}

/** Default BFF listen port per RD-30. */
const DEFAULT_PORT = 4002;

/** Path to the CLI credentials file (shared with `porta login`). */
const CREDENTIALS_PATH = join(homedir(), '.porta', 'credentials.json');

/**
 * Read the Porta server URL from `~/.porta/credentials.json`.
 * Returns undefined if the file does not exist or is unreadable.
 */
function readServerFromCredentials(): string | undefined {
  try {
    const raw = readFileSync(CREDENTIALS_PATH, 'utf-8');
    const data = JSON.parse(raw) as Record<string, unknown>;
    if (typeof data.server === 'string' && data.server.length > 0) {
      return data.server;
    }
    return undefined;
  } catch {
    // File doesn't exist or is malformed — not an error condition
    return undefined;
  }
}

/**
 * Resolve the full BFF configuration from options, environment, and credentials.
 *
 * Priority chain for server URL:
 *   1. `options.server` (programmatic / --server flag)
 *   2. `PORTA_SERVER` environment variable
 *   3. `server` field in `~/.porta/credentials.json`
 *
 * @throws {Error} If no Porta server URL can be resolved from any source.
 */
export function resolveConfig(options: StartServerOptions = {}): ResolvedConfig {
  // --- Server URL resolution (priority chain) ---
  const serverUrl =
    options.server ||
    process.env.PORTA_SERVER ||
    readServerFromCredentials();

  if (!serverUrl) {
    throw new Error(
      `No Porta server URL configured.\n\n` +
        `Either:\n` +
        `  1. Run 'porta login --server https://your-porta-server.com' first\n` +
        `  2. Pass --server https://your-porta-server.com\n` +
        `  3. Set PORTA_SERVER environment variable`,
    );
  }

  // --- Port resolution ---
  const port =
    options.port ??
    (process.env.PORTA_GUI_PORT ? parseInt(process.env.PORTA_GUI_PORT, 10) : DEFAULT_PORT);

  // --- Public port resolution (for OIDC redirect URI) ---
  // In dev mode, Vite runs on publicPort and proxies to BFF on port.
  // In production, publicPort === port (BFF serves static files directly).
  const publicPort = options.publicPort ?? port;

  // --- Boolean flags ---
  const open = options.open ?? true;
  const insecure = options.insecure ?? false;

  return {
    serverUrl: serverUrl.replace(/\/+$/, ''), // Strip trailing slashes
    port,
    publicPort,
    open,
    insecure,
  };
}

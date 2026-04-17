/**
 * BFF Config Loader
 *
 * Reads the seed-generated config.generated.json file at startup.
 * This file contains client credentials, org mappings, M2M config,
 * and scenario definitions needed for the BFF playground.
 *
 * Fails fast if the config file is missing — the seed script must
 * be run first (yarn playground or yarn tsx scripts/playground-seed.ts).
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ===========================================================================
// Type definitions
// ===========================================================================

/** Per-organization OIDC client configuration */
export interface OrgConfig {
  id: string;
  slug: string;
  name: string;
  clientId: string;
  clientSecret: string;
  twoFactorPolicy: string;
}

/** Machine-to-machine client configuration (client_credentials grant) */
export interface M2MConfig {
  clientId: string;
  clientSecret: string;
  orgSlug: string;
}

/** Complete BFF configuration — mirrors the seed script's bffConfigObj shape */
export interface BffConfig {
  portaUrl: string;
  bffUrl: string;
  mailhogUrl: string;
  redis: { host: string; port: number };
  organizations: Record<string, OrgConfig>;
  m2m: M2MConfig;
  users: Record<string, { password: string; orgKey: string }>;
  scenarios: Record<string, { orgKey: string; userEmail: string; description: string }>;
}

// ===========================================================================
// Config loading
// ===========================================================================

const __dirname = dirname(fileURLToPath(import.meta.url));
const configPath = resolve(__dirname, '..', 'config.generated.json');

/** Cached config instance — loaded once, reused for all requests */
let _config: BffConfig | null = null;

/**
 * Load and cache the BFF configuration from config.generated.json.
 * Throws if the file is missing or malformed — fail fast at startup.
 *
 * @returns The parsed BFF configuration
 */
export function loadConfig(): BffConfig {
  if (!_config) {
    try {
      const raw = readFileSync(configPath, 'utf-8');
      _config = JSON.parse(raw) as BffConfig;
    } catch (err) {
      console.error(`\n❌ Failed to load BFF config from: ${configPath}`);
      console.error('   Run the seed script first: yarn tsx scripts/playground-seed.ts\n');
      throw err;
    }
  }
  return _config;
}

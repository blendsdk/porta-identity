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

/**
 * Login-method demo profile for the BFF. Each profile resolves to a separate
 * OIDC client so the upstream Porta login page renders a specific subset of
 * login methods. Consumed by the debug route + dashboard panel and swapped
 * at boot via the `BFF_CLIENT_PROFILE` environment variable.
 */
export interface LoginMethodClientConfig {
  clientId: string;
  clientSecret: string;
  orgKey: string;
  label: string;
  /** Per-client override, or null when the client inherits org defaults. */
  loginMethods: ('password' | 'magic_link')[] | null;
}

/** Complete BFF configuration — mirrors the seed script's bffConfigObj shape */
export interface BffConfig {
  portaUrl: string;
  bffUrl: string;
  mailhogUrl: string;
  redis: { host: string; port: number };
  organizations: Record<string, OrgConfig>;
  m2m: M2MConfig;
  /** Login-method demo profiles keyed by short id (e.g., `default`, `password`). */
  loginMethodClients?: Record<string, LoginMethodClientConfig>;
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
      _config = applyLoginMethodProfile(_config);
    } catch (err) {
      console.error(`\n❌ Failed to load BFF config from: ${configPath}`);
      console.error('   Run the seed script first: yarn tsx scripts/playground-seed.ts\n');
      throw err;
    }
  }
  return _config;
}

// ===========================================================================
// Login-method profile resolution
// ===========================================================================

/**
 * Selected login-method profile, populated at startup by
 * `applyLoginMethodProfile()`. Exposed so routes (debug + dashboard) can
 * display which profile is active without re-parsing `BFF_CLIENT_PROFILE`.
 *
 * `null` means either the config predates Phase 10 or the env var wasn't set
 * — in that case the BFF uses the per-org client mapping as before.
 */
let activeLoginMethodProfile: { key: string; config: LoginMethodClientConfig } | null = null;

/** Get the currently active profile (or null if none was selected). */
export function getActiveLoginMethodProfile(): { key: string; config: LoginMethodClientConfig } | null {
  return activeLoginMethodProfile;
}

/**
 * Swap the BFF's default org client for the one selected via
 * `BFF_CLIENT_PROFILE` env var. The swap is fully in-memory — it mutates the
 * returned `BffConfig` so existing routes (`createAuthRoutes` etc.) keep
 * working unchanged.
 *
 * When the env var is unset, missing, or references an unknown profile, the
 * function returns the config untouched and logs a warning so the operator
 * can spot typos during development.
 */
function applyLoginMethodProfile(config: BffConfig): BffConfig {
  const key = process.env.BFF_CLIENT_PROFILE?.trim();
  if (!key) {
    activeLoginMethodProfile = null;
    return config;
  }

  const profile = config.loginMethodClients?.[key];
  if (!profile) {
    console.warn(
      `\n⚠️  BFF_CLIENT_PROFILE="${key}" not found in config.generated.json`,
    );
    console.warn(
      `   Available profiles: ${Object.keys(config.loginMethodClients ?? {}).join(', ') || '(none)'}`,
    );
    console.warn('   Falling back to default org client mapping.\n');
    activeLoginMethodProfile = null;
    return config;
  }

  const target = config.organizations[profile.orgKey];
  if (!target) {
    console.warn(
      `\n⚠️  Profile "${key}" references unknown orgKey "${profile.orgKey}". Falling back.\n`,
    );
    activeLoginMethodProfile = null;
    return config;
  }

  // Replace the org's client with the profile's credentials. Auth routes
  // resolve the org by `orgKey`, so this is enough to force all flows to
  // authenticate against the demo client.
  config.organizations[profile.orgKey] = {
    ...target,
    clientId: profile.clientId,
    clientSecret: profile.clientSecret,
  };
  activeLoginMethodProfile = { key, config: profile };
  console.log(
    `\n🎯 BFF login-method profile: "${key}" (${profile.label}) — orgKey=${profile.orgKey}, clientId=${profile.clientId.slice(0, 12)}…\n`,
  );
  return config;
}


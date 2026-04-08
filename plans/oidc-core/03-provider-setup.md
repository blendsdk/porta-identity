# Provider Setup & Configuration: OIDC Provider Core

> **Document**: 03-provider-setup.md
> **Parent**: [Index](00-index.md)

## Overview

This document covers installing `node-oidc-provider`, expanding the application configuration schema, creating the system config service for runtime settings, and building the provider configuration module.

## Architecture

### Current Architecture

The application has a Zod-validated config schema (`src/config/schema.ts`) with environment variables for database, Redis, OIDC issuer base URL, SMTP, and logging. No runtime config service exists — all settings come from environment variables at startup.

### Proposed Changes

1. **Install `oidc-provider`** as a runtime dependency
2. **Expand config schema** with `cookieKeys` for OIDC cookie signing
3. **Create system config service** (`src/lib/system-config.ts`) that reads from the `system_config` table
4. **Create provider configuration module** (`src/oidc/configuration.ts`) that builds the full `node-oidc-provider` configuration object

## Implementation Details

### 1. Installing node-oidc-provider

```bash
yarn add oidc-provider
```

The `oidc-provider` package includes its own TypeScript type definitions. No separate `@types/` package is needed.

**Package note**: The npm package name is `oidc-provider`, and the import is:
```typescript
import Provider from 'oidc-provider';
```

### 2. Config Schema Expansion (`src/config/schema.ts`)

Add `cookieKeys` field for OIDC cookie signing:

```typescript
import { z } from 'zod';

export const configSchema = z.object({
  nodeEnv: z.enum(['development', 'test', 'production']).default('development'),
  port: z.coerce.number().int().positive().default(3000),
  host: z.string().default('0.0.0.0'),
  databaseUrl: z.string().min(1, 'DATABASE_URL is required'),
  redisUrl: z.string().min(1, 'REDIS_URL is required'),
  issuerBaseUrl: z.string().url('ISSUER_BASE_URL must be a valid URL'),
  // NEW: Cookie signing keys for OIDC sessions (array of secrets for rotation)
  cookieKeys: z.array(z.string().min(16)).min(1, 'At least one COOKIE_KEY is required'),
  smtp: z.object({
    host: z.string().min(1, 'SMTP_HOST is required'),
    port: z.coerce.number().default(587),
    user: z.string().optional(),
    pass: z.string().optional(),
    from: z.string().min(1, 'SMTP_FROM is required'),
  }),
  logLevel: z.enum(['debug', 'info', 'warn', 'error', 'fatal']).default('info'),
});
```

Config loader update (`src/config/index.ts`):
```typescript
cookieKeys: process.env.COOKIE_KEYS?.split(',') ?? ['dev-cookie-key-minimum-16-chars'],
```

**Environment variable**: `COOKIE_KEYS` — comma-separated list of secrets (at least 16 chars each). First key is used for signing; subsequent keys are used for verification only (supports rotation).

Update `.env.example` and `.env` with:
```
COOKIE_KEYS=dev-cookie-key-change-me-in-production
```

### 3. System Config Service (`src/lib/system-config.ts`)

Reads typed configuration values from the `system_config` table with in-memory caching.

```typescript
/**
 * System configuration service — reads runtime settings from the system_config table.
 *
 * Values are cached in-memory with a configurable TTL to minimize database queries.
 * The cache is shared across all requests within the process.
 *
 * Usage:
 *   const ttl = await getSystemConfigNumber('access_token_ttl', 3600);
 *   const secure = await getSystemConfigBoolean('cookie_secure', true);
 */

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

// In-memory cache with TTL (default: 60 seconds)
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60_000;

/**
 * Get a string config value from system_config table.
 * @param key - Config key (e.g., 'access_token_ttl')
 * @param fallback - Default value if key not found
 */
export async function getSystemConfigString(key: string, fallback: string): Promise<string>;

/**
 * Get a numeric config value from system_config table.
 * Parses the JSONB value as a number. Returns fallback if not found or not a number.
 */
export async function getSystemConfigNumber(key: string, fallback: number): Promise<number>;

/**
 * Get a boolean config value from system_config table.
 */
export async function getSystemConfigBoolean(key: string, fallback: boolean): Promise<boolean>;

/**
 * Load all TTL config values needed by the OIDC provider.
 * Returns an object with all TTL settings, using fallback defaults.
 * This is called once at provider initialization.
 */
export async function loadOidcTtlConfig(): Promise<OidcTtlConfig>;

/**
 * Clear the in-memory cache. Useful for testing.
 */
export function clearSystemConfigCache(): void;
```

**Key design decisions:**
- **In-memory cache with TTL** — Avoids per-request DB queries. 60-second TTL ensures config changes propagate within a minute.
- **Typed getters** — `getSystemConfigNumber`, `getSystemConfigBoolean`, `getSystemConfigString` handle JSONB parsing.
- **Fallback defaults** — Every getter requires a fallback. The system never fails if a config key is missing.
- **Cache clearing** — Exposed for unit tests.

### 4. OIDC TTL Configuration

The `loadOidcTtlConfig()` function loads all TTL values needed by the provider:

```typescript
export interface OidcTtlConfig {
  accessToken: number;    // Default: 3600 (1 hour)
  idToken: number;        // Default: 3600 (1 hour)
  refreshToken: number;   // Default: 2592000 (30 days)
  authorizationCode: number; // Default: 600 (10 minutes)
  session: number;        // Default: 86400 (24 hours)
  interaction: number;    // Default: 3600 (1 hour) — hardcoded, not in system_config
  grant: number;          // Default: 2592000 (same as refresh token)
}
```

**Note on seed data:** The `system_config` table has JSONB values stored as quoted strings for duration types (e.g., `'"3600"'`). The system config service must strip quotes and parse as numbers.

### 5. Provider Configuration Module (`src/oidc/configuration.ts`)

Builds the complete `node-oidc-provider` configuration object. This is a pure function (no side effects) that takes dependencies as parameters:

```typescript
import type { Configuration } from 'oidc-provider';

/**
 * Build the complete node-oidc-provider configuration object.
 *
 * Takes all external dependencies (TTLs, keys, adapter factory) as parameters
 * to keep this function pure and testable.
 *
 * @param ttl - Token TTL configuration loaded from system_config
 * @param jwks - JWK key set loaded from signing_keys table
 * @param cookieKeys - Cookie signing keys from application config
 * @param findAccount - Account finder function (stub in RD-03, real in RD-06)
 * @param adapterFactory - Adapter class factory (hybrid Postgres/Redis)
 */
export function buildProviderConfiguration(params: {
  ttl: OidcTtlConfig;
  jwks: { keys: JsonWebKey[] };
  cookieKeys: string[];
  findAccount: FindAccount;
  adapterFactory: AdapterFactory;
  interactionUrl: (ctx: KoaContextWithOIDC, interaction: Interaction) => string;
}): Configuration;
```

**Configuration structure:**

```typescript
{
  // Adapter — hybrid Postgres/Redis
  adapter: adapterFactory,

  // Features
  features: {
    introspection: { enabled: true },
    revocation: { enabled: true },
    resourceIndicators: {
      enabled: true,
      defaultResource: () => 'urn:porta:default',
      getResourceServerInfo: () => ({ ... }),
      useGrantedResource: () => true,
    },
    clientCredentials: { enabled: true },
    rpInitiatedLogout: { enabled: true },
  },

  // Token formats — opaque access tokens, JWT ID tokens handled by default
  formats: {
    AccessToken: 'opaque',
    ClientCredentials: 'opaque',
  },

  // PKCE — required for all authorization code flows, S256 only
  pkce: {
    required: () => true,
    methods: ['S256'],
  },

  // TTLs from system_config
  ttl: {
    AccessToken: ttl.accessToken,
    AuthorizationCode: ttl.authorizationCode,
    IdToken: ttl.idToken,
    RefreshToken: ttl.refreshToken,
    Interaction: ttl.interaction,
    Session: ttl.session,
    Grant: ttl.grant,
  },

  // Refresh token rotation
  rotateRefreshToken: true,

  // Scopes and claims mapping (OIDC standard)
  scopes: ['openid', 'profile', 'email', 'address', 'phone', 'offline_access'],
  claims: {
    openid: ['sub'],
    profile: ['name', 'given_name', 'family_name', 'middle_name', 'nickname',
              'preferred_username', 'profile', 'picture', 'website',
              'gender', 'birthdate', 'zoneinfo', 'locale', 'updated_at'],
    email: ['email', 'email_verified'],
    address: ['address'],
    phone: ['phone_number', 'phone_number_verified'],
  },

  // Grant types
  responseTypes: ['code'],
  grantTypes: ['authorization_code', 'client_credentials', 'refresh_token'],

  // Account finder
  findAccount,

  // Interactions (login/consent URL)
  interactions: {
    url: interactionUrl,
  },

  // Signing keys
  jwks,

  // Cookies
  cookies: {
    keys: cookieKeys,
    long: { signed: true, httpOnly: true, sameSite: 'lax' },
    short: { signed: true, httpOnly: true, sameSite: 'lax' },
  },

  // Enable all standard OIDC endpoints
  // node-oidc-provider enables these by default when features are set
}
```

## Error Handling

| Error Case | Handling Strategy |
|------------|-------------------|
| `system_config` table unreachable | Use fallback defaults; log warning |
| Invalid JSONB value in `system_config` | Use fallback default; log warning |
| Missing `COOKIE_KEYS` env var | Fail-fast at startup (zod validation) |
| Invalid provider configuration | `node-oidc-provider` throws at construction time — caught in `main()` |

## Testing Requirements

- Unit tests for `buildProviderConfiguration()` — verify output structure with various TTL inputs
- Unit tests for `getSystemConfigNumber/String/Boolean` — test cache behavior, fallback defaults, type coercion
- Unit tests for `loadOidcTtlConfig()` — verify all TTL keys loaded with correct types
- Unit tests for config schema — verify `cookieKeys` validation (min length, array requirement)

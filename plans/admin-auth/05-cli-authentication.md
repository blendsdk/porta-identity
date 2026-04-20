# CLI Authentication: Admin API Authentication

> **Document**: 05-cli-authentication.md
> **Parent**: [Index](00-index.md)

## Overview

Implement CLI authentication commands (`porta login`, `porta logout`, `porta whoami`) and the supporting token storage/refresh infrastructure. This enables the CLI to authenticate users via OIDC Auth Code + PKCE flow (browser-based, like `az login` and `gh auth login`) and store tokens securely for subsequent HTTP requests.

## Architecture

### Authentication Flow

```
User runs:  porta login [--server http://localhost:3000]
                │
                ▼
CLI generates PKCE code_verifier + code_challenge (S256)
CLI generates random state parameter
                │
                ▼
CLI starts temporary HTTP server on http://127.0.0.1:<random-port>/callback
                │
                ▼
CLI opens browser → http://localhost:3000/porta-admin/auth?
                     response_type=code
                     client_id=<porta-admin-cli-xxx>
                     redirect_uri=http://127.0.0.1:<port>/callback
                     scope=openid profile email offline_access
                     code_challenge=<S256-hash>
                     code_challenge_method=S256
                     state=<random>
                │
                ▼
User authenticates in browser (normal Porta login page)
  - Password, magic link, 2FA — whatever the org policy requires
                │
                ▼
Porta redirects → http://127.0.0.1:<port>/callback?code=xxx&state=yyy
                │
                ▼
CLI callback handler:
  1. Validates state matches
  2. Exchanges code for tokens at POST /porta-admin/token
     (code, redirect_uri, client_id, code_verifier, grant_type=authorization_code)
  3. Receives: access_token, refresh_token, id_token, expires_in
  4. Decodes id_token to extract user info (email, name, sub)
  5. Stores everything to ~/.porta/credentials.json (0600 perms)
  6. Shuts down temporary HTTP server
  7. Prints: "✅ Logged in as admin@example.com"
```

## Implementation Details

### New File: `src/cli/token-store.ts`

Manages reading, writing, and refreshing tokens stored on disk.

```typescript
/**
 * Token storage for CLI authentication.
 *
 * Stores OIDC tokens in ~/.porta/credentials.json with strict
 * file permissions (0600 — owner-only read/write).
 *
 * Handles:
 *   - Reading stored credentials
 *   - Writing new credentials after login
 *   - Clearing credentials on logout
 *   - Checking token expiry
 *   - Refreshing expired access tokens via refresh_token grant
 */

export interface StoredCredentials {
  server: string;
  orgSlug: string;
  clientId: string;
  accessToken: string;
  refreshToken: string;
  idToken: string;
  expiresAt: string;          // ISO 8601 datetime
  userInfo: {
    sub: string;
    email: string;
    name?: string;
  };
}

/** Default credentials file path: ~/.porta/credentials.json */
export function getCredentialsPath(): string;

/** Read stored credentials. Returns null if not found. */
export function readCredentials(): StoredCredentials | null;

/** Write credentials to disk with 0600 permissions. */
export function writeCredentials(creds: StoredCredentials): void;

/** Delete stored credentials. */
export function clearCredentials(): void;

/** Check if the access token has expired (with 60s buffer). */
export function isTokenExpired(creds: StoredCredentials): boolean;

/** Refresh the access token using the refresh_token grant.
 *  Returns updated credentials or null if refresh failed. */
export async function refreshAccessToken(creds: StoredCredentials): Promise<StoredCredentials | null>;
```

**File permissions:** The credentials file is created with `fs.writeFileSync(path, data, { mode: 0o600 })`. The directory `~/.porta/` is created with `mkdirSync(path, { recursive: true, mode: 0o700 })`.

**Token refresh:** When `isTokenExpired()` returns true, `refreshAccessToken()` makes a POST request to the Porta token endpoint:

```
POST /{orgSlug}/token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token
client_id={clientId}
refresh_token={refreshToken}
```

### New File: `src/cli/commands/login.ts`

```typescript
/**
 * CLI login command.
 *
 * Authenticates the user via OIDC Auth Code + PKCE flow.
 * Opens a browser for interactive authentication, starts a temporary
 * localhost HTTP server to receive the callback, exchanges the
 * authorization code for tokens, and stores them securely.
 *
 * Usage:
 *   porta login                              # Login to localhost:3000
 *   porta login --server https://example.com # Login to remote server
 *   porta login --no-browser                 # Print URL instead of opening browser
 */

export const loginCommand: CommandModule<GlobalOptions, LoginOptions> = {
  command: 'login',
  describe: 'Authenticate with a Porta server',
  builder: (yargs) => yargs
    .option('server', {
      type: 'string',
      describe: 'Porta server URL',
      default: 'http://localhost:3000',
    })
    .option('no-browser', {
      type: 'boolean',
      describe: 'Print login URL instead of opening browser',
      default: false,
    }),
  handler: async (argv) => { /* ... */ },
};
```

**Key implementation details:**

1. **PKCE generation** — uses `crypto.randomBytes(32)` for code_verifier, SHA-256 for code_challenge
2. **Localhost server** — Node.js `http.createServer()`, binds to `127.0.0.1` with port 0 (OS picks random available port)
3. **Browser opening** — uses the `open` npm package (cross-platform)
4. **Client ID discovery** — the CLI needs to know the admin client ID. Two approaches:
   - Option A: Hard-discover via OIDC discovery endpoint (`/.well-known/openid-configuration`)
   - Option B: Query admin API (but not authenticated yet — chicken-and-egg)
   - **Chosen approach:** `porta init` prints the client ID, and `porta login` accepts `--client-id` flag. For convenience, also try fetching from a well-known admin endpoint or store the client ID from `porta init` output.
5. **Timeout** — the login flow has a 5-minute timeout. If the user doesn't complete authentication, the localhost server shuts down and the CLI prints an error.
6. **State validation** — the random `state` parameter prevents CSRF attacks on the callback

### New File: `src/cli/commands/logout.ts`

```typescript
/**
 * CLI logout command.
 *
 * Clears stored authentication tokens. Does NOT revoke tokens on the
 * server (the access token will expire naturally).
 *
 * Usage:
 *   porta logout
 */

export const logoutCommand: CommandModule<GlobalOptions, GlobalOptions> = {
  command: 'logout',
  describe: 'Clear stored authentication tokens',
  handler: async () => {
    clearCredentials();
    success('Logged out successfully');
  },
};
```

### New File: `src/cli/commands/whoami.ts`

```typescript
/**
 * CLI whoami command.
 *
 * Displays the currently authenticated user's identity by reading
 * stored credentials. Does not make any HTTP calls.
 *
 * Usage:
 *   porta whoami          # Show current identity
 *   porta whoami --json   # JSON output
 */

export const whoamiCommand: CommandModule<GlobalOptions, GlobalOptions> = {
  command: 'whoami',
  describe: 'Show current authenticated identity',
  handler: async (argv) => {
    const creds = readCredentials();
    if (!creds) {
      warn('Not logged in. Run "porta login" to authenticate.');
      process.exit(1);
    }

    if (isTokenExpired(creds)) {
      warn('Token expired. Run "porta login" to re-authenticate.');
    }

    if (argv.json) {
      printJson(creds.userInfo);
    } else {
      console.log(`  Server:  ${creds.server}`);
      console.log(`  Email:   ${creds.userInfo.email}`);
      console.log(`  Name:    ${creds.userInfo.name ?? '(not set)'}`);
      console.log(`  User ID: ${creds.userInfo.sub}`);
      console.log(`  Org:     ${creds.orgSlug}`);
      console.log(`  Expires: ${creds.expiresAt}`);
    }
  },
};
```

### CLI Index Updates

Register the new commands in `src/cli/index.ts`:

```typescript
// New command imports
import { initCommand } from './commands/init.js';
import { loginCommand } from './commands/login.js';
import { logoutCommand } from './commands/logout.js';
import { whoamiCommand } from './commands/whoami.js';

// Register alongside existing commands
.command(initCommand)
.command(loginCommand)
.command(logoutCommand)
.command(whoamiCommand)
```

### Client ID Discovery

The CLI needs to know the admin client's `client_id` to initiate the OIDC flow. Options (in priority order):

1. **`--client-id` flag** — explicit, always works
2. **Stored from previous login** — read from `~/.porta/credentials.json`
3. **Well-known admin metadata endpoint** — new `GET /api/admin/metadata` (unauthenticated) that returns `{ clientId, orgSlug }`. This is a small, safe endpoint since it only exposes the public client ID (which is already visible in OIDC discovery).
4. **Fallback** — prompt the user to provide the client ID or run `porta init` first

**Recommended:** Option 3 (well-known endpoint) provides the best UX. The endpoint returns minimal public info:

```typescript
// New route: GET /api/admin/metadata (no auth required)
router.get('/api/admin/metadata', async (ctx) => {
  const adminClient = await findAdminCliClient(); // looks up by known slug/name
  if (!adminClient) {
    ctx.status = 503;
    ctx.body = { error: 'System not initialized. Run "porta init" first.' };
    return;
  }
  ctx.body = {
    clientId: adminClient.clientIdValue,
    orgSlug: 'porta-admin',
    issuer: `${config.issuerBaseUrl}/porta-admin`,
  };
});
```

## Error Handling

| Error Case | Handling |
|-----------|---------|
| Server not reachable | "Cannot connect to {server}. Is the server running?" |
| System not initialized | "Server not initialized. Run 'porta init' on the server." |
| Browser fails to open | Fall back to printing URL for manual copy |
| User cancels login | "Login cancelled" (timeout after 5 minutes) |
| Token exchange fails | "Authentication failed: {error_description}" |
| Invalid state parameter | "Security error: state mismatch. Login aborted." |

## Dependencies

### New Dependency

```bash
yarn add open
```

The `open` package opens URLs in the system's default browser. Cross-platform (Windows, macOS, Linux). Widely used (100M+ weekly downloads).

### Built-in Node.js Modules

- `http` — Temporary localhost server for OAuth callback
- `crypto` — PKCE code_verifier/code_challenge generation
- `fs` — Token storage file operations
- `path`, `os` — Home directory and path resolution
- `readline` — Interactive prompts (already used by CLI)
- `url` — Parse callback URL parameters

## Testing Requirements

- Unit tests: PKCE code_verifier/challenge generation
- Unit tests: token store read/write/clear/expiry check
- Unit tests: token refresh logic
- Unit tests: credentials file permissions
- Integration tests: full login flow (may need to simulate browser callback)
- Integration tests: token refresh with real OIDC provider
- Unit tests: logout clears stored credentials
- Unit tests: whoami displays correct info / handles missing credentials

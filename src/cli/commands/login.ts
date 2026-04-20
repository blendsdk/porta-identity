/**
 * CLI login command — authenticate with a Porta server.
 *
 * Implements the OIDC Authorization Code + PKCE flow for CLI authentication.
 * This is the same pattern used by `az login`, `gh auth login`, and similar
 * CLI tools that authenticate via browser-based flows.
 *
 * Flow:
 *   1. Discover admin metadata (client_id, issuer) from the server
 *   2. Generate PKCE code_verifier + code_challenge (S256)
 *   3. Start a temporary localhost HTTP server to receive the callback
 *   4. Open the user's browser to the authorization endpoint
 *   5. Wait for the callback with the authorization code
 *   6. Exchange the code for tokens at the token endpoint
 *   7. Decode the ID token for user identity
 *   8. Store credentials to ~/.porta/credentials.json
 *
 * Security:
 *   - PKCE prevents authorization code interception attacks
 *   - Random state parameter prevents CSRF on the callback
 *   - Callback server binds to 127.0.0.1 only (loopback)
 *   - 5-minute timeout prevents abandoned login sessions
 *
 * Usage:
 *   porta login                              # Login to localhost:3000
 *   porta login --server https://example.com # Login to remote server
 *   porta login --no-browser                 # Print URL instead of opening browser
 *   porta login --client-id <id>             # Override auto-discovered client ID
 *
 * @module cli/commands/login
 */

import type { CommandModule } from 'yargs';
import type { GlobalOptions } from '../index.js';
import { createServer, type Server } from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import { URL } from 'node:url';
import { decodeJwt } from 'jose';
import { writeCredentials } from '../token-store.js';
import { success, error } from '../output.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Login flow timeout — 5 minutes to complete browser authentication */
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;

/** Default Porta server URL for local development */
const DEFAULT_SERVER = 'http://localhost:3000';

/** OIDC scopes requested during the login flow */
const SCOPES = 'openid profile email offline_access';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Options specific to the login command */
interface LoginOptions extends GlobalOptions {
  server: string;
  'client-id'?: string;
  'no-browser': boolean;
}

/** Response shape from the admin metadata endpoint */
interface AdminMetadata {
  issuer: string;
  clientId: string;
  orgSlug: string;
}

/** Token response from the OIDC token endpoint */
interface TokenResponse {
  access_token: string;
  refresh_token: string;
  id_token: string;
  expires_in: number;
}

// ---------------------------------------------------------------------------
// PKCE helpers
// ---------------------------------------------------------------------------

/**
 * Generate a cryptographically random PKCE code_verifier.
 *
 * Per RFC 7636 §4.1: 32 random bytes encoded as base64url produces
 * a 43-character string, well within the 43–128 character requirement.
 *
 * @returns Base64url-encoded code verifier
 */
export function generateCodeVerifier(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Generate the PKCE code_challenge from a code_verifier using S256.
 *
 * Per RFC 7636 §4.2: code_challenge = BASE64URL(SHA256(code_verifier))
 *
 * @param verifier - The code_verifier to hash
 * @returns Base64url-encoded SHA-256 hash of the verifier
 */
export function generateCodeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

/**
 * Generate a cryptographically random state parameter.
 *
 * Used to prevent CSRF attacks on the OAuth callback. The CLI
 * generates this value before opening the browser and validates
 * it when the callback is received.
 *
 * @returns Base64url-encoded random state string
 */
function generateState(): string {
  return randomBytes(16).toString('base64url');
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

/**
 * Fetch admin metadata from the Porta server.
 *
 * Calls GET /api/admin/metadata to discover the OIDC client_id,
 * issuer URL, and organization slug needed for the login flow.
 * This is an unauthenticated endpoint that only exposes public info.
 *
 * @param server - Porta server base URL
 * @returns Admin metadata (issuer, clientId, orgSlug)
 * @throws Error if the server is not reachable or not initialized
 */
async function fetchMetadata(server: string): Promise<AdminMetadata> {
  let response: Response;
  try {
    response = await fetch(`${server}/api/admin/metadata`);
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

/**
 * Exchange an authorization code for tokens at the OIDC token endpoint.
 *
 * Sends a POST request with the authorization code, PKCE code_verifier,
 * and redirect URI to complete the Authorization Code flow.
 *
 * @param params - Token exchange parameters
 * @returns Token response with access, refresh, and ID tokens
 * @throws Error if the token exchange fails
 */
async function exchangeCode(params: {
  server: string;
  orgSlug: string;
  code: string;
  redirectUri: string;
  clientId: string;
  codeVerifier: string;
}): Promise<TokenResponse> {
  const tokenUrl = `${params.server}/${params.orgSlug}/token`;

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: params.code,
      redirect_uri: params.redirectUri,
      client_id: params.clientId,
      code_verifier: params.codeVerifier,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const desc =
      (errorData as Record<string, string>).error_description ||
      (errorData as Record<string, string>).error ||
      `HTTP ${response.status}`;
    throw new Error(`Token exchange failed: ${desc}`);
  }

  return response.json() as Promise<TokenResponse>;
}

// ---------------------------------------------------------------------------
// Callback server
// ---------------------------------------------------------------------------

/**
 * Start a temporary HTTP server to receive the OAuth callback.
 *
 * Binds to 127.0.0.1 on a random available port. Validates the
 * state parameter and extracts the authorization code from the
 * callback URL query parameters.
 *
 * The server automatically shuts down after receiving a callback
 * (success or error) or after the 5-minute timeout.
 *
 * @param expectedState - The state parameter to validate against
 * @returns Object with the assigned port and a promise that resolves with the auth code
 */
function startCallbackServer(
  expectedState: string,
): Promise<{ port: number; authCode: Promise<string> }> {
  return new Promise((resolveSetup) => {
    let resolveCode: (code: string) => void;
    let rejectCode: (err: Error) => void;

    // Promise that resolves when the callback is received with a valid code
    const authCode = new Promise<string>((resolve, reject) => {
      resolveCode = resolve;
      rejectCode = reject;
    });

    const server: Server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');

      // Only handle the /callback path — reject anything else
      if (url.pathname !== '/callback') {
        res.writeHead(404);
        res.end('Not Found');
        return;
      }

      const code = url.searchParams.get('code');
      const returnedState = url.searchParams.get('state');
      const errorParam = url.searchParams.get('error');

      // Case 1: OIDC provider returned an error (user cancelled, etc.)
      if (errorParam) {
        const desc =
          url.searchParams.get('error_description') || errorParam;
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(
          '<html><body><h1>Login Failed</h1>' +
            '<p>You can close this tab.</p></body></html>',
        );
        server.close();
        rejectCode(new Error(`Authentication failed: ${desc}`));
        return;
      }

      // Case 2: State mismatch — possible CSRF attack
      if (returnedState !== expectedState) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(
          '<html><body><h1>Security Error</h1>' +
            '<p>State mismatch. Please try again.</p></body></html>',
        );
        server.close();
        rejectCode(
          new Error('Security error: state mismatch. Login aborted.'),
        );
        return;
      }

      // Case 3: No authorization code in the callback
      if (!code) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(
          '<html><body><h1>Error</h1>' +
            '<p>No authorization code received.</p></body></html>',
        );
        server.close();
        rejectCode(new Error('No authorization code received'));
        return;
      }

      // Case 4: Success — valid code and matching state
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(
        '<html><body><h1>Login Successful</h1>' +
          '<p>You can close this tab and return to the terminal.</p></body></html>',
      );
      server.close();
      resolveCode(code);
    });

    // Timeout: abort the login after 5 minutes of inactivity
    const timeout = setTimeout(() => {
      server.close();
      rejectCode(new Error('Login timed out after 5 minutes'));
    }, LOGIN_TIMEOUT_MS);

    // Unref the timeout so it doesn't keep the Node.js process alive
    // if the promise resolves before the timeout fires
    timeout.unref();

    // Listen on random available port, loopback interface only
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolveSetup({ port, authCode });
    });
  });
}

// ---------------------------------------------------------------------------
// Command definition
// ---------------------------------------------------------------------------

/**
 * The login command module — authenticates the CLI with a Porta server.
 *
 * Uses OIDC Authorization Code + PKCE flow. Opens a browser for
 * interactive authentication, then stores the tokens locally.
 */
export const loginCommand: CommandModule<GlobalOptions, LoginOptions> = {
  command: 'login',
  describe: 'Authenticate with a Porta server',

  builder: (yargs) =>
    yargs
      .option('server', {
        type: 'string',
        describe: 'Porta server URL',
        default: DEFAULT_SERVER,
      })
      .option('client-id', {
        type: 'string',
        describe:
          'Override admin client ID (normally auto-discovered from server)',
      })
      .option('no-browser', {
        type: 'boolean',
        describe: 'Print login URL instead of opening browser',
        default: false,
      }),

  handler: async (argv) => {
    try {
      // ---------------------------------------------------------------
      // Step 1: Discover admin metadata (client ID + org slug)
      // ---------------------------------------------------------------
      let clientId: string;
      let orgSlug: string;

      if (argv['client-id']) {
        // Explicit client ID provided — use it directly
        clientId = argv['client-id'];
        orgSlug = 'porta-admin';
      } else {
        // Auto-discover from the server's metadata endpoint
        const metadata = await fetchMetadata(argv.server);
        clientId = metadata.clientId;
        orgSlug = metadata.orgSlug;
      }

      // ---------------------------------------------------------------
      // Step 2: Generate PKCE parameters
      // ---------------------------------------------------------------
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = generateCodeChallenge(codeVerifier);
      const state = generateState();

      // ---------------------------------------------------------------
      // Step 3: Start localhost callback server
      // ---------------------------------------------------------------
      const { port, authCode } = await startCallbackServer(state);
      const redirectUri = `http://127.0.0.1:${port}/callback`;

      // ---------------------------------------------------------------
      // Step 4: Build the authorization URL
      // ---------------------------------------------------------------
      const authUrl = new URL(`${argv.server}/${orgSlug}/auth`);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('client_id', clientId);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('scope', SCOPES);
      authUrl.searchParams.set('code_challenge', codeChallenge);
      authUrl.searchParams.set('code_challenge_method', 'S256');
      authUrl.searchParams.set('state', state);

      // ---------------------------------------------------------------
      // Step 5: Open browser or print URL
      // ---------------------------------------------------------------
      if (argv['no-browser']) {
        console.log('\nOpen this URL in your browser to log in:\n');
        console.log(`  ${authUrl.toString()}\n`);
      } else {
        console.log('Opening browser for authentication...');
        try {
          // Dynamic import — `open` is an ESM-only package
          const { default: openUrl } = await import('open');
          await openUrl(authUrl.toString());
        } catch {
          // Fall back to printing the URL if browser opening fails
          console.log('\nCould not open browser. Open this URL manually:\n');
          console.log(`  ${authUrl.toString()}\n`);
        }
      }

      console.log('Waiting for authentication...');

      // ---------------------------------------------------------------
      // Step 6: Wait for the callback with the authorization code
      // ---------------------------------------------------------------
      const code = await authCode;

      // ---------------------------------------------------------------
      // Step 7: Exchange the authorization code for tokens
      // ---------------------------------------------------------------
      const tokens = await exchangeCode({
        server: argv.server,
        orgSlug,
        code,
        redirectUri,
        clientId,
        codeVerifier,
      });

      // ---------------------------------------------------------------
      // Step 8: Decode the ID token to extract user identity
      // ---------------------------------------------------------------
      const claims = decodeJwt(tokens.id_token);

      // ---------------------------------------------------------------
      // Step 9: Store credentials to disk
      // ---------------------------------------------------------------
      writeCredentials({
        server: argv.server,
        orgSlug,
        clientId,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        idToken: tokens.id_token,
        expiresAt: new Date(
          Date.now() + tokens.expires_in * 1000,
        ).toISOString(),
        userInfo: {
          sub: claims.sub ?? '',
          email: (claims.email as string) ?? '',
          name: (claims.name as string) ?? undefined,
        },
      });

      success(`Logged in as ${(claims.email as string) ?? claims.sub}`);
      process.exit(0);
    } catch (err) {
      error(err instanceof Error ? err.message : 'Login failed');
      process.exit(1);
    }
  },
};

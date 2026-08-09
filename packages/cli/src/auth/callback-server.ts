/**
 * OAuth callback server and manual URL parsing.
 *
 * Provides two mechanisms for receiving the OAuth authorization code:
 *
 * 1. **Browser mode**: A temporary localhost HTTP server that receives
 *    the redirect callback. Binds to 127.0.0.1 on a random port.
 *
 * 2. **Manual mode**: URL parsing for Docker/headless environments where
 *    the user pastes the callback URL from their browser's address bar.
 *
 * Security:
 *   - Callback server binds to 127.0.0.1 only (loopback)
 *   - State parameter validated on every callback (CSRF protection)
 *   - 5-minute timeout prevents abandoned login sessions
 *
 * @module auth/callback-server
 */

import { createServer, type Server } from 'node:http';
import { existsSync } from 'node:fs';
import { URL } from 'node:url';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Login flow timeout — 5 minutes to complete browser authentication */
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Fixed redirect URI used in manual (no-browser) mode.
 *
 * The port number is arbitrary — nothing actually listens on it. The user's
 * browser will fail to load this page after authentication, but the full URL
 * (including the authorization code in the query string) will be visible in
 * the browser's address bar for the user to copy and paste back.
 *
 * Per RFC 8252 §7.3, node-oidc-provider allows flexible port matching for
 * native clients using loopback redirect URIs, so any port works as long as
 * the base pattern (`http://127.0.0.1/callback`) is registered.
 */
export const MANUAL_REDIRECT_URI = 'http://127.0.0.1:11111/callback';

// ---------------------------------------------------------------------------
// Callback Server (browser mode)
// ---------------------------------------------------------------------------

/**
 * Result from starting the callback server.
 */
export interface CallbackServerResult {
  /** Port the server is listening on */
  port: number;
  /** Promise that resolves with the authorization code */
  authCode: Promise<string>;
  /** Close the server (for cleanup on error) */
  close: () => void;
}

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
export function startCallbackServer(
  expectedState: string,
): Promise<CallbackServerResult> {
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
    timeout.unref();

    // Listen on random available port, loopback interface only
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolveSetup({
        port,
        authCode,
        close: () => server.close(),
      });
    });
  });
}

// ---------------------------------------------------------------------------
// Manual URL Parsing (Docker / headless mode)
// ---------------------------------------------------------------------------

/**
 * Parse the authorization code and state from a pasted callback URL.
 *
 * In manual mode the user pastes the full URL from their browser's address
 * bar after authentication. This function extracts the `code` and `state`
 * query parameters and validates the state against the expected value.
 *
 * @param pastedUrl - The full callback URL pasted by the user
 * @param expectedState - The state value to validate against (CSRF protection)
 * @returns The authorization code extracted from the URL
 * @throws Error if the URL is malformed, state mismatches, or code is missing
 */
export function parseCallbackUrl(
  pastedUrl: string,
  expectedState: string,
): string {
  let url: URL;
  try {
    url = new URL(pastedUrl.trim());
  } catch {
    throw new Error(
      'Invalid URL. Please copy the full URL from your browser\'s address bar.',
    );
  }

  // Check for OIDC error response in the callback URL
  const errorParam = url.searchParams.get('error');
  if (errorParam) {
    const desc = url.searchParams.get('error_description') || errorParam;
    throw new Error(`Authentication failed: ${desc}`);
  }

  // Validate state parameter (CSRF protection)
  const returnedState = url.searchParams.get('state');
  if (returnedState !== expectedState) {
    throw new Error('Security error: state mismatch. Login aborted.');
  }

  // Extract the authorization code
  const code = url.searchParams.get('code');
  if (!code) {
    throw new Error('No authorization code found in the URL.');
  }

  return code;
}

// ---------------------------------------------------------------------------
// Environment Detection
// ---------------------------------------------------------------------------

/**
 * Detect whether the process is running inside a Docker container.
 *
 * Checks for the `/.dockerenv` sentinel file that Docker creates in every
 * container. Also honours the `PORTA_CONTAINER` environment variable so
 * users can force manual mode in other containerized runtimes (Podman,
 * Kubernetes, etc.) by setting `PORTA_CONTAINER=1`.
 *
 * @returns true if running inside a container
 */
export function isContainerized(): boolean {
  // Explicit override via environment variable
  if (process.env.PORTA_CONTAINER === '1') return true;

  // Docker sentinel file — present in every Docker container
  try {
    return existsSync('/.dockerenv');
  } catch {
    return false;
  }
}

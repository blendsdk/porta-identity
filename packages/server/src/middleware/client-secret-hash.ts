/**
 * SHA-256 client secret pre-hashing middleware.
 *
 * Transforms client_secret values in incoming requests by replacing
 * the plaintext with its SHA-256 hash BEFORE oidc-provider processes them.
 *
 * Supports:
 * - client_secret_basic: Authorization: Basic base64(client_id:secret)
 * - client_secret_post: client_secret in POST body
 *
 * This allows oidc-provider's built-in string comparison to work
 * with our SHA-256-hashed secret storage — no monkey-patching needed.
 *
 * How it works:
 * 1. At secret generation: SHA-256(secret) is stored in the DB
 * 2. At request time: This middleware hashes the presented secret
 * 3. In the adapter: findForOidc() returns SHA-256 hash as client_secret
 * 4. oidc-provider compares: SHA-256(presented) === SHA-256(stored) → ✅ MATCH
 *
 * Security: SHA-256 is appropriate for machine-generated, high-entropy
 * client secrets (48 bytes / 384 bits of randomness).
 */

import { createHash } from 'node:crypto';
import type { Middleware } from 'koa';

/**
 * Compute SHA-256 hash of a string, returned as hex.
 */
function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Create middleware that pre-hashes client secrets with SHA-256.
 *
 * Must be mounted BEFORE oidc-provider's callback handler on the
 * OIDC router. Transparently transforms secrets so oidc-provider
 * can compare them against stored SHA-256 hashes.
 *
 * @returns Koa middleware function
 */
export function clientSecretHash(): Middleware {
  return async (ctx, next) => {
    // Handle client_secret_basic: Authorization: Basic base64(client_id:secret)
    const authHeader = ctx.headers.authorization;
    if (authHeader && authHeader.startsWith('Basic ')) {
      try {
        const encoded = authHeader.slice(6); // strip 'Basic '
        const decoded = Buffer.from(encoded, 'base64').toString('utf8');
        const colonIndex = decoded.indexOf(':');

        if (colonIndex !== -1) {
          const clientId = decoded.slice(0, colonIndex);
          const secret = decoded.slice(colonIndex + 1);

          if (secret.length > 0) {
            // Hash the secret and re-encode the Basic auth header
            const hashedSecret = sha256(secret);
            const newEncoded = Buffer.from(`${clientId}:${hashedSecret}`).toString('base64');
            ctx.headers.authorization = `Basic ${newEncoded}`;
            // Also update the raw request header for oidc-provider
            ctx.req.headers.authorization = `Basic ${newEncoded}`;
          }
        }
      } catch {
        // Malformed Basic auth — let oidc-provider handle the error
      }
    }

    // Handle client_secret_post: client_secret in POST body
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (ctx.request as any).body;
    if (body && typeof body.client_secret === 'string' && body.client_secret.length > 0) {
      body.client_secret = sha256(body.client_secret);
    }

    await next();
  };
}

import { randomBytes } from 'node:crypto';

import type { LiveTenantAdminContext } from './tenant-admin-live-context.js';

/**
 * Builds one authorization request from independently generated protocol values.
 *
 * @param context - Active owner-fenced harness context.
 * @param prompt - Whether the public request may display login UI.
 * @returns A complete Alpha public-client authorization URL.
 */
export function functionalAuthorizationUrl(
  context: LiveTenantAdminContext,
  prompt: 'login' | 'none',
): string {
  const client = context.manifest.alpha.clients.find(
    (candidate) => candidate.validity === 'valid' && candidate.kind === 'public',
  );
  const redirectUri = client?.redirectUris[0];
  if (client === undefined || redirectUri === undefined) {
    throw new Error('functional human-auth public client is absent');
  }
  const url = new URL(`${context.endpoints.porta}/alpha/auth`);
  url.search = new URLSearchParams({
    client_id: context.entity(`${client.id}-oidc-client-id`),
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid profile email',
    state: randomBytes(18).toString('base64url'),
    nonce: randomBytes(18).toString('base64url'),
    code_challenge: randomBytes(32).toString('base64url'),
    code_challenge_method: 'S256',
    prompt,
  }).toString();
  return url.toString();
}

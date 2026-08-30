/**
 * Immutable protocol specifications for confidential-client secret overlap.
 *
 * These tests exercise the real OIDC provider through Porta's HTTP boundary. They intentionally
 * describe behavior that the active-secret bridge must provide and must not be weakened to match
 * the former single-secret implementation.
 */

import { createServer, type Server } from 'node:http';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../../../src/server.js';
import { createOidcProvider } from '../../../src/oidc/provider.js';
import { ensureSigningKeys } from '../../../src/lib/signing-keys.js';
import { getPool } from '../../../src/lib/database.js';
import { loadOidcTtlConfig } from '../../../src/lib/system-config.js';
import { generateSecret, hashSecret, sha256Secret } from '../../../src/clients/crypto.js';
import { updateClient } from '../../../src/clients/repository.js';
import {
  insertSecret,
  revokeSecret,
  type InsertSecretData,
} from '../../../src/clients/secret-repository.js';
import { truncateAllTables, seedBaseData } from '../helpers/database.js';
import {
  createTestApplication,
  createTestClient,
  createTestOrganization,
} from '../helpers/factories.js';

/** A token response together with its parsed public error payload. */
interface TokenResponse {
  response: Response;
  body: Record<string, unknown>;
}

/** Options for one client-credentials request. */
interface CredentialRequest {
  clientId: string;
  secret: string;
  method: 'client_secret_basic' | 'client_secret_post';
  duplicateSecret?: string;
  sourceAddress?: string;
}

let server: Server;
let baseUrl: string;

/** Start a real provider-backed Porta app for this integration specification. */
async function startProvider(): Promise<void> {
  await truncateAllTables();
  await seedBaseData();
  const jwks = await ensureSigningKeys();
  const ttl = await loadOidcTtlConfig();
  const provider = await createOidcProvider({ jwks, ttl });
  const app = createApp(provider);
  server = createServer(app.callback());

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Provider test server has no port');
  baseUrl = `http://127.0.0.1:${address.port}`;
}

/** Stop the provider-backed test server. */
async function stopProvider(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

/** Insert a secret with an optional modern SHA-256 lookup value. */
async function addSecret(
  clientId: string,
  plaintext: string,
  options: { modern?: boolean; expiresAt?: Date | null; label?: string } = {},
): Promise<string> {
  const data: InsertSecretData = {
    clientId,
    secretHash: await hashSecret(plaintext),
    secretSha256: options.modern === false ? null : sha256Secret(plaintext),
    label: options.label ?? null,
    expiresAt: options.expiresAt ?? null,
  };
  return (await insertSecret(data)).id;
}

/** Insert one legacy row directly to model a pre-cap database fixture. */
async function addLegacyFixtureRow(clientId: string, plaintext: string): Promise<void> {
  await getPool().query(
    `INSERT INTO client_secrets (client_id, secret_hash, secret_sha256, label, expires_at)
     VALUES ($1, $2, NULL, NULL, NULL)`,
    [clientId, await hashSecret(plaintext)],
  );
}

/** Send a client-credentials request using the selected provider authentication method. */
async function requestToken(
  orgSlug: string,
  credentials: CredentialRequest,
): Promise<TokenResponse> {
  const body = new URLSearchParams({ grant_type: 'client_credentials' });
  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  if (credentials.method === 'client_secret_basic') {
    const basic = Buffer.from(`${credentials.clientId}:${credentials.secret}`).toString('base64');
    headers.Authorization = `Basic ${basic}`;
  } else {
    body.set('client_id', credentials.clientId);
    body.set('client_secret', credentials.secret);
  }
  if (credentials.duplicateSecret !== undefined) {
    body.set('client_id', credentials.clientId);
    body.set('client_secret', credentials.duplicateSecret);
  }
  if (credentials.sourceAddress) headers['X-Forwarded-For'] = credentials.sourceAddress;

  const response = await fetch(`${baseUrl}/${orgSlug}/token`, {
    method: 'POST',
    headers,
    body: body.toString(),
  });
  const text = await response.text();
  const parsed: unknown = text.length > 0 ? JSON.parse(text) : {};
  const responseBody =
    typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  return { response, body: responseBody };
}

/** Assert a provider-shaped rejection that does not expose credentials or internals. */
function expectSafeProviderFailure(result: TokenResponse, secrets: readonly string[]): void {
  expect([400, 401, 404]).toContain(result.response.status);
  if (result.response.status !== 404) {
    expect(['invalid_client', 'invalid_request', 'invalid_client_metadata']).toContain(
      result.body.error,
    );
  }
  const exposed = JSON.stringify(result.body);
  for (const secret of secrets) expect(exposed).not.toContain(secret);
  expect(exposed).not.toMatch(/argon2|secret_sha256|SELECT |stack|node_modules|\.ts:\d+/i);
}

beforeAll(startProvider);
afterAll(stopProvider);

beforeEach(async () => {
  await truncateAllTables();
  await seedBaseData();
});

describe('confidential client active-secret overlap', () => {
  for (const method of ['client_secret_basic', 'client_secret_post'] as const) {
    it(`should authenticate either modern active secret through ${method}`, async () => {
      // A confidential client may retain two usable secrets during a zero-downtime rotation.
      const org = await createTestOrganization();
      const application = await createTestApplication();
      const client = await createTestClient(org.id, application.id, {
        grantTypes: ['client_credentials'],
        tokenEndpointAuthMethod: method,
      });
      const first = generateSecret();
      const second = generateSecret();
      await addSecret(client.id, first, { label: 'first' });
      await addSecret(client.id, second, { label: 'second' });

      const firstResult = await requestToken(org.slug, {
        clientId: client.clientId,
        secret: first,
        method,
      });
      const secondResult = await requestToken(org.slug, {
        clientId: client.clientId,
        secret: second,
        method,
      });

      expect(firstResult.response.status).toBe(200);
      expect(secondResult.response.status).toBe(200);
      expect(firstResult.body.access_token).toEqual(expect.any(String));
      expect(secondResult.body.access_token).toEqual(expect.any(String));
    });
  }

  it('should reject wrong, expired, revoked, unknown, public, malformed, and duplicate credentials safely', async () => {
    // Every invalid credential category stays at the provider boundary without diagnostic leakage.
    const org = await createTestOrganization();
    const application = await createTestApplication();
    const client = await createTestClient(org.id, application.id, {
      grantTypes: ['client_credentials'],
    });
    const valid = generateSecret();
    const expired = generateSecret();
    const revoked = generateSecret();
    await addSecret(client.id, valid);
    await addSecret(client.id, expired, { expiresAt: new Date(Date.now() - 60_000) });
    const revokedId = await addSecret(client.id, revoked);
    await revokeSecret(client.id, revokedId);

    const publicClient = await createTestClient(org.id, application.id, {
      clientType: 'public',
      grantTypes: ['authorization_code'],
      tokenEndpointAuthMethod: 'none',
    });
    const publicSecret = generateSecret();

    const failures = await Promise.all([
      requestToken(org.slug, {
        clientId: client.clientId,
        secret: 'wrong-client-secret',
        method: 'client_secret_basic',
      }),
      requestToken(org.slug, {
        clientId: client.clientId,
        secret: expired,
        method: 'client_secret_basic',
      }),
      requestToken(org.slug, {
        clientId: client.clientId,
        secret: revoked,
        method: 'client_secret_basic',
      }),
      requestToken(org.slug, {
        clientId: 'unknown-client',
        secret: generateSecret(),
        method: 'client_secret_basic',
      }),
      requestToken(org.slug, {
        clientId: publicClient.clientId,
        secret: publicSecret,
        method: 'client_secret_basic',
      }),
      fetch(`${baseUrl}/${org.slug}/token`, {
        method: 'POST',
        headers: {
          Authorization: 'Basic !!!not-base64!!!',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ grant_type: 'client_credentials' }),
      }).then(async (response) => ({
        response,
        body: (await response.json()) as Record<string, unknown>,
      })),
      requestToken(org.slug, {
        clientId: client.clientId,
        secret: valid,
        duplicateSecret: valid,
        method: 'client_secret_basic',
      }),
    ]);

    const protectedValues = [valid, expired, revoked, publicSecret, 'wrong-client-secret'];
    for (const failure of failures) expectSafeProviderFailure(failure, protectedValues);
  });

  it('should authenticate a retained legacy secret after one modern secret exists', async () => {
    // An Argon2-only secret participates in overlap only when a current SHA-backed value exists.
    const org = await createTestOrganization();
    const application = await createTestApplication();
    const client = await createTestClient(org.id, application.id, {
      grantTypes: ['client_credentials'],
    });
    const legacy = generateSecret();
    const modern = generateSecret();
    await addSecret(client.id, legacy, { modern: false, label: 'legacy' });
    await addSecret(client.id, modern, { label: 'modern' });

    const legacyResult = await requestToken(org.slug, {
      clientId: client.clientId,
      secret: legacy,
      method: 'client_secret_basic',
    });
    const modernResult = await requestToken(org.slug, {
      clientId: client.clientId,
      secret: modern,
      method: 'client_secret_basic',
    });

    expect(legacyResult.response.status).toBe(200);
    expect(modernResult.response.status).toBe(200);
  });

  it('should reject a legacy-only client through the normal provider category', async () => {
    // Without a SHA-backed canonical value, plaintext cannot be supplied to the provider safely.
    const org = await createTestOrganization();
    const application = await createTestApplication();
    const client = await createTestClient(org.id, application.id, {
      grantTypes: ['client_credentials'],
    });
    const legacy = generateSecret();
    await addSecret(client.id, legacy, { modern: false });

    const result = await requestToken(org.slug, {
      clientId: client.clientId,
      secret: legacy,
      method: 'client_secret_basic',
    });

    expectSafeProviderFailure(result, [legacy]);
  });

  it('should fail closed when a legacy client has eleven active candidates', async () => {
    // Runtime work is bounded even if an old database contains more than the supported maximum.
    const org = await createTestOrganization();
    const application = await createTestApplication();
    const client = await createTestClient(org.id, application.id, {
      grantTypes: ['client_credentials'],
    });
    const presented = generateSecret();
    await addSecret(client.id, generateSecret());
    await Promise.all(
      Array.from({ length: 11 }, (_, index) =>
        addLegacyFixtureRow(client.id, index === 10 ? presented : generateSecret()),
      ),
    );

    const result = await requestToken(org.slug, {
      clientId: client.clientId,
      secret: presented,
      method: 'client_secret_basic',
    });

    expectSafeProviderFailure(result, [presented]);
  });

  it('should reject a newly started request after revocation while another secret remains active', async () => {
    // Revocation affects later requests without invalidating a different overlapping secret.
    const org = await createTestOrganization();
    const application = await createTestApplication();
    const client = await createTestClient(org.id, application.id, {
      grantTypes: ['client_credentials'],
    });
    const revokedPlaintext = generateSecret();
    const retainedPlaintext = generateSecret();
    const revokedId = await addSecret(client.id, revokedPlaintext);
    await addSecret(client.id, retainedPlaintext);
    const beforeRevocation = await requestToken(org.slug, {
      clientId: client.clientId,
      secret: revokedPlaintext,
      method: 'client_secret_basic',
    });
    expect(beforeRevocation.response.status).toBe(200);
    await revokeSecret(client.id, revokedId);

    const revokedResult = await requestToken(org.slug, {
      clientId: client.clientId,
      secret: revokedPlaintext,
      method: 'client_secret_basic',
    });
    const retainedResult = await requestToken(org.slug, {
      clientId: client.clientId,
      secret: retainedPlaintext,
      method: 'client_secret_basic',
    });

    expectSafeProviderFailure(revokedResult, [revokedPlaintext]);
    expect(retainedResult.response.status).toBe(200);
  });

  it('should reject credentials for a revoked confidential client', async () => {
    const org = await createTestOrganization();
    const application = await createTestApplication();
    const client = await createTestClient(org.id, application.id, {
      grantTypes: ['client_credentials'],
    });
    const secret = generateSecret();
    await addSecret(client.id, secret);
    await updateClient(client.id, { status: 'revoked' });

    const result = await requestToken(org.slug, {
      clientId: client.clientId,
      secret,
      method: 'client_secret_basic',
    });
    expectSafeProviderFailure(result, [secret]);
  });
});

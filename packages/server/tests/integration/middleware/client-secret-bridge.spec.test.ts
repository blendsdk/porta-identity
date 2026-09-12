/**
 * Immutable integration specifications for the bounded client-secret bridge.
 *
 * The bridge may canonicalize a proven active credential for the OIDC provider, but it must never
 * become a second authentication system or expose whether a credential was valid when protective
 * computational limits deny work.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as clientCrypto from '../../../src/clients/crypto.js';
import { getPool } from '../../../src/lib/database.js';
import { clientSecretHash } from '../../../src/middleware/client-secret-hash.js';
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

/** Minimal mutable context needed by the credential bridge and its denial response. */
interface BridgeContext {
  headers: Record<string, string | undefined>;
  req: { headers: Record<string, string | undefined> };
  request: { body: Record<string, unknown> };
  state: { organization: { id: string; slug: string } };
  method: string;
  path: string;
  ip: string;
  status: number;
  body?: unknown;
  responseHeaders: Record<string, string>;
  set(name: string, value: string): void;
}

/** Optional production-safe test seam that pauses a validated request before provider handoff. */
interface BridgeOptions {
  afterCredentialValidation?: () => Promise<void>;
}

/** A small deferred barrier used to control the validation/provider handoff ordering. */
interface DeferredBarrier {
  reached: Promise<void>;
  release(): void;
  wait(): Promise<void>;
}

/** Create a deterministic, single-use asynchronous barrier. */
function createBarrier(): DeferredBarrier {
  let markReached: () => void = () => undefined;
  let releaseWaiter: () => void = () => undefined;
  const reached = new Promise<void>((resolve) => {
    markReached = resolve;
  });
  const released = new Promise<void>((resolve) => {
    releaseWaiter = resolve;
  });
  return {
    reached,
    release: releaseWaiter,
    wait: async () => {
      markReached();
      await released;
    },
  };
}

/** Fail promptly when an implementation never reaches an expected test barrier. */
async function waitForBarrier(barrier: DeferredBarrier): Promise<void> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      barrier.reached,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error('Credential bridge did not reach the test barrier')),
          1_000,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

/** Construct middleware with its credential-free post-validation test hook. */
function createBridge(options: BridgeOptions = {}) {
  return Reflect.apply(clientSecretHash, undefined, [options]);
}

/** Create a Basic-auth context for one confidential-client token request. */
function createContext(params: {
  organization: { id: string; slug: string };
  clientId: string;
  secret: string;
  ip?: string;
}): BridgeContext {
  const encoded = Buffer.from(`${params.clientId}:${params.secret}`).toString('base64');
  const authorization = `Basic ${encoded}`;
  const responseHeaders: Record<string, string> = {};
  return {
    headers: { authorization },
    req: { headers: { authorization } },
    request: { body: { grant_type: 'client_credentials' } },
    state: { organization: params.organization },
    method: 'POST',
    path: `/${params.organization.slug}/token`,
    ip: params.ip ?? '192.0.2.1',
    status: 200,
    responseHeaders,
    set: (name, value) => {
      responseHeaders[name.toLowerCase()] = value;
    },
  };
}

/** Read the credential value currently carried by a Basic header. */
function basicSecret(context: BridgeContext): string {
  const authorization = context.headers.authorization;
  if (!authorization?.startsWith('Basic ')) return '';
  const decoded = Buffer.from(authorization.slice(6), 'base64').toString('utf8');
  return decoded.slice(decoded.indexOf(':') + 1);
}

/** Insert a legacy or SHA-backed secret for a client. */
async function addSecret(clientId: string, plaintext: string, modern: boolean): Promise<string> {
  const data: InsertSecretData = {
    clientId,
    secretHash: await clientCrypto.hashSecret(plaintext),
    secretSha256: modern ? clientCrypto.sha256Secret(plaintext) : null,
    label: null,
    expiresAt: null,
  };
  return (await insertSecret(data)).id;
}

/** Insert one legacy row directly to model a pre-cap database fixture. */
async function addLegacyFixtureRow(clientId: string, plaintext: string): Promise<void> {
  await getPool().query(
    `INSERT INTO client_secrets (client_id, secret_hash, secret_sha256, label, expires_at)
     VALUES ($1, $2, NULL, NULL, NULL)`,
    [clientId, await clientCrypto.hashSecret(plaintext)],
  );
}

/** Create a confidential client and return its tenant context. */
async function createConfidentialClient() {
  const organization = await createTestOrganization();
  const application = await createTestApplication();
  const client = await createTestClient(organization.id, application.id, {
    grantTypes: ['client_credentials'],
  });
  return { organization, client };
}

/** Invoke the bridge and record whether control reached the provider boundary. */
async function invokeBridge(context: BridgeContext, options: BridgeOptions = {}): Promise<boolean> {
  let handedOff = false;
  const next = async () => {
    handedOff = true;
  };
  await createBridge(options)(context as never, next);
  return handedOff;
}

/** Assert the fixed protective-denial shape without credential classification. */
function expectFixedDenial(context: BridgeContext, credential: string): void {
  expect(context.status).toBe(429);
  expect(context.responseHeaders['retry-after']).toMatch(/^\d+$/);
  expect(context.body).toEqual({
    error: 'rate_limit_exceeded',
    error_description: 'Too many token requests. Please try again later.',
    retry_after: expect.any(Number),
  });
  expect(JSON.stringify(context.body)).not.toContain(credential);
}

beforeEach(async () => {
  vi.restoreAllMocks();
  await truncateAllTables();
  await seedBaseData();
});

describe('client-secret bridge computational bounds', () => {
  it('should use indexed SHA-256 matching without Argon2 for valid and wrong modern credentials', async () => {
    // Modern-only authentication must not spend password-hashing work for either outcome.
    const { organization, client } = await createConfidentialClient();
    const valid = clientCrypto.generateSecret();
    const wrong = clientCrypto.generateSecret();
    await addSecret(client.id, valid, true);
    const verifyLegacy = vi.spyOn(clientCrypto, 'verifySecretHash');
    const validContext = createContext({ organization, clientId: client.clientId, secret: valid });
    const wrongContext = createContext({ organization, clientId: client.clientId, secret: wrong });

    expect(await invokeBridge(validContext)).toBe(true);
    expect(await invokeBridge(wrongContext)).toBe(true);
    expect(basicSecret(validContext)).toBe(clientCrypto.sha256Secret(valid));
    expect(basicSecret(wrongContext)).toBe(wrong);
    expect(verifyLegacy).not.toHaveBeenCalled();
  });

  it('should perform zero legacy checks when no active legacy candidate exists', async () => {
    const { organization, client } = await createConfidentialClient();
    const modern = clientCrypto.generateSecret();
    const wrong = clientCrypto.generateSecret();
    await addSecret(client.id, modern, true);
    const verifyLegacy = vi.spyOn(clientCrypto, 'verifySecretHash');
    const context = createContext({ organization, clientId: client.clientId, secret: wrong });

    expect(await invokeBridge(context)).toBe(true);
    expect(basicSecret(context)).toBe(wrong);
    expect(verifyLegacy).not.toHaveBeenCalled();
  });

  it('should check at most ten legacy hashes sequentially before canonicalizing a match', async () => {
    // The matching hash is deliberately oldest so all ten permitted candidates are visited.
    const { organization, client } = await createConfidentialClient();
    const modern = clientCrypto.generateSecret();
    await addSecret(client.id, modern, true);
    const legacy = clientCrypto.generateSecret();
    await addLegacyFixtureRow(client.id, legacy);
    for (let index = 0; index < 9; index += 1) {
      await addLegacyFixtureRow(client.id, clientCrypto.generateSecret());
    }
    const originalVerify = clientCrypto.verifySecretHash;
    const verifyLegacy = vi
      .spyOn(clientCrypto, 'verifySecretHash')
      .mockImplementation((hash, plaintext) => originalVerify(hash, plaintext));
    const context = createContext({ organization, clientId: client.clientId, secret: legacy });

    expect(await invokeBridge(context)).toBe(true);
    expect(basicSecret(context)).toBe(clientCrypto.sha256Secret(modern));
    expect(verifyLegacy).toHaveBeenCalledTimes(10);
  });

  it('should fail closed without Argon2 work when eleven legacy candidates exist', async () => {
    const { organization, client } = await createConfidentialClient();
    const presented = clientCrypto.generateSecret();
    await addSecret(client.id, clientCrypto.generateSecret(), true);
    for (let index = 0; index < 11; index += 1) {
      await addLegacyFixtureRow(client.id, index === 0 ? presented : clientCrypto.generateSecret());
    }
    const verifyLegacy = vi.spyOn(clientCrypto, 'verifySecretHash');
    const context = createContext({ organization, clientId: client.clientId, secret: presented });

    expect(await invokeBridge(context)).toBe(true);
    expect(basicSecret(context)).toBe(presented);
    expect(verifyLegacy).not.toHaveBeenCalled();
  });

  it('should return the same fixed denial when a concurrent legacy batch is busy', async () => {
    // Distinct callers cannot queue Argon2 batches or learn which presented credential was valid.
    const { organization, client } = await createConfidentialClient();
    const valid = clientCrypto.generateSecret();
    const invalid = clientCrypto.generateSecret();
    await addSecret(client.id, valid, false);
    await addSecret(client.id, clientCrypto.generateSecret(), true);
    const verificationStarted = createBarrier();
    vi.spyOn(clientCrypto, 'verifySecretHash').mockImplementation(async (_hash, plaintext) => {
      await verificationStarted.wait();
      return plaintext === valid;
    });
    const validContext = createContext({
      organization,
      clientId: client.clientId,
      secret: valid,
      ip: '192.0.2.10',
    });
    const invalidContext = createContext({
      organization,
      clientId: client.clientId,
      secret: invalid,
      ip: '198.51.100.20',
    });

    const admitted = invokeBridge(validContext);
    await waitForBarrier(verificationStarted);
    expect(await invokeBridge(invalidContext)).toBe(false);
    expectFixedDenial(invalidContext, invalid);
    verificationStarted.release();
    expect(await admitted).toBe(true);
  });

  it('should return the fixed denial after thirty admitted legacy attempts', async () => {
    // The issuer/client guard limits expensive legacy work without classifying attempt 31.
    const { organization, client } = await createConfidentialClient();
    const wrong = clientCrypto.generateSecret();
    await addSecret(client.id, clientCrypto.generateSecret(), false);
    await addSecret(client.id, clientCrypto.generateSecret(), true);
    vi.spyOn(clientCrypto, 'verifySecretHash').mockResolvedValue(false);

    for (let attempt = 0; attempt < 30; attempt += 1) {
      const admittedContext = createContext({
        organization,
        clientId: client.clientId,
        secret: wrong,
      });
      expect(await invokeBridge(admittedContext)).toBe(true);
    }

    const deniedContext = createContext({
      organization,
      clientId: client.clientId,
      secret: wrong,
    });
    expect(await invokeBridge(deniedContext)).toBe(false);
    expectFixedDenial(deniedContext, wrong);
  });
});

describe('client-secret bridge revocation handoff', () => {
  it('should finish an already validated request but reject a later request after revocation', async () => {
    // Revocation is re-read for each request; it does not invalidate work past provider handoff.
    const { organization, client } = await createConfidentialClient();
    const overlapping = clientCrypto.generateSecret();
    const canonical = clientCrypto.generateSecret();
    const overlappingId = await addSecret(client.id, overlapping, true);
    await addSecret(client.id, canonical, true);
    const handoff = createBarrier();
    const inFlightContext = createContext({
      organization,
      clientId: client.clientId,
      secret: overlapping,
    });

    const inFlight = invokeBridge(inFlightContext, {
      afterCredentialValidation: handoff.wait,
    });
    await waitForBarrier(handoff);
    await revokeSecret(client.id, overlappingId);
    handoff.release();

    expect(await inFlight).toBe(true);
    expect(basicSecret(inFlightContext)).toBe(clientCrypto.sha256Secret(canonical));

    const laterContext = createContext({
      organization,
      clientId: client.clientId,
      secret: overlapping,
    });
    expect(await invokeBridge(laterContext)).toBe(true);
    expect(basicSecret(laterContext)).toBe(overlapping);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Client } from '../../../src/clients/types.js';

const dependencies = vi.hoisted(() => ({
  getClientByClientId: vi.fn(),
  getLatestActiveSha256: vi.fn(),
  findActiveSecretIdBySha256: vi.fn(),
  getActiveLegacySecretHashes: vi.fn(),
  sha256Secret: vi.fn(),
  verifySecretHash: vi.fn(),
  checkRateLimitStrict: vi.fn(),
}));

vi.mock('../../../src/clients/service.js', () => ({
  getClientByClientId: dependencies.getClientByClientId,
}));

vi.mock('../../../src/clients/secret-repository.js', () => ({
  getLatestActiveSha256: dependencies.getLatestActiveSha256,
  findActiveSecretIdBySha256: dependencies.findActiveSecretIdBySha256,
  getActiveLegacySecretHashes: dependencies.getActiveLegacySecretHashes,
}));

vi.mock('../../../src/clients/crypto.js', () => ({
  sha256Secret: dependencies.sha256Secret,
  verifySecretHash: dependencies.verifySecretHash,
}));

vi.mock('../../../src/auth/rate-limiter.js', () => ({
  checkRateLimitStrict: dependencies.checkRateLimitStrict,
}));

import { clientSecretHash } from '../../../src/middleware/client-secret-hash.js';

/** Build the confidential client accepted by the bridge. */
function confidentialClient(): Client {
  return {
    id: 'client-db-id',
    organizationId: 'organization-id',
    applicationId: 'application-id',
    clientId: 'oidc-client-id',
    clientName: 'Bridge client',
    clientType: 'confidential',
    applicationType: 'web',
    redirectUris: ['https://client.example.test/callback'],
    postLogoutRedirectUris: [],
    grantTypes: ['authorization_code'],
    responseTypes: ['code'],
    scope: 'openid',
    tokenEndpointAuthMethod: 'client_secret_post',
    allowedOrigins: [],
    requirePkce: false,
    loginMethods: null,
    status: 'active',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };
}

/** Build the minimum post-authentication Koa context used by the bridge. */
function bridgeContext() {
  const body = { client_id: 'oidc-client-id', client_secret: 'presented-secret' };
  const responseHeaders: Record<string, string> = {};
  return {
    body,
    responseHeaders,
    ctx: {
      headers: {} as Record<string, string | undefined>,
      req: { headers: {} as Record<string, string | undefined>, body },
      request: { body },
      state: { organization: { id: 'organization-id' } },
      status: 200,
      body: undefined,
      set(name: string, value: string) {
        responseHeaders[name] = value;
      },
    },
  };
}

describe('client-secret bridge internal mechanics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dependencies.getClientByClientId.mockResolvedValue(confidentialClient());
    dependencies.getLatestActiveSha256.mockResolvedValue('canonical-sha256');
    dependencies.sha256Secret.mockReturnValue('presented-sha256');
    dependencies.findActiveSecretIdBySha256.mockResolvedValue('modern-secret-id');
    dependencies.getActiveLegacySecretHashes.mockResolvedValue([]);
    dependencies.verifySecretHash.mockResolvedValue(false);
    dependencies.checkRateLimitStrict.mockResolvedValue({
      allowed: true,
      remaining: 29,
      retryAfter: 0,
    });
  });

  it('uses indexed modern matching without Redis or Argon2 and orders hook before provider handoff', async () => {
    const { ctx, body } = bridgeContext();
    const events: string[] = [];
    const hook = vi.fn(async () => {
      expect(body.client_secret).toBe('canonical-sha256');
      events.push('hook');
    });
    const next = vi.fn(async () => {
      events.push('next');
    });

    await clientSecretHash({ afterCredentialValidation: hook })(ctx as never, next);

    expect(dependencies.findActiveSecretIdBySha256).toHaveBeenCalledWith(
      'client-db-id',
      'presented-sha256',
    );
    expect(dependencies.getActiveLegacySecretHashes).not.toHaveBeenCalled();
    expect(dependencies.checkRateLimitStrict).not.toHaveBeenCalled();
    expect(dependencies.verifySecretHash).not.toHaveBeenCalled();
    expect(hook).toHaveBeenCalledWith();
    expect(events).toEqual(['hook', 'next']);
  });

  it('refuses eleven legacy candidates before Redis or Argon2 work', async () => {
    dependencies.findActiveSecretIdBySha256.mockResolvedValue(null);
    dependencies.getActiveLegacySecretHashes.mockResolvedValue(
      Array.from({ length: 11 }, (_, index) => ({
        id: `legacy-${index}`,
        hash: `hash-${index}`,
      })),
    );
    const { ctx, body } = bridgeContext();
    const next = vi.fn().mockResolvedValue(undefined);

    await clientSecretHash()(ctx as never, next);

    expect(dependencies.checkRateLimitStrict).not.toHaveBeenCalled();
    expect(dependencies.verifySecretHash).not.toHaveBeenCalled();
    expect(body.client_secret).toBe('presented-secret');
    expect(next).toHaveBeenCalledOnce();
  });

  it('checks exactly ten legacy hashes sequentially after one Redis admission', async () => {
    dependencies.findActiveSecretIdBySha256.mockResolvedValue(null);
    dependencies.getActiveLegacySecretHashes.mockResolvedValue(
      Array.from({ length: 10 }, (_, index) => ({
        id: `legacy-${index}`,
        hash: `hash-${index}`,
      })),
    );
    let activeChecks = 0;
    let maximumConcurrentChecks = 0;
    dependencies.verifySecretHash.mockImplementation(async () => {
      activeChecks += 1;
      maximumConcurrentChecks = Math.max(maximumConcurrentChecks, activeChecks);
      await Promise.resolve();
      activeChecks -= 1;
      return false;
    });
    const { ctx, body } = bridgeContext();
    const next = vi.fn().mockResolvedValue(undefined);

    await clientSecretHash()(ctx as never, next);

    expect(dependencies.checkRateLimitStrict).toHaveBeenCalledOnce();
    expect(dependencies.verifySecretHash).toHaveBeenCalledTimes(10);
    expect(maximumConcurrentChecks).toBe(1);
    expect(body.client_secret).toBe('presented-secret');
    expect(next).toHaveBeenCalledOnce();
  });

  it.each([
    ['client repository', dependencies.getClientByClientId],
    ['canonical repository', dependencies.getLatestActiveSha256],
    ['modern repository', dependencies.findActiveSecretIdBySha256],
    ['legacy repository', dependencies.getActiveLegacySecretHashes],
  ] as const)('fails closed when the %s dependency rejects', async (_label, dependency) => {
    dependencies.findActiveSecretIdBySha256.mockResolvedValue(null);
    dependencies.getActiveLegacySecretHashes.mockResolvedValue([
      { id: 'legacy-id', hash: 'legacy-hash' },
    ]);
    dependency.mockRejectedValueOnce(new Error('dependency unavailable'));
    const { ctx, body } = bridgeContext();
    const next = vi.fn().mockResolvedValue(undefined);

    await clientSecretHash()(ctx as never, next);

    expect(body.client_secret).toBe('presented-secret');
    expect(next).toHaveBeenCalledOnce();
  });

  it('fails closed when Redis admission rejects', async () => {
    dependencies.findActiveSecretIdBySha256.mockResolvedValue(null);
    dependencies.getActiveLegacySecretHashes.mockResolvedValue([
      { id: 'legacy-id', hash: 'legacy-hash' },
    ]);
    dependencies.checkRateLimitStrict.mockRejectedValue(new Error('Redis unavailable'));
    const { ctx, body } = bridgeContext();
    const next = vi.fn().mockResolvedValue(undefined);

    await clientSecretHash()(ctx as never, next);

    expect(dependencies.verifySecretHash).not.toHaveBeenCalled();
    expect(body.client_secret).toBe('presented-secret');
    expect(next).toHaveBeenCalledOnce();
  });

  it('denies a concurrent legacy batch without queueing protected work', async () => {
    dependencies.findActiveSecretIdBySha256.mockResolvedValue(null);
    dependencies.getActiveLegacySecretHashes.mockResolvedValue([
      { id: 'legacy-id', hash: 'legacy-hash' },
    ]);
    let releaseFirstCheck: ((value: boolean) => void) | undefined;
    dependencies.verifySecretHash.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          releaseFirstCheck = resolve;
        }),
    );
    const first = bridgeContext();
    const second = bridgeContext();
    const firstNext = vi.fn().mockResolvedValue(undefined);
    const secondNext = vi.fn().mockResolvedValue(undefined);

    const firstRequest = clientSecretHash()(first.ctx as never, firstNext);
    await vi.waitFor(() => expect(dependencies.verifySecretHash).toHaveBeenCalledOnce());
    await clientSecretHash()(second.ctx as never, secondNext);

    expect(second.ctx.status).toBe(429);
    expect(second.responseHeaders['Retry-After']).toBe('1');
    expect(secondNext).not.toHaveBeenCalled();
    expect(dependencies.verifySecretHash).toHaveBeenCalledOnce();

    expect(releaseFirstCheck).toBeDefined();
    releaseFirstCheck!(false);
    await firstRequest;
    expect(firstNext).toHaveBeenCalledOnce();
  });

  it('releases legacy admission before continuing to the provider', async () => {
    dependencies.findActiveSecretIdBySha256.mockResolvedValue(null);
    dependencies.getActiveLegacySecretHashes.mockResolvedValue([
      { id: 'legacy-id', hash: 'legacy-hash' },
    ]);
    dependencies.verifySecretHash.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    let releaseProvider: (() => void) | undefined;
    const first = bridgeContext();
    const second = bridgeContext();
    const firstNext = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseProvider = resolve;
        }),
    );
    const secondNext = vi.fn().mockResolvedValue(undefined);

    const firstRequest = clientSecretHash()(first.ctx as never, firstNext);
    await vi.waitFor(() => expect(firstNext).toHaveBeenCalledOnce());
    await clientSecretHash()(second.ctx as never, secondNext);

    expect(second.ctx.status).toBe(200);
    expect(secondNext).toHaveBeenCalledOnce();
    expect(dependencies.verifySecretHash).toHaveBeenCalledTimes(2);
    expect(releaseProvider).toBeDefined();
    releaseProvider!();
    await firstRequest;
  });
});

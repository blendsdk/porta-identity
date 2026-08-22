import { createHash } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type ProviderListener = (context: unknown, error: unknown) => void;

const testState = vi.hoisted(() => ({
  listeners: new Map<string, ProviderListener>(),
  getClientByClientId: vi.fn(),
}));

vi.mock('oidc-provider', () => ({
  default: class ProviderStub {
    public proxy = false;

    public on(event: string, listener: ProviderListener): this {
      testState.listeners.set(event, listener);
      return this;
    }
  },
}));

vi.mock('../../../src/config/index.js', () => ({
  config: { cookieKeys: ['one', 'two'], issuerBaseUrl: 'https://porta.test' },
}));
vi.mock('../../../src/lib/redis.js', () => ({
  getRedis: () => ({ set: vi.fn().mockResolvedValue('OK') }),
}));
vi.mock('../../../src/oidc/configuration.js', () => ({
  buildProviderConfiguration: vi.fn(() => ({})),
}));
vi.mock('../../../src/oidc/adapter-factory.js', () => ({ createAdapterFactory: vi.fn() }));
vi.mock('../../../src/oidc/account-finder.js', () => ({ findAccount: vi.fn() }));
vi.mock('../../../src/middleware/oidc-cors.js', () => ({ oidcCors: vi.fn() }));
vi.mock('../../../src/clients/service.js', () => ({
  getClientByClientId: testState.getClientByClientId,
}));
vi.mock('../../../src/lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
  },
}));

import { logger } from '../../../src/lib/logger.js';
import { oidcClientTenantBinding } from '../../../src/middleware/oidc-client-tenant.js';
import { requestLogger } from '../../../src/middleware/request-logger.js';
import { createOidcProvider } from '../../../src/oidc/provider.js';

const CLIENT_ID = 'public-client-alpha';
const DOMAIN_SEPARATOR = 'porta:oidc-client-id:v1\0';

function clientDigest(clientId: string): string {
  return createHash('sha256').update(DOMAIN_SEPARATOR).update(clientId).digest('hex');
}

function requestContext(request: IncomingMessage): Record<string, unknown> {
  return {
    req: request,
    state: {},
    status: 400,
    method: 'GET',
    path: '/alpha/authorize',
    url: '/alpha/authorize?code=secret-code&state=secret-state&nonce=secret-nonce',
    query: { client_id: CLIENT_ID },
    request: { body: undefined },
    headers: {},
    set: vi.fn(),
  };
}

describe('protocol security rejection observation', () => {
  beforeEach(() => {
    testState.listeners.clear();
    testState.getClientByClientId.mockReset();
    vi.mocked(logger.info).mockClear();
    vi.mocked(logger.warn).mockClear();
  });

  it('emits one minimal correlated event for a classified provider rejection', async () => {
    const request = {} as IncomingMessage;
    const outerContext = requestContext(request);
    await requestLogger()(outerContext as never, vi.fn().mockResolvedValue(undefined));
    const requestId = (outerContext.state as { requestId: string }).requestId;

    await createOidcProvider({
      jwks: { keys: [] },
      ttl: {} as never,
    });
    const listener = testState.listeners.get('authorization.error');
    expect(listener).toBeTypeOf('function');

    listener?.(
      {
        req: request,
        oidc: { client: { clientId: CLIENT_ID }, params: { client_id: CLIENT_ID } },
      },
      { error: 'invalid_request', error_description: 'contains secret-code' },
    );

    expect(logger.warn).toHaveBeenCalledOnce();
    expect(logger.warn).toHaveBeenCalledWith(
      {
        event: 'protocol-security-rejection',
        'synthetic-correlation-id': requestId,
        'event-class': 'authorization-rejected',
        'public-client-id-digest': clientDigest(CLIENT_ID),
      },
      'protocol-security-rejection',
    );
    expect(JSON.stringify(vi.mocked(logger.warn).mock.calls)).not.toContain('secret-code');
    expect(JSON.stringify(vi.mocked(logger.warn).mock.calls)).not.toContain(CLIENT_ID);
  });

  it('observes a foreign-client rejection before provider execution without changing its response', async () => {
    const request = {} as IncomingMessage;
    const context = requestContext(request);
    context.state = { organization: { id: 'org-alpha' } };
    testState.getClientByClientId.mockResolvedValue({ organizationId: 'org-bravo' });

    const binding = oidcClientTenantBinding({
      AccessToken: { find: vi.fn().mockResolvedValue(undefined) },
    });
    const thrown = Object.assign(new Error('Client not found'), { status: 404 });
    context.throw = vi.fn(() => {
      throw thrown;
    });

    await expect(
      requestLogger()(context as never, () => binding(context as never, vi.fn())),
    ).rejects.toBe(thrown);

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'protocol-security-rejection',
        'event-class': 'client-tenant-binding-rejected',
        'public-client-id-digest': clientDigest(CLIENT_ID),
      }),
      'protocol-security-rejection',
    );
  });
});

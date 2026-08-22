import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/clients/service.js', () => ({
  getClientByClientId: vi.fn(),
}));

vi.mock('../../../src/oidc/protocol-security-observer.js', () => ({
  observeProtocolSecurityRejection: vi.fn(),
}));

import { getClientByClientId } from '../../../src/clients/service.js';
import { oidcClientTenantBinding } from '../../../src/middleware/oidc-client-tenant.js';
import { observeProtocolSecurityRejection } from '../../../src/oidc/protocol-security-observer.js';

/** Builds a minimal UserInfo request and retains response headers for assertions. */
function requestContext(options: {
  readonly method?: string;
  readonly authorization?: string;
  readonly body?: Readonly<Record<string, unknown>>;
  readonly query?: Readonly<Record<string, unknown>>;
}) {
  const responseHeaders = new Map<string, string>();
  return {
    method: options.method ?? 'GET',
    path: '/alpha/me',
    params: { orgSlug: 'alpha' },
    query: options.query ?? {},
    request: { body: options.body ?? {} },
    headers: { authorization: options.authorization },
    state: { organization: { id: 'alpha-organization' } },
    req: {},
    status: 0,
    body: undefined,
    set: (name: string, value: string) => responseHeaders.set(name, value),
    responseHeader: (name: string) => responseHeaders.get(name),
    throw: (status: number, message: string): never => {
      throw Object.assign(new Error(message), { status });
    },
  };
}

describe('opaque token tenant-binding implementation', () => {
  const accessTokenFind = vi.fn();
  const middleware = oidcClientTenantBinding({ AccessToken: { find: accessTokenFind } });

  beforeEach(() => {
    vi.clearAllMocks();
    accessTokenFind.mockReset();
  });

  it('should resolve the supported POST form token mechanism', async () => {
    accessTokenFind.mockResolvedValue({ clientId: 'alpha-client' });
    vi.mocked(getClientByClientId).mockResolvedValue({
      organizationId: 'alpha-organization',
      status: 'active',
    } as never);
    const next = vi.fn();

    await middleware(
      requestContext({ method: 'POST', body: { access_token: 'form-token' } }) as never,
      next,
    );

    expect(accessTokenFind).toHaveBeenCalledWith('form-token');
    expect(next).toHaveBeenCalledOnce();
  });

  it.each([
    ['inactive', { organizationId: 'alpha-organization', status: 'revoked' }],
    ['unknown', null],
    ['foreign', { organizationId: 'bravo-organization', status: 'active' }],
  ])('should reject an %s issuing client with one generic response', async (_label, client) => {
    accessTokenFind.mockResolvedValue({ clientId: 'bound-client' });
    vi.mocked(getClientByClientId).mockResolvedValue(client as never);
    const context = requestContext({ authorization: 'Bearer opaque-token' });
    const next = vi.fn();

    await middleware(context as never, next);

    expect(context.status).toBe(401);
    expect(context.body).toEqual({ error: 'invalid_token' });
    expect(context.responseHeader('WWW-Authenticate')).toBe('Bearer error="invalid_token"');
    expect(observeProtocolSecurityRejection).toHaveBeenCalledWith(
      expect.objectContaining({ eventClass: 'userinfo-rejected', clientId: 'bound-client' }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it.each([
    ['missing', {}],
    ['malformed header', { authorization: 'Basic abc' }],
    [
      'duplicate mechanisms',
      {
        method: 'POST',
        authorization: 'Bearer header-token',
        body: { access_token: 'form-token' },
      },
    ],
    ['query mechanism', { query: { access_token: 'query-token' } }],
    ['oversized header', { authorization: `Bearer ${'x'.repeat(8193)}` }],
  ])('should delegate %s input unchanged to oidc-provider', async (_label, options) => {
    const next = vi.fn();

    await middleware(requestContext(options) as never, next);

    expect(accessTokenFind).not.toHaveBeenCalled();
    expect(getClientByClientId).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
  });

  it('should propagate token-store failure without disclosing the token', async () => {
    accessTokenFind.mockRejectedValue(new Error('token store unavailable'));
    const next = vi.fn();

    await expect(
      middleware(requestContext({ authorization: 'Bearer private-opaque-token' }) as never, next),
    ).rejects.toThrow('token store unavailable');
    expect(observeProtocolSecurityRejection).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });
});

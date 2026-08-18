import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/clients/service.js', () => ({
  getClientByClientId: vi.fn(),
}));

import { getClientByClientId } from '../../../src/clients/service.js';
import { oidcClientTenantBinding } from '../../../src/middleware/oidc-client-tenant.js';

/** Creates the public request facts needed to verify opaque-token issuer binding. */
function userinfoContext(tenantOrganizationId: string, token: string) {
  const headers = new Map<string, string>();
  return {
    method: 'GET',
    path: '/bravo/me',
    params: { orgSlug: 'bravo' },
    query: {},
    request: { body: {} },
    headers: { authorization: `Bearer ${token}` },
    state: { organization: { id: tenantOrganizationId } },
    status: 0,
    body: undefined,
    set: (name: string, value: string) => headers.set(name, value),
    responseHeader: (name: string) => headers.get(name),
    throw: (status: number, message: string): never => {
      throw Object.assign(new Error(message), { status });
    },
  };
}

/** Invokes the binding factory through its public JavaScript call boundary. */
function bindingFor(provider: object) {
  const binding = Reflect.apply(oidcClientTenantBinding, undefined, [provider]);
  if (typeof binding !== 'function')
    throw new Error('OIDC tenant binding did not return middleware');
  return binding;
}

describe('opaque UserInfo token tenant binding', () => {
  beforeEach(() => vi.clearAllMocks());

  // An opaque access token is valid only beneath the issuer that owns its issuing client.
  it('should reject a valid token when its client belongs to another tenant issuer', async () => {
    const accessTokenFind = vi.fn().mockResolvedValue({ clientId: 'alpha-client' });
    vi.mocked(getClientByClientId).mockResolvedValue({
      organizationId: 'alpha-organization',
      status: 'active',
    } as never);
    const next = vi.fn();
    const context = userinfoContext('bravo-organization', 'opaque-alpha-token');

    await bindingFor({ AccessToken: { find: accessTokenFind } })(context, next);

    expect(accessTokenFind).toHaveBeenCalledWith('opaque-alpha-token');
    expect(getClientByClientId).toHaveBeenCalledWith('alpha-client');
    expect(context.status).toBe(401);
    expect(context.body).toEqual({ error: 'invalid_token' });
    expect(context.responseHeader('WWW-Authenticate')).toBe('Bearer error="invalid_token"');
    expect(next).not.toHaveBeenCalled();
  });

  it('should continue when the access token client belongs to the resolved tenant issuer', async () => {
    const accessTokenFind = vi.fn().mockResolvedValue({ clientId: 'bravo-client' });
    vi.mocked(getClientByClientId).mockResolvedValue({
      organizationId: 'bravo-organization',
      status: 'active',
    } as never);
    const next = vi.fn();

    await bindingFor({ AccessToken: { find: accessTokenFind } })(
      userinfoContext('bravo-organization', 'opaque-bravo-token'),
      next,
    );

    expect(next).toHaveBeenCalledOnce();
  });

  it('should leave absent or unrecognized bearer artifacts to the provider response boundary', async () => {
    const accessTokenFind = vi.fn().mockResolvedValue(undefined);
    const next = vi.fn();

    await bindingFor({ AccessToken: { find: accessTokenFind } })(
      userinfoContext('bravo-organization', 'unknown-token'),
      next,
    );

    expect(getClientByClientId).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
  });
});

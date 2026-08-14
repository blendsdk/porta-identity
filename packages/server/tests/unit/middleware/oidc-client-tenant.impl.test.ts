import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/clients/service.js', () => ({
  getClientByClientId: vi.fn(),
}));

import { getClientByClientId } from '../../../src/clients/service.js';
import { oidcClientTenantBinding } from '../../../src/middleware/oidc-client-tenant.js';
import type { Client } from '../../../src/clients/types.js';

/** Creates the client fields used by the tenant-binding middleware. */
function client(organizationId: string): Client {
  return {
    id: '10000000-0000-4000-8000-000000000001',
    organizationId,
    applicationId: '10000000-0000-4000-8000-000000000002',
    clientId: 'oidc-client',
    clientName: 'OIDC client',
    clientType: 'public',
    applicationType: 'spa',
    redirectUris: ['https://client.example/callback'],
    postLogoutRedirectUris: [],
    grantTypes: ['authorization_code'],
    responseTypes: ['code'],
    scope: 'openid',
    tokenEndpointAuthMethod: 'none',
    allowedOrigins: ['https://client.example'],
    requirePkce: true,
    loginMethods: null,
    status: 'active',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };
}

/** Creates a minimal Koa-shaped context for direct middleware execution. */
function context(options: {
  readonly queryClientId?: string;
  readonly bodyClientId?: string;
  readonly authorization?: string;
}) {
  return {
    query: options.queryClientId === undefined ? {} : { client_id: options.queryClientId },
    request: {
      body: options.bodyClientId === undefined ? {} : { client_id: options.bodyClientId },
    },
    headers: { authorization: options.authorization },
    state: { organization: { id: 'alpha-organization' } },
    throw: (status: number, message: string): never => {
      const error = new Error(message) as Error & { status: number };
      error.status = status;
      throw error;
    },
  };
}

describe('OIDC client tenant binding', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should continue when the query client belongs to the resolved issuer organization', async () => {
    vi.mocked(getClientByClientId).mockResolvedValue(client('alpha-organization'));
    const next = vi.fn();

    await oidcClientTenantBinding()(context({ queryClientId: 'alpha-client' }) as never, next);

    expect(getClientByClientId).toHaveBeenCalledWith('alpha-client');
    expect(next).toHaveBeenCalledOnce();
  });

  it('should hide a query client owned by another organization', async () => {
    vi.mocked(getClientByClientId).mockResolvedValue(client('bravo-organization'));
    const next = vi.fn();

    await expect(
      oidcClientTenantBinding()(context({ queryClientId: 'bravo-client' }) as never, next),
    ).rejects.toMatchObject({ status: 404, message: 'Client not found' });
    expect(next).not.toHaveBeenCalled();
  });

  it('should give an unknown client the same minimal response as a foreign client', async () => {
    vi.mocked(getClientByClientId).mockResolvedValue(null);

    await expect(
      oidcClientTenantBinding()(context({ bodyClientId: 'unknown-client' }) as never, vi.fn()),
    ).rejects.toMatchObject({ status: 404, message: 'Client not found' });
  });

  it('should validate the client identifier carried by HTTP Basic authentication', async () => {
    vi.mocked(getClientByClientId).mockResolvedValue(client('bravo-organization'));
    const authorization = `Basic ${Buffer.from('bravo-client:secret').toString('base64')}`;

    await expect(
      oidcClientTenantBinding()(context({ authorization }) as never, vi.fn()),
    ).rejects.toMatchObject({ status: 404, message: 'Client not found' });
    expect(getClientByClientId).toHaveBeenCalledWith('bravo-client');
  });

  it('should continue on discovery-style requests without a client identifier', async () => {
    const next = vi.fn();

    await oidcClientTenantBinding()(context({}) as never, next);

    expect(getClientByClientId).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
  });
});

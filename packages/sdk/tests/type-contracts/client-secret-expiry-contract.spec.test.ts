import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import { createClientsDomain } from '../../src/domains/clients.js';
import type { HttpTransport } from '../../src/transport/types.js';
import type { CreateClientInput } from '../../src/types/index.js';

const EXPIRY = '2027-03-31T00:00:00.000Z';

/** Build a transport that exposes the exact request made by the clients domain. */
function transport(): HttpTransport {
  return {
    request: vi.fn().mockResolvedValue({
      status: 201,
      headers: {},
      body: {
        data: {
          client: {
            id: 'client-id',
            organizationId: 'organization-id',
            applicationId: 'application-id',
            clientId: 'porta_client_id',
            clientName: 'Portal',
            clientType: 'confidential',
            applicationType: 'web',
            redirectUris: ['https://portal.example.test/callback'],
            postLogoutRedirectUris: [],
            grantTypes: ['authorization_code'],
            responseTypes: ['code'],
            scope: 'openid',
            tokenEndpointAuthMethod: 'client_secret_basic',
            allowedOrigins: [],
            requirePkce: true,
            loginMethods: null,
            effectiveLoginMethods: ['password'],
            status: 'active',
            createdAt: '2026-09-08T10:00:00.000Z',
            updatedAt: '2026-09-08T10:00:00.000Z',
          },
          secret: {
            id: 'secret-id',
            clientId: 'client-id',
            label: 'initial',
            plaintext: 'porta_secret_one_time_value',
            expiresAt: EXPIRY,
            createdAt: '2026-09-08T10:00:00.000Z',
          },
        },
      },
    }),
  };
}

/** Build the required portion of client creation input. */
function baseInput() {
  return {
    organizationId: 'organization-id',
    applicationId: 'application-id',
    clientName: 'Portal',
    clientType: 'confidential' as const,
    applicationType: 'web' as const,
    redirectUris: ['https://portal.example.test/callback'],
  };
}

describe('client initial-secret SDK contract', () => {
  it('should expose an optional string expiry on client creation input', () => {
    expectTypeOf<CreateClientInput>()
      .toHaveProperty('secretExpiresAt')
      .toEqualTypeOf<string | undefined>();

    const withExpiry: CreateClientInput = { ...baseInput(), secretExpiresAt: EXPIRY };
    const withoutExpiry: CreateClientInput = baseInput();

    expect(withExpiry.secretExpiresAt).toBe(EXPIRY);
    expect('secretExpiresAt' in withoutExpiry).toBe(false);
  });

  it('should send an included initial-secret expiry without changing its ISO string', async () => {
    const http = transport();
    const clients = createClientsDomain(http);
    const input: CreateClientInput = { ...baseInput(), secretExpiresAt: EXPIRY };

    await clients.create(input);

    expect(http.request).toHaveBeenCalledWith({
      method: 'POST',
      path: '/clients',
      body: input,
    });
  });

  it('should omit the expiry field when the caller requests a non-expiring secret', async () => {
    const http = transport();
    const clients = createClientsDomain(http);
    const input: CreateClientInput = baseInput();

    await clients.create(input);

    expect(http.request).toHaveBeenCalledWith({
      method: 'POST',
      path: '/clients',
      body: expect.not.objectContaining({ secretExpiresAt: expect.anything() }),
    });
  });
});

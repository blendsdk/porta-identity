import { describe, expect, it, vi } from 'vitest';

import { createClientsDomain } from '../../src/domains/clients.js';
import type { HttpTransport } from '../../src/transport/types.js';
import type { CreateClientInput } from '../../src/types/index.js';

const EXPIRY = '2027-03-31T00:00:00.000Z';

/** Build a complete Admin API create response with an overridable secret expiry. */
function createResponse(expiresAt: unknown = EXPIRY) {
  return {
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
          expiresAt,
          createdAt: '2026-09-08T10:00:00.000Z',
        },
      },
    },
  };
}

/** Build the minimum valid confidential client registration input. */
function createInput(): CreateClientInput {
  return {
    organizationId: 'organization-id',
    applicationId: 'application-id',
    clientName: 'Portal',
    clientType: 'confidential',
    applicationType: 'web',
    redirectUris: ['https://portal.example.test/callback'],
    secretExpiresAt: EXPIRY,
  };
}

describe('client secret expiry SDK implementation', () => {
  it('forwards the original creation input without synthesizing expiry policy', async () => {
    const transport: HttpTransport = { request: vi.fn().mockResolvedValue(createResponse()) };
    const input = createInput();

    await createClientsDomain(transport).create(input);

    expect(transport.request).toHaveBeenCalledWith({
      method: 'POST',
      path: '/clients',
      body: input,
    });
  });

  it('rejects a malformed secret expiry in the server response', async () => {
    const transport: HttpTransport = {
      request: vi.fn().mockResolvedValue(createResponse(123)),
    };

    await expect(createClientsDomain(transport).create(createInput())).rejects.toThrow(
      'Porta API returned an invalid response.',
    );
  });
});

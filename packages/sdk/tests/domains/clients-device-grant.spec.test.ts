/**
 * SDK specification for the device grant and empty device-only collections.
 *
 * The SDK must type and send the full URN, accept an empty redirect and
 * response-type collection only for a device-only client, and reject a
 * response that would silently drop the grant.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { HttpTransport, TransportResponse } from '../../src/transport/types.js';
import { createClientsDomain } from '../../src/domains/clients.js';
import { DEVICE_CODE_GRANT } from '../../src/types/index.js';
import type { CreateClientInput } from '../../src/types/index.js';

/** Full grant value used by the SDK contract. */
const DEVICE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code';

/** Build a transport with one fixed response. */
function mockTransport(response: Partial<TransportResponse> = {}): HttpTransport {
  return {
    request: vi.fn().mockResolvedValue({
      status: 200,
      headers: {},
      body: {},
      ...response,
    }),
  };
}

/** A valid device-only client response. */
function deviceClient(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c-device',
    organizationId: 'org-1',
    applicationId: 'app-1',
    clientId: 'device-client',
    clientName: 'Device client',
    clientType: 'public',
    applicationType: 'native',
    redirectUris: [],
    postLogoutRedirectUris: [],
    grantTypes: [DEVICE_GRANT],
    responseTypes: [],
    scope: 'openid profile',
    tokenEndpointAuthMethod: 'none',
    allowedOrigins: [],
    requirePkce: true,
    requireConsent: false,
    loginMethods: null,
    effectiveLoginMethods: ['password'],
    status: 'active',
    createdAt: '2026-11-25T10:00:00.000Z',
    updatedAt: '2026-11-25T10:00:00.000Z',
    ...overrides,
  };
}

describe('SDK device client contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exports the full device URN', () => {
    expect(DEVICE_CODE_GRANT).toBe(DEVICE_GRANT);
  });

  it('types and sends a device-only create input', async () => {
    const transport = mockTransport({
      status: 201,
      body: { data: { client: deviceClient(), secret: null } },
    });
    const clients = createClientsDomain(transport);
    const input: CreateClientInput = {
      organizationId: 'org-1',
      applicationId: 'app-1',
      clientName: 'Device client',
      clientType: 'public',
      applicationType: 'native',
      redirectUris: [],
      responseTypes: [],
      grantTypes: [DEVICE_CODE_GRANT],
    };

    const result = await clients.create(input);
    expect(result.client.grantTypes).toEqual([DEVICE_GRANT]);
    expect(result.client.redirectUris).toEqual([]);
    expect(result.client.responseTypes).toEqual([]);
    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        path: '/clients',
        body: expect.objectContaining({
          grantTypes: [DEVICE_GRANT],
          redirectUris: [],
          responseTypes: [],
        }),
      }),
    );
  });

  it('accepts a device-only response with empty collections', async () => {
    const transport = mockTransport({ body: { data: deviceClient() } });
    const clients = createClientsDomain(transport);

    const result = await clients.get('c-device');
    expect(result.data.grantTypes).toEqual([DEVICE_GRANT]);
    expect(result.data.responseTypes).toEqual([]);
  });

  it('rejects an unknown grant and empty response types on an auth-code client', async () => {
    const unknown = mockTransport({
      body: { data: deviceClient({ grantTypes: ['urn:example:unknown'] }) },
    });
    await expect(createClientsDomain(unknown).get('c-device')).rejects.toThrow();

    const authCodeEmpty = mockTransport({
      body: {
        data: deviceClient({
          grantTypes: ['authorization_code', 'refresh_token'],
          redirectUris: ['https://client.example/callback'],
        }),
      },
    });
    await expect(createClientsDomain(authCodeEmpty).get('c-device')).rejects.toThrow();
  });
});

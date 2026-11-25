/**
 * Admin API specification for device-only client creation and updates.
 *
 * The response contract is the complete resulting client configuration, not
 * the patch. These cases exercise the real Admin route, service validator and
 * PostgreSQL repository through a Super Admin bearer token.
 */

import { describe, expect, it } from 'vitest';
import { createTestApplication } from '../helpers/factories.js';
import {
  readClientHttpObject,
  useClientHttpFixture,
} from '../service-accounts/client-http-fixtures.js';

/** Full RFC 8628 grant value. */
const DEVICE_CODE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code';

/** Return true only for a non-array object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Read the created or updated client from the Admin response envelope. */
function readClient(body: Record<string, unknown>): Record<string, unknown> {
  const data = body['data'];
  if (!isRecord(data)) throw new Error('Admin response did not contain a data object');
  const nested = data['client'];
  if (isRecord(nested)) return nested;
  // Create returns `{ data: { client, secret } }`; update returns `{ data: client }`.
  if (typeof data['id'] === 'string') return data;
  throw new Error('Admin response did not contain a client object');
}

describe('Admin API device client contract', () => {
  const fixture = useClientHttpFixture();

  it('creates a device-only client with zero redirects and empty response types', async () => {
    const current = fixture();
    const application = await createTestApplication();
    const response = await current.request(current.actor, 'POST', '/api/admin/clients', {
      organizationId: current.adminOrganization.id,
      applicationId: application.id,
      clientName: 'Device-only Admin client',
      clientType: 'public',
      applicationType: 'native',
      redirectUris: [],
      responseTypes: [],
      grantTypes: [DEVICE_CODE_GRANT],
    });

    expect(response.status).toBe(201);
    const client = readClient(await readClientHttpObject(response));
    expect(client['grantTypes']).toEqual([DEVICE_CODE_GRANT]);
    expect(client['redirectUris']).toEqual([]);
    expect(client['responseTypes']).toEqual([]);
    expect(client['requirePkce']).toBe(true);
  });

  it('rejects invalid device and authorization-code combinations', async () => {
    const current = fixture();
    const application = await createTestApplication();
    const base = {
      organizationId: current.adminOrganization.id,
      applicationId: application.id,
      clientName: 'Invalid device client',
      clientType: 'public',
      applicationType: 'native',
    };

    const cases = [
      { grantTypes: ['authorization_code'], redirectUris: [], responseTypes: ['code'] },
      {
        grantTypes: [DEVICE_CODE_GRANT, 'authorization_code'],
        redirectUris: [],
        responseTypes: ['code'],
      },
      { grantTypes: [DEVICE_CODE_GRANT], redirectUris: [], responseTypes: ['code'] },
      { grantTypes: ['urn:example:unknown'], redirectUris: [], responseTypes: [] },
    ];
    for (const invalid of cases) {
      const response = await current.request(current.actor, 'POST', '/api/admin/clients', {
        ...base,
        ...invalid,
      });
      expect(response.status).toBe(400);
    }
  });

  it('does not enable the device grant when grantTypes is omitted', async () => {
    const current = fixture();
    const application = await createTestApplication();
    const response = await current.request(current.actor, 'POST', '/api/admin/clients', {
      organizationId: current.adminOrganization.id,
      applicationId: application.id,
      clientName: 'Default grant client',
      clientType: 'public',
      applicationType: 'web',
      redirectUris: ['https://client.example/callback'],
    });

    expect(response.status).toBe(201);
    const client = readClient(await readClientHttpObject(response));
    expect(client['grantTypes']).not.toContain(DEVICE_CODE_GRANT);
  });

  it('converts an authorization-code client to device-only and rejects a stale ETag', async () => {
    const current = fixture();
    const application = await createTestApplication();
    const created = await current.request(current.actor, 'POST', '/api/admin/clients', {
      organizationId: current.adminOrganization.id,
      applicationId: application.id,
      clientName: 'Convertible client',
      clientType: 'public',
      applicationType: 'web',
      redirectUris: ['https://client.example/callback'],
      grantTypes: ['authorization_code', 'refresh_token'],
      responseTypes: ['code'],
    });
    expect(created.status).toBe(201);
    const createdClient = readClient(await readClientHttpObject(created));
    const clientId = createdClient['id'];
    if (typeof clientId !== 'string') throw new Error('Created client has no id');

    const updateBody = {
      grantTypes: [DEVICE_CODE_GRANT],
      redirectUris: [],
      responseTypes: [],
    };
    const stale = await current.requestWith(
      current.actor,
      'PUT',
      `/api/admin/clients/${clientId}`,
      { body: updateBody, headers: { 'If-Match': '"stale-etag"' } },
    );
    expect(stale.status).toBe(409);

    const updated = await current.request(current.actor, 'PUT', `/api/admin/clients/${clientId}`, updateBody);
    expect(updated.status).toBe(200);
    const client = readClient(await readClientHttpObject(updated));
    expect(client['grantTypes']).toEqual([DEVICE_CODE_GRANT]);
    expect(client['redirectUris']).toEqual([]);
    expect(client['responseTypes']).toEqual([]);
  });
});

/** Specification tests for the SDK resource-server wire contract. */

import { describe, expect, it, vi } from 'vitest';

import { createApplicationsDomain } from '../src/domains/applications.js';
import type { HttpTransport, TransportResponse } from '../src/transport/types.js';

const sample = {
  id: '11111111-1111-4111-8111-111111111111',
  applicationId: '22222222-2222-4222-8222-222222222222',
  slug: 'billing-api',
  name: 'Billing API',
  identifier: 'https://billing.example.test',
  audience: 'https://api.billing.example.test',
  scopes: ['billing:read', 'billing:write'],
  createdAt: '2026-11-09T00:00:00.000Z',
  updatedAt: '2026-11-09T00:00:00.000Z',
};

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

describe('SDK resource-server contract', () => {
  it('lists resource servers through the applications domain', async () => {
    const transport = mockTransport({ body: { data: [sample] } });
    const apps = createApplicationsDomain(transport);

    const result = await apps.listResourceServers('acme');

    expect(transport.request).toHaveBeenCalledWith({
      method: 'GET',
      path: '/applications/acme/resource-servers',
    });
    expect(result).toEqual([sample]);
  });

  it('gets one resource server by UUID or slug', async () => {
    const transport = mockTransport({ body: { data: sample } });
    const apps = createApplicationsDomain(transport);

    const result = await apps.getResourceServer('acme', 'billing-api');

    expect(transport.request).toHaveBeenCalledWith({
      method: 'GET',
      path: '/applications/acme/resource-servers/billing-api',
    });
    expect(result).toEqual(sample);
  });

  it('creates a resource server with the exact body', async () => {
    const input = {
      name: 'Billing API',
      identifier: 'https://billing.example.test',
      scopes: ['billing:read'],
    };
    const transport = mockTransport({ status: 201, body: { data: sample } });
    const apps = createApplicationsDomain(transport);

    const result = await apps.createResourceServer('acme', input);

    expect(transport.request).toHaveBeenCalledWith({
      method: 'POST',
      path: '/applications/acme/resource-servers',
      body: input,
    });
    expect(result).toEqual(sample);
  });

  it('updates a resource server with the exact path and body', async () => {
    const input = {
      name: 'Billing API',
      slug: 'billing-api',
      identifier: 'https://billing.example.test',
      audience: 'https://api.billing.example.test',
      scopes: ['billing:read'],
    };
    const transport = mockTransport({ body: { data: sample } });
    const apps = createApplicationsDomain(transport);

    const result = await apps.updateResourceServer('acme', 'billing-api', input);

    expect(transport.request).toHaveBeenCalledWith({
      method: 'PUT',
      path: '/applications/acme/resource-servers/billing-api',
      body: input,
    });
    expect(result).toEqual(sample);
  });

  it('deletes a resource server and resolves void on an empty 204', async () => {
    const transport = mockTransport({ status: 204, body: undefined });
    const apps = createApplicationsDomain(transport);

    await expect(apps.deleteResourceServer('acme', 'billing-api')).resolves.toBeUndefined();

    expect(transport.request).toHaveBeenCalledWith({
      method: 'DELETE',
      path: '/applications/acme/resource-servers/billing-api',
    });
  });

  it('rejects a list response that is not an array of resource servers', async () => {
    const transport = mockTransport({ body: { data: [{ id: 'missing-fields' }] } });
    const apps = createApplicationsDomain(transport);

    await expect(apps.listResourceServers('acme')).rejects.toThrow(
      'Porta API returned an invalid response.',
    );
  });

  it('rejects a single response missing the audience or scopes fields', async () => {
    const transport = mockTransport({
      body: { data: { ...sample, audience: undefined } },
    });
    const apps = createApplicationsDomain(transport);

    await expect(apps.getResourceServer('acme', 'billing-api')).rejects.toThrow(
      'Porta API returned an invalid response.',
    );
  });
});

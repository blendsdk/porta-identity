/** Implementation tests for SDK resource-server response and error edges. */

import { describe, expect, it, vi } from 'vitest';

import { createApplicationsDomain } from '../src/domains/applications.js';
import type { HttpTransport, TransportResponse } from '../src/transport/types.js';

const sample = {
  id: '11111111-1111-4111-8111-111111111111',
  applicationId: '22222222-2222-4222-8222-222222222222',
  slug: 'billing-api',
  name: 'Billing API',
  identifier: 'https://billing.example.test',
  audience: 'https://billing.example.test',
  scopes: [],
  createdAt: '2026-11-09T00:00:00.000Z',
  updatedAt: '2026-11-09T00:00:00.000Z',
};

function transport(response: Partial<TransportResponse>): HttpTransport {
  return {
    request: vi.fn().mockResolvedValue({ status: 200, headers: {}, body: {}, ...response }),
  };
}

describe('SDK resource-server implementation edges', () => {
  it('rejects a list body with a non-array data value', async () => {
    const apps = createApplicationsDomain(transport({ body: { data: { id: sample.id } } }));
    await expect(apps.listResourceServers('acme')).rejects.toThrow(
      'Porta API returned an invalid response.',
    );
  });

  it('rejects a single body with a non-string scope entry', async () => {
    const apps = createApplicationsDomain(
      transport({ body: { data: { ...sample, scopes: [1] } } }),
    );
    await expect(apps.getResourceServer('acme', sample.id)).rejects.toThrow(
      'Porta API returned an invalid response.',
    );
  });

  it('propagates a transport error without retrying', async () => {
    const failure = new Error('Server unavailable');
    const http: HttpTransport = { request: vi.fn().mockRejectedValue(failure) };
    const apps = createApplicationsDomain(http);

    await expect(apps.deleteResourceServer('acme', sample.id)).rejects.toBe(failure);
    expect(http.request).toHaveBeenCalledOnce();
  });
});

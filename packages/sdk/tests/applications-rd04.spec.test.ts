import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import { createApplicationsDomain, type ApplicationsDomain } from '../src/domains/applications.js';
import type { HttpTransport, TransportResponse } from '../src/transport/types.js';
import type {
  Application,
  ApplicationModule,
  CreateApplicationInput,
  UpdateApplicationInput,
  UpdateModuleInput,
} from '../src/types/index.js';

const APPLICATION_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const MODULE_ID = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';

const application = {
  id: APPLICATION_ID,
  name: 'Porta product',
  slug: 'porta-product',
  description: null,
  status: 'active',
  createdAt: '2026-08-30T10:00:00.000Z',
  updatedAt: '2026-08-30T11:00:00.000Z',
};

/** Build a transport whose ordered responses make every HTTP request observable. */
function transportWith(...responses: Array<Partial<TransportResponse>>): HttpTransport {
  const request = vi.fn();
  for (const response of responses) {
    request.mockResolvedValueOnce({ status: 200, headers: {}, body: {}, ...response });
  }
  return { request };
}

type ExpectedApplication = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: 'active' | 'inactive' | 'archived';
  createdAt: string;
  updatedAt: string;
};

type ExpectedApplicationModule = {
  id: string;
  applicationId: string;
  name: string;
  slug: string;
  description: string | null;
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
};

describe('RD-04 application SDK contract', () => {
  it.each([
    ['activate', 'activate'],
    ['deactivate', 'deactivate'],
    ['archive', 'archive'],
  ] as const)(
    'ST-16 sends %s through the internal application UUID POST route',
    async (method, path) => {
      const transport = transportWith();
      const applications = createApplicationsDomain(transport);

      expect(typeof applications[method]).toBe('function');
      await applications[method](APPLICATION_ID);

      expect(transport.request).toHaveBeenCalledWith({
        method: 'POST',
        path: `/applications/${APPLICATION_ID}/${path}`,
      });
    },
  );

  it('ST-16 exposes no restore operation', () => {
    const applications = createApplicationsDomain(transportWith());
    expect('restore' in applications).toBe(false);
  });

  it('ST-17 sends only mutable application fields to the internal UUID route', async () => {
    const response = {
      id: APPLICATION_ID,
      name: 'Renamed product',
      slug: 'stable-product',
      description: null,
      status: 'active',
      createdAt: '2026-08-30T10:00:00.000Z',
      updatedAt: '2026-08-30T11:00:00.000Z',
    };
    const transport = transportWith({ body: { data: response } });
    const applications = createApplicationsDomain(transport);
    const input: UpdateApplicationInput = { name: 'Renamed product', description: null };

    await expect(applications.update(APPLICATION_ID, input)).resolves.toEqual(response);
    expect(transport.request).toHaveBeenCalledWith({
      method: 'PUT',
      path: `/applications/${APPLICATION_ID}`,
      body: { name: 'Renamed product', description: null },
      headers: {},
    });
  });

  it('ST-18 updates a module through both internal UUIDs', async () => {
    const module = {
      id: MODULE_ID,
      applicationId: APPLICATION_ID,
      name: 'Billing',
      slug: 'billing',
      description: null,
      status: 'active',
      createdAt: '2026-08-30T10:00:00.000Z',
      updatedAt: '2026-08-30T11:00:00.000Z',
    };
    const transport = transportWith({ body: { data: module } });
    const applications = createApplicationsDomain(transport);
    const input: UpdateModuleInput = { name: 'Billing', description: null };

    await expect(applications.updateModule(APPLICATION_ID, MODULE_ID, input)).resolves.toEqual(
      module,
    );
    expect(transport.request).toHaveBeenCalledWith({
      method: 'PUT',
      path: `/applications/${APPLICATION_ID}/modules/${MODULE_ID}`,
      body: input,
    });
  });

  it('ST-18 deactivates a module through both internal UUIDs and exposes no delete operation', async () => {
    const transport = transportWith();
    const applications = createApplicationsDomain(transport);

    expect(typeof applications.deactivateModule).toBe('function');
    await applications.deactivateModule(APPLICATION_ID, MODULE_ID);

    expect(transport.request).toHaveBeenCalledWith({
      method: 'POST',
      path: `/applications/${APPLICATION_ID}/modules/${MODULE_ID}/deactivate`,
    });
    expect('removeModule' in applications).toBe(false);
  });

  it('ST-22 rejects listAll when a later application page fails', async () => {
    const transport = transportWith({
      body: { data: [application], total: 2, page: 1, totalPages: 2 },
    });
    vi.mocked(transport.request).mockRejectedValueOnce(new Error('second page unavailable'));
    const applications = createApplicationsDomain(transport);

    await expect(applications.listAll()).rejects.toThrow('second page unavailable');
    expect(transport.request).toHaveBeenNthCalledWith(1, {
      method: 'GET',
      path: '/applications',
      params: { page: 1 },
    });
    expect(transport.request).toHaveBeenNthCalledWith(2, {
      method: 'GET',
      path: '/applications',
      params: { page: 2 },
    });
  });

  it('keeps the public application and module types exact', () => {
    expectTypeOf<Application>().toEqualTypeOf<ExpectedApplication>();
    expectTypeOf<ApplicationModule>().toEqualTypeOf<ExpectedApplicationModule>();
    expectTypeOf<CreateApplicationInput>().toEqualTypeOf<{
      name: string;
      slug?: string;
      description?: string;
    }>();
    expectTypeOf<UpdateApplicationInput>().toEqualTypeOf<{
      name?: string;
      description?: string | null;
    }>();
    expectTypeOf<
      Extract<keyof ApplicationsDomain, 'restore' | 'removeModule'>
    >().toEqualTypeOf<never>();
  });
});

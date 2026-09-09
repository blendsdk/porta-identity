import { describe, expect, it, vi } from 'vitest';
import { executeTool, getToolDefinitions } from '../../src/agent.js';
import { createPortaClient } from '../../src/client.js';
import type { HttpTransport, TransportResponse } from '../../src/transport/types.js';

const APPLICATION_ID = '11111111-1111-4111-8111-111111111111';
const PERMISSION_ID = '55555555-5555-4555-8555-555555555555';

const permission = {
  id: PERMISSION_ID,
  applicationId: APPLICATION_ID,
  moduleId: null,
  name: 'Read invoices',
  slug: 'billing:invoice:read',
  description: null,
  createdAt: '2026-09-09T10:00:00.000Z',
};

/** Build one deterministic transport response for an agent contract case. */
function transportWith(body: unknown): HttpTransport {
  return {
    request: vi.fn().mockResolvedValue({
      status: 200,
      headers: {},
      body,
    } satisfies TransportResponse),
  };
}

/** Find one published tool definition or fail with a useful assertion. */
function tool(name: string) {
  const definition = getToolDefinitions().find((candidate) => candidate.name === name);
  expect(definition, name).toBeDefined();
  if (!definition) throw new Error(`Missing agent tool: ${name}`);
  return definition;
}

describe('RBAC agent contracts', () => {
  // Agent metadata must describe the complete collection contracts and permission updates.
  it('describes the complete role array without pagination', () => {
    expect(tool('roles.list')).toMatchObject({
      parameters: [expect.objectContaining({ name: 'appId', required: true })],
      returns: 'Role[]',
    });
  });

  it('describes the filtered complete permission array without pagination', () => {
    expect(tool('permissions.list')).toMatchObject({
      parameters: [
        expect.objectContaining({ name: 'appId', required: true }),
        expect.objectContaining({ name: 'params', type: 'object', required: false }),
      ],
      returns: 'Permission[]',
    });
  });

  it('exposes permission metadata updates', () => {
    expect(tool('permissions.update')).toMatchObject({
      parameters: [
        expect.objectContaining({ name: 'appId' }),
        expect.objectContaining({ name: 'permissionId' }),
        expect.objectContaining({ name: 'input', type: 'object' }),
      ],
      returns: 'Permission',
    });
  });

  // Permission updates must use the same parent-qualified SDK call as direct consumers.
  it('dispatches permission updates through the existing domain', async () => {
    const transport = transportWith({ data: permission });
    const client = createPortaClient({ transport });

    await expect(
      executeTool(client, 'permissions.update', {
        appId: APPLICATION_ID,
        permissionId: PERMISSION_ID,
        input: { name: 'Updated', description: null },
      }),
    ).resolves.toEqual({ success: true, data: permission });
    expect(transport.request).toHaveBeenCalledWith({
      method: 'PUT',
      path: `/applications/${APPLICATION_ID}/permissions/${PERMISSION_ID}`,
      body: { name: 'Updated', description: null },
    });
  });
});

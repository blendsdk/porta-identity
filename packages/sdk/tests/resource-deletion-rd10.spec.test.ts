import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import { executeTool, getToolDefinitions } from '../src/agent.js';
import { createPortaClient } from '../src/client.js';
import {
  createApplicationsDomain,
  type ApplicationsDomain,
} from '../src/domains/applications.js';
import { createClientsDomain, type ClientsDomain } from '../src/domains/clients.js';
import {
  createCustomClaimsDomain,
  type CustomClaimsDomain,
} from '../src/domains/custom-claims.js';
import {
  createOrganizationsDomain,
  type OrganizationsDomain,
} from '../src/domains/organizations.js';
import {
  createPermissionsDomain,
  type PermissionsDomain,
} from '../src/domains/permissions.js';
import { createRolesDomain, type RolesDomain } from '../src/domains/roles.js';
import { createUsersDomain, type UsersDomain } from '../src/domains/users.js';
import type { HttpTransport } from '../src/transport/types.js';
import type {
  ApplicationStatus,
  ClientStatus,
  OrganizationStatus,
} from '../src/types/index.js';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const APPLICATION_ID = '22222222-2222-4222-8222-222222222222';
const MODULE_ID = '33333333-3333-4333-8333-333333333333';
const CLIENT_ID = '44444444-4444-4444-8444-444444444444';
const ROLE_ID = '55555555-5555-4555-8555-555555555555';
const PERMISSION_ID = '66666666-6666-4666-8666-666666666666';
const CLAIM_ID = '77777777-7777-4777-8777-777777777777';
const USER_ID = '88888888-8888-4888-8888-888888888888';

/** Build one transport that makes the complete request descriptor observable. */
function observableTransport(): HttpTransport {
  return {
    request: vi.fn().mockResolvedValue({ status: 204, headers: {}, body: undefined }),
  };
}

/** Read a planned operation without weakening the public compile-time contract assertions. */
function operation(domain: object, method: string): (...args: string[]) => Promise<unknown> {
  const candidate = Reflect.get(domain, method);
  expect(typeof candidate).toBe('function');
  if (typeof candidate !== 'function') throw new TypeError(`Missing SDK operation: ${method}`);
  return (...args) => Promise.resolve(Reflect.apply(candidate, domain, args));
}

const deletionCases = [
  {
    domain: createOrganizationsDomain,
    method: 'delete',
    args: [ORGANIZATION_ID],
    path: `/organizations/${ORGANIZATION_ID}`,
    tool: 'organizations.delete',
    parameters: ['idOrSlug'],
  },
  {
    domain: createApplicationsDomain,
    method: 'delete',
    args: [APPLICATION_ID],
    path: `/applications/${APPLICATION_ID}`,
    tool: 'applications.delete',
    parameters: ['id'],
  },
  {
    domain: createApplicationsDomain,
    method: 'deleteModule',
    args: [APPLICATION_ID, MODULE_ID],
    path: `/applications/${APPLICATION_ID}/modules/${MODULE_ID}`,
    tool: 'applications.deleteModule',
    parameters: ['appId', 'moduleId'],
  },
  {
    domain: createClientsDomain,
    method: 'delete',
    args: [CLIENT_ID],
    path: `/clients/${CLIENT_ID}`,
    tool: 'clients.delete',
    parameters: ['id'],
  },
  {
    domain: createRolesDomain,
    method: 'delete',
    args: [APPLICATION_ID, ROLE_ID],
    path: `/applications/${APPLICATION_ID}/roles/${ROLE_ID}`,
    tool: 'roles.delete',
    parameters: ['appId', 'roleId'],
  },
  {
    domain: createPermissionsDomain,
    method: 'delete',
    args: [APPLICATION_ID, PERMISSION_ID],
    path: `/applications/${APPLICATION_ID}/permissions/${PERMISSION_ID}`,
    tool: 'permissions.delete',
    parameters: ['appId', 'permissionId'],
  },
  {
    domain: createCustomClaimsDomain,
    method: 'delete',
    args: [APPLICATION_ID, CLAIM_ID],
    path: `/applications/${APPLICATION_ID}/claims/${CLAIM_ID}`,
    tool: 'customClaims.delete',
    parameters: ['appId', 'claimId'],
  },
  {
    domain: createUsersDomain,
    method: 'delete',
    args: [ORGANIZATION_ID, USER_ID],
    path: `/organizations/${ORGANIZATION_ID}/users/${USER_ID}`,
    tool: 'users.delete',
    parameters: ['orgId', 'userId'],
  },
] as const;

describe('record deletion SDK contract', () => {
  it.each(deletionCases)(
    'ST-28 sends $tool to the exact bodyless DELETE path and resolves void',
    async ({ domain: createDomain, method, args, path }) => {
      const transport = observableTransport();
      const domain = createDomain(transport);

      await expect(operation(domain, method)(...args)).resolves.toBeUndefined();
      expect(transport.request).toHaveBeenCalledOnce();
      expect(transport.request).toHaveBeenCalledWith({ method: 'DELETE', path });
    },
  );

  it.each(deletionCases)(
    'ST-28 propagates a fixed transport failure from $tool unchanged',
    async ({ domain: createDomain, method, args, tool }) => {
      const fixedFailure = new Error(`${tool} failed`);
      const transport: HttpTransport = { request: vi.fn().mockRejectedValue(fixedFailure) };
      const domain = createDomain(transport);

      await expect(operation(domain, method)(...args)).rejects.toBe(fixedFailure);
    },
  );

  it('ST-29 keeps only reversible resource statuses in public unions', () => {
    expectTypeOf<OrganizationStatus>().toEqualTypeOf<'active' | 'suspended'>();
    expectTypeOf<ApplicationStatus>().toEqualTypeOf<'active' | 'inactive'>();
    expectTypeOf<ClientStatus>().toEqualTypeOf<'active' | 'inactive'>();
  });

  it('ST-29 removes obsolete lifecycle aliases from public domain types', () => {
    expectTypeOf<
      Extract<keyof OrganizationsDomain, 'archive' | 'restore' | 'destroy'>
    >().toEqualTypeOf<never>();
    expectTypeOf<Extract<keyof ApplicationsDomain, 'archive'>>().toEqualTypeOf<never>();
    expectTypeOf<Extract<keyof ClientsDomain, 'revoke'>>().toEqualTypeOf<never>();
    expectTypeOf<Extract<keyof RolesDomain, 'archive' | 'remove'>>().toEqualTypeOf<never>();
    expectTypeOf<Extract<keyof PermissionsDomain, 'archive'>>().toEqualTypeOf<never>();
    expectTypeOf<Extract<keyof CustomClaimsDomain, 'archive'>>().toEqualTypeOf<never>();
    expectTypeOf<Extract<keyof UsersDomain, 'purge'>>().toEqualTypeOf<never>();
  });

  it('ST-29 publishes all eight bodyless deletion agent tools and no removed aliases', () => {
    const tools = getToolDefinitions();
    const names = tools.map(({ name }) => name);

    for (const deletion of deletionCases) {
      expect(tools.find(({ name }) => name === deletion.tool)).toEqual(
        expect.objectContaining({
          parameters: deletion.parameters.map((name) => expect.objectContaining({ name })),
          returns: 'void',
        }),
      );
    }

    expect(names).not.toEqual(
      expect.arrayContaining([
        'organizations.archive',
        'organizations.restore',
        'organizations.destroy',
        'applications.archive',
        'clients.revoke',
        'roles.archive',
        'roles.remove',
        'permissions.archive',
        'customClaims.archive',
        'users.purge',
      ]),
    );
    expect(names).toEqual(
      expect.arrayContaining(['clients.revokeSecret', 'sessions.revoke', 'sessions.revokeForUser']),
    );
  });

  it.each(deletionCases)('ST-29 dispatches $tool with its exact positional arguments', async (testCase) => {
    const sdkMethod = vi.fn().mockResolvedValue(undefined);
    const [domainName] = testCase.tool.split('.');
    const client = createPortaClient({ transport: observableTransport() });
    const domain = Reflect.get(client, domainName!);
    expect(typeof domain).toBe('object');
    Reflect.set(domain, testCase.method, sdkMethod);
    const args = Object.fromEntries(
      testCase.parameters.map((parameter, index) => [parameter, testCase.args[index]]),
    );

    await expect(executeTool(client, testCase.tool, args)).resolves.toEqual({
      success: true,
      data: undefined,
    });
    expect(sdkMethod).toHaveBeenCalledOnce();
    expect(sdkMethod).toHaveBeenCalledWith(...testCase.args);
  });
});

/** Focused implementation edges for application and OIDC-client workflow ownership. */

import { describe, expect, it, vi } from 'vitest';

const applicationId = '11111111-1111-4111-8111-111111111111';
const organizationId = '22222222-2222-4222-8222-222222222222';
const clientId = '33333333-3333-4333-8333-333333333333';
const secretId = '44444444-4444-4444-8444-444444444444';
const timestamp = '2026-08-30T10:00:00.000Z';
const otherOrganizationId = '55555555-5555-4555-8555-555555555555';

/** Builds a complete application response for adapter tests. */
function application(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: applicationId,
    name: 'Payments',
    slug: 'payments',
    description: null,
    status: 'active',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

/** Builds a complete organization-owned client response for adapter tests. */
function client(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: clientId,
    organizationId,
    applicationId,
    clientId: 'generated-client-id',
    clientName: 'Payments web client',
    clientType: 'confidential',
    applicationType: 'web',
    redirectUris: ['https://payments.example.test/callback'],
    postLogoutRedirectUris: [],
    grantTypes: ['authorization_code'],
    responseTypes: ['code'],
    scope: 'openid',
    tokenEndpointAuthMethod: 'client_secret_basic',
    allowedOrigins: [],
    requirePkce: false,
    loginMethods: null,
    effectiveLoginMethods: ['password'],
    status: 'active',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

/** Supplies the SDK application methods used by the focused adapter. */
function applicationDomain(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    listAll: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    activate: vi.fn(),
    deactivate: vi.fn(),
    archive: vi.fn(),
    listModules: vi.fn(),
    addModule: vi.fn(),
    updateModule: vi.fn(),
    deactivateModule: vi.fn(),
    ...overrides,
  };
}

/** Supplies the SDK client methods used by the focused adapter. */
function clientDomain(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    listAll: vi.fn(),
    get: vi.fn().mockResolvedValue({ data: client(), etag: null }),
    create: vi.fn(),
    update: vi.fn(),
    activate: vi.fn(),
    deactivate: vi.fn(),
    revoke: vi.fn(),
    listSecrets: vi.fn(),
    generateSecret: vi.fn(),
    revokeSecret: vi.fn(),
    ...overrides,
  };
}

/** Builds the authenticated state used by controller implementation tests. */
function authenticated(): Record<string, unknown> {
  return {
    kind: 'authenticated',
    server: new URL('https://porta.example.test'),
    identity: { sub: 'admin-1', email: 'admin@example.test' },
    capabilities: {
      canReadOrganizations: true,
      canCreateOrganizations: false,
      canReadUsers: false,
      canCreateUsers: false,
      canInviteUsers: false,
      canUpdateUsers: false,
      canManageUserLifecycle: false,
      canPurgeUsers: false,
      canReadApplications: true,
      canCreateApplications: true,
      canUpdateApplications: true,
      canArchiveApplications: true,
      canReadClients: true,
      canCreateClients: true,
      canUpdateClients: true,
      canRevokeClients: true,
    },
    organization: {
      id: organizationId,
      name: 'Selected Organization',
      slug: 'selected-organization',
      status: 'active',
    },
  };
}

/** Creates a promise controlled by an ownership-race test. */
function deferred<T>(): { readonly promise: Promise<T>; readonly resolve: (value: T) => void } {
  let resolvePromise: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve(value) {
      if (!resolvePromise) throw new Error('Deferred promise was not initialized.');
      resolvePromise(value);
    },
  };
}

describe('application and client adapter implementation edges', () => {
  it('should reject duplicate application identifiers as one invalid catalog', async () => {
    const { createAdminApplicationOperations } =
      await import('../../src/admin/application-service.js');
    const operations = createAdminApplicationOperations(() =>
      applicationDomain({ listAll: vi.fn().mockResolvedValue([application(), application()]) }),
    );

    await expect(operations.listAll()).resolves.toEqual({
      kind: 'failure',
      failure: 'invalid-response',
    });
  });

  it('should reject an invalid application timestamp without returning a partial value', async () => {
    const { createAdminApplicationOperations } =
      await import('../../src/admin/application-service.js');
    const operations = createAdminApplicationOperations(() =>
      applicationDomain({
        listAll: vi.fn().mockResolvedValue([application(), application({ updatedAt: 'invalid' })]),
      }),
    );

    await expect(operations.listAll()).resolves.toEqual({
      kind: 'failure',
      failure: 'invalid-response',
    });
  });

  it('should acquire a fresh SDK domain for every application invocation', async () => {
    const { createAdminApplicationOperations } =
      await import('../../src/admin/application-service.js');
    const listAll = vi.fn().mockResolvedValue([]);
    const provider = vi.fn(() => applicationDomain({ listAll }));
    const operations = createAdminApplicationOperations(provider);

    await operations.listAll();
    await operations.listAll();

    expect(provider).toHaveBeenCalledTimes(2);
    expect(listAll).toHaveBeenCalledTimes(2);
  });

  it('should reject generated plaintext when it names a different client', async () => {
    const { createAdminClientOperations } = await import('../../src/admin/client-service.js');
    const generateSecret = vi.fn().mockResolvedValue({
      id: secretId,
      clientId: '55555555-5555-4555-8555-555555555555',
      label: null,
      plaintext: 'one-time-secret',
      expiresAt: null,
      createdAt: timestamp,
    });
    const operations = createAdminClientOperations(() => clientDomain({ generateSecret }));

    await expect(operations.generateSecret(organizationId, clientId)).resolves.toEqual({
      kind: 'outcome-unknown',
    });
  });

  it('should reject duplicate client identifiers as one invalid organization catalog', async () => {
    const { createAdminClientOperations } = await import('../../src/admin/client-service.js');
    const operations = createAdminClientOperations(() =>
      clientDomain({ listAll: vi.fn().mockResolvedValue([client(), client()]) }),
    );

    await expect(operations.listAll(organizationId)).resolves.toEqual({
      kind: 'failure',
      failure: 'invalid-response',
    });
  });

  it.each([
    ['redirect fragment', { redirectUris: ['https://example.test/callback#fragment'] }],
    ['redirect wildcard', { redirectUris: ['https://example.test/*'] }],
    ['origin path', { allowedOrigins: ['https://example.test/path'] }],
    [
      'public secret authentication',
      { clientType: 'public', tokenEndpointAuthMethod: 'client_secret_basic', requirePkce: true },
    ],
    [
      'public client credentials',
      {
        clientType: 'public',
        tokenEndpointAuthMethod: 'none',
        requirePkce: true,
        grantTypes: ['client_credentials'],
      },
    ],
    [
      'public client without PKCE',
      { clientType: 'public', tokenEndpointAuthMethod: 'none', requirePkce: false },
    ],
    ['confidential none authentication', { tokenEndpointAuthMethod: 'none' }],
    ['non-ISO timestamp', { updatedAt: 'August 30, 2026' }],
    ['impossible calendar date', { updatedAt: '2026-02-30T10:00:00.000Z' }],
    ['normalized 24-hour time', { updatedAt: '2026-08-30T24:00:00.000Z' }],
  ])('should reject protocol-inconsistent retained client data: %s', async (_label, override) => {
    const { createAdminClientOperations } = await import('../../src/admin/client-service.js');
    const operations = createAdminClientOperations(() =>
      clientDomain({ listAll: vi.fn().mockResolvedValue([client(override)]) }),
    );

    await expect(operations.listAll(organizationId)).resolves.toEqual({
      kind: 'failure',
      failure: 'invalid-response',
    });
  });

  it('should reject unbounded or control-bearing entity tags', async () => {
    const { createAdminApplicationOperations } =
      await import('../../src/admin/application-service.js');
    const { createAdminClientOperations } = await import('../../src/admin/client-service.js');
    const applicationOperations = createAdminApplicationOperations(() =>
      applicationDomain({
        get: vi.fn().mockResolvedValue({ data: application(), etag: 'bad\u001betag' }),
      }),
    );
    const clientOperations = createAdminClientOperations(() =>
      clientDomain({
        get: vi.fn().mockResolvedValue({ data: client(), etag: 'x'.repeat(513) }),
      }),
    );

    await expect(applicationOperations.get(applicationId)).resolves.toEqual({
      kind: 'failure',
      failure: 'invalid-response',
    });
    await expect(clientOperations.get(organizationId, clientId)).resolves.toEqual({
      kind: 'failure',
      failure: 'invalid-response',
    });
  });

  it.each([
    [
      'update',
      (operations: Record<string, (...args: unknown[]) => unknown>) =>
        operations.update(organizationId, clientId, {}),
    ],
    [
      'activate',
      (operations: Record<string, (...args: unknown[]) => unknown>) =>
        operations.activate(organizationId, clientId),
    ],
    [
      'deactivate',
      (operations: Record<string, (...args: unknown[]) => unknown>) =>
        operations.deactivate(organizationId, clientId),
    ],
    [
      'revoke',
      (operations: Record<string, (...args: unknown[]) => unknown>) =>
        operations.revoke(organizationId, clientId),
    ],
    [
      'listSecrets',
      (operations: Record<string, (...args: unknown[]) => unknown>) =>
        operations.listSecrets(organizationId, clientId),
    ],
    [
      'generateSecret',
      (operations: Record<string, (...args: unknown[]) => unknown>) =>
        operations.generateSecret(organizationId, clientId),
    ],
    [
      'revokeSecret',
      (operations: Record<string, (...args: unknown[]) => unknown>) =>
        operations.revokeSecret(organizationId, clientId, secretId),
    ],
  ])('should block %s before dispatch when the client belongs to another organization', async (method, invoke) => {
    const { createAdminClientOperations } = await import('../../src/admin/client-service.js');
    const target = vi.fn();
    const remote = clientDomain({
      get: vi.fn().mockResolvedValue({
        data: client({ organizationId: otherOrganizationId }),
        etag: null,
      }),
      [method]: target,
    });
    const operations = createAdminClientOperations(() => remote);

    await expect(invoke(operations)).resolves.toEqual({
      kind: 'failure',
      failure: 'invalid-response',
    });
    expect(target).not.toHaveBeenCalled();
  });

  it.each(['absent', 'rejected'] as const)(
    'should require reconciliation when one-time secret presentation is %s',
    async (presentation) => {
      const { createAdminClientController } = await import('../../src/admin/client-controller.js');
      const states: unknown[] = [];
      const setRecoveryRequired = vi.fn();
      const created = {
        kind: 'success',
        value: {
          client: client(),
          secret: {
            id: secretId,
            clientId,
            label: null,
            plaintext: 'one-time-secret',
            expiresAt: null,
            createdAt: timestamp,
          },
        },
      };
      const controller = createAdminClientController({
        readState: authenticated,
        readOperations: () => ({
          create: vi.fn().mockResolvedValue(created),
          listAll: vi.fn(),
        }),
        publishState: (state: unknown) => states.push(state),
        ...(presentation === 'rejected'
          ? { presentSecret: vi.fn().mockRejectedValue(new Error('dialog unavailable')) }
          : {}),
        setRecoveryRequired,
        requestAuthentication: vi.fn(),
      });
      controller.syncContext(authenticated(), 1);

      await controller.create({
        applicationId,
        clientName: 'Payments web client',
        clientType: 'confidential',
        applicationType: 'web',
        redirectUris: ['https://payments.example.test/callback'],
      });

      expect(setRecoveryRequired).toHaveBeenLastCalledWith(true);
      expect(states.at(-1)).toEqual(
        expect.objectContaining({ kind: 'indeterminate', organizationId }),
      );
      expect(JSON.stringify(states)).not.toContain('one-time-secret');
    },
  );

  it('should cancel before lifecycle dispatch when context changes during ownership preflight', async () => {
    const { createAdminClientOperations } = await import('../../src/admin/client-service.js');
    const pending = deferred<{ data: Record<string, unknown>; etag: null }>();
    const activate = vi.fn().mockResolvedValue(undefined);
    const operations = createAdminClientOperations(() =>
      clientDomain({ get: vi.fn(() => pending.promise), activate }),
    );
    const controller = new AbortController();

    const result = operations.activate(organizationId, clientId, controller.signal);
    controller.abort();
    pending.resolve({ data: client(), etag: null });

    await expect(result).resolves.toEqual({ kind: 'cancelled' });
    expect(activate).not.toHaveBeenCalled();
  });
});

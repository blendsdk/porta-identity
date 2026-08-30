/**
 * Immutable specifications for the two application and OIDC-client administration workflows.
 *
 * These tests target the service/state/controller boundary. Rendering, generalized entity
 * machinery, persistence, and polling are outside this contract.
 */

import {
  PortaAuthenticationError,
  PortaConflictError,
  PortaForbiddenError,
  PortaServerError,
  PortaValidationError,
} from '@portaidentity/sdk';
import { describe, expect, it, vi } from 'vitest';

import { prepareAdminSession, validateAdminCapabilities } from '../../src/admin/session-service.js';

const server = new URL('https://porta.example.test');
const applicationId = '11111111-1111-4111-8111-111111111111';
const moduleId = '22222222-2222-4222-8222-222222222222';
const organizationId = '33333333-3333-4333-8333-333333333333';
const otherOrganizationId = '44444444-4444-4444-8444-444444444444';
const clientId = '55555555-5555-4555-8555-555555555555';
const secretId = '66666666-6666-4666-8666-666666666666';
const createdAt = '2026-08-30T10:00:00.000Z';
const updatedAt = '2026-08-30T11:00:00.000Z';

/** Builds one complete global application response. */
function application(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: applicationId,
    name: 'Payments',
    slug: 'payments',
    description: 'Global payments product',
    status: 'active',
    createdAt,
    updatedAt,
    internalDetail: 'drop-me',
    ...overrides,
  };
}

/** Builds one complete global module response. */
function applicationModule(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: moduleId,
    applicationId,
    name: 'Ledger',
    slug: 'ledger',
    description: null,
    status: 'active',
    createdAt,
    updatedAt,
    internalDetail: 'drop-me',
    ...overrides,
  };
}

/** Builds one complete organization-owned client response. */
function client(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: clientId,
    organizationId,
    applicationId,
    clientId: 'porta_generated_client_id',
    clientName: 'Payments web client',
    clientType: 'confidential',
    applicationType: 'web',
    redirectUris: ['https://payments.example.test/callback'],
    postLogoutRedirectUris: ['https://payments.example.test/signed-out'],
    grantTypes: ['authorization_code', 'refresh_token'],
    responseTypes: ['code'],
    scope: 'openid profile email',
    tokenEndpointAuthMethod: 'client_secret_basic',
    allowedOrigins: ['https://payments.example.test'],
    requirePkce: false,
    loginMethods: null,
    effectiveLoginMethods: ['password', 'magic_link'],
    status: 'active',
    createdAt,
    updatedAt,
    internalSecretHash: 'drop-me',
    ...overrides,
  };
}

/** Builds metadata that is safe to retain after a secret operation. */
function secret(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: secretId,
    clientId,
    label: 'rotation',
    status: 'active',
    lastUsedAt: null,
    expiresAt: null,
    createdAt,
    ...overrides,
  };
}

/** Supplies the complete SDK application domain used by the focused service. */
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

/** Supplies the complete SDK client domain used by the focused service. */
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

/** Creates one authenticated connection snapshot with every new capability enabled. */
function authenticated(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: 'authenticated',
    server,
    identity: { sub: 'administrator-1', email: 'admin@example.test' },
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
    ...overrides,
  };
}

/** Creates a promise whose completion is controlled by one ownership test. */
function deferred<T>(): { readonly promise: Promise<T>; readonly resolve: (value: T) => void } {
  let resolvePromise: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve: (value) => {
      if (!resolvePromise) throw new Error('Deferred promise was not initialized.');
      resolvePromise(value);
    },
  };
}

/** Allows controller-owned promise continuations to finish. */
async function settle(): Promise<void> {
  for (let index = 0; index < 10; index += 1) await Promise.resolve();
}

describe('global application administration workflow', () => {
  it('ST-24 validates and freezes the complete global application and module allowlists', async () => {
    const { createAdminApplicationOperations } =
      await import('../../src/admin/application-service.js');
    const rows = [
      application({ name: 'n'.repeat(255), description: 'd'.repeat(2_000), status: 'active' }),
      application({ id: '77777777-7777-4777-8777-777777777777', status: 'inactive' }),
      application({ id: '88888888-8888-4888-8888-888888888888', status: 'archived' }),
    ];
    const modules = [
      applicationModule({ status: 'active' }),
      applicationModule({ id: '99999999-9999-4999-8999-999999999999', status: 'inactive' }),
    ];
    const operations = createAdminApplicationOperations(() =>
      applicationDomain({
        listAll: vi.fn().mockResolvedValue(rows),
        listModules: vi.fn().mockResolvedValue(modules),
      }),
    );

    const listed = await operations.listAll();
    const listedModules = await operations.listModules(applicationId);

    expect(listed).toEqual({
      kind: 'success',
      value: rows.map(({ internalDetail: _internalDetail, ...row }) => row),
    });
    expect(listedModules).toEqual({
      kind: 'success',
      value: modules.map(({ internalDetail: _internalDetail, ...row }) => row),
    });
    expect(listed.kind === 'success' && Object.isFrozen(listed.value)).toBe(true);
    expect(listedModules.kind === 'success' && Object.isFrozen(listedModules.value)).toBe(true);
    expect(JSON.stringify([listed, listedModules])).not.toContain('internalDetail');
  });

  it.each([
    ['malformed UUID', { id: 'not-a-uuid' }],
    ['unknown status', { status: 'deleted' }],
    ['empty name', { name: '' }],
    ['overlong name', { name: 'n'.repeat(256) }],
    ['overlong description', { description: 'd'.repeat(2_001) }],
    ['ASCII control', { name: 'bad\u001bname' }],
    ['C1 control', { description: 'bad\u0085description' }],
  ])('ST-24 rejects the entire application catalog for %s', async (_label, override) => {
    const { createAdminApplicationOperations } =
      await import('../../src/admin/application-service.js');
    const listAll = vi.fn().mockResolvedValue([application(), application(override)]);
    const operations = createAdminApplicationOperations(() => applicationDomain({ listAll }));

    const result = await operations.listAll();

    expect(result).toEqual({ kind: 'failure', failure: 'invalid-response' });
    expect(JSON.stringify(result)).not.toMatch(/deleted|bad|not-a-uuid/);
    expect(listAll).toHaveBeenCalledOnce();
  });

  it('ST-24 and ST-30 reject a module whose UUID, status, text, or parent is invalid', async () => {
    const { createAdminApplicationOperations } =
      await import('../../src/admin/application-service.js');
    const invalidModules = [
      applicationModule(),
      applicationModule({ applicationId: '77777777-7777-4777-8777-777777777777' }),
      applicationModule({ id: 'bad-id' }),
      applicationModule({ status: 'archived' }),
      applicationModule({ name: 'n'.repeat(256) }),
    ];
    const operations = createAdminApplicationOperations(() =>
      applicationDomain({ listModules: vi.fn().mockResolvedValue(invalidModules) }),
    );

    await expect(operations.listModules(applicationId)).resolves.toEqual({
      kind: 'failure',
      failure: 'invalid-response',
    });
  });

  it('ST-24 rejects a failed complete-catalog load without publishing an earlier page', async () => {
    const { createAdminApplicationOperations } =
      await import('../../src/admin/application-service.js');
    const listAll = vi.fn().mockRejectedValue(new TypeError('second page failed after Payments'));
    const operations = createAdminApplicationOperations(() => applicationDomain({ listAll }));

    const result = await operations.listAll();

    expect(result).toEqual({ kind: 'failure', failure: 'unavailable' });
    expect(JSON.stringify(result)).not.toMatch(/Payments|second page/);
  });

  it.each([
    [new PortaValidationError({ raw: true }), { kind: 'failure', failure: 'validation' }],
    [new PortaForbiddenError({ raw: true }), { kind: 'failure', failure: 'unauthorized' }],
    [new PortaConflictError({ raw: true }), { kind: 'failure', failure: 'conflict' }],
    [new PortaAuthenticationError({ raw: true }), { kind: 'session-invalid' }],
    [new DOMException('cancelled', 'AbortError'), { kind: 'cancelled' }],
    [new PortaServerError(500, { raw: true }), { kind: 'outcome-unknown' }],
    [new TypeError('private network detail'), { kind: 'outcome-unknown' }],
  ])('ST-29 maps an application mutation to a fixed result', async (error, expected) => {
    const { createAdminApplicationOperations } =
      await import('../../src/admin/application-service.js');
    const activate = vi.fn().mockRejectedValue(error);
    const operations = createAdminApplicationOperations(() => applicationDomain({ activate }));

    const result = await operations.activate(applicationId);

    expect(result).toEqual(expected);
    expect(JSON.stringify(result)).not.toMatch(/raw|private|network|stack|body/i);
    expect(activate).toHaveBeenCalledOnce();
  });

  it('parses every application capability independently and never organization-scopes it', () => {
    const capabilities = validateAdminCapabilities(
      [],
      ['admin:app:read', 'admin:app:create', 'admin:app:update', 'admin:app:archive'],
    );

    expect(capabilities).toMatchObject({
      canReadApplications: true,
      canCreateApplications: true,
      canUpdateApplications: true,
      canArchiveApplications: true,
    });
    expect(validateAdminCapabilities([], ['admin:app:read', 'admin:app:delete'])).toMatchObject({
      canReadApplications: true,
      canCreateApplications: false,
      canUpdateApplications: false,
      canArchiveApplications: false,
    });
  });

  it('injects the production application SDK domain lazily into session operations', async () => {
    const listAll = vi.fn().mockResolvedValue([]);
    const provider = vi.fn(() => applicationDomain({ listAll }));
    const interaction = {
      presentAuthorizationUrl: vi.fn(),
      requestManualCallback: vi.fn(),
      confirmCredentialReplacement: vi.fn(),
    };

    const prepared = prepareAdminSession(
      server,
      interaction,
      undefined,
      undefined,
      provider,
      undefined,
    );

    expect(provider).not.toHaveBeenCalled();
    await expect(prepared.session.applications?.listAll()).resolves.toEqual({
      kind: 'success',
      value: [],
    });
    expect(provider).toHaveBeenCalledOnce();
    expect(listAll).toHaveBeenCalledOnce();
  });

  it('ST-26 retains ready global state when only the selected organization changes', async () => {
    const { createAdminApplicationController } =
      await import('../../src/admin/application-controller.js');
    const ready = { kind: 'list', scope: 'global', applications: [application()] };
    const states: unknown[] = [];
    let connection = authenticated();
    const controller = createAdminApplicationController({
      readState: () => connection,
      readOperations: () => ({
        listAll: vi.fn().mockResolvedValue({ kind: 'success', value: [application()] }),
      }),
      publishState: (state: unknown) => states.push(state),
      requestAuthentication: vi.fn(),
    });
    controller.syncContext(connection, 1);
    await controller.load();
    expect(states.at(-1)).toEqual(ready);

    connection = authenticated({
      organization: {
        id: otherOrganizationId,
        name: 'Other Organization',
        slug: 'other-organization',
        status: 'active',
      },
    });
    controller.syncContext(connection, 1);

    expect(states.at(-1)).toEqual(ready);
  });

  it('ST-31 rechecks capability after confirmation and owns only one activation', async () => {
    const { createAdminApplicationController } =
      await import('../../src/admin/application-controller.js');
    const confirmation = deferred<boolean>();
    const confirm = vi.fn(() => confirmation.promise);
    const duplicateConfirm = vi.fn().mockResolvedValue(true);
    const activate = vi.fn().mockResolvedValue({ kind: 'success' });
    let connection = authenticated();
    const controller = createAdminApplicationController({
      readState: () => connection,
      readOperations: () => ({ activate, listAll: vi.fn() }),
      publishState: vi.fn(),
      requestAuthentication: vi.fn(),
    });
    controller.syncContext(connection, 1);

    const first = controller.activate(applicationId, confirm);
    const duplicate = controller.activate(applicationId, duplicateConfirm);
    connection = authenticated({
      capabilities: {
        ...(authenticated().capabilities as Record<string, boolean>),
        canUpdateApplications: false,
      },
    });
    confirmation.resolve(true);
    await Promise.all([first, duplicate]);

    expect(activate).not.toHaveBeenCalled();
    expect(confirm).toHaveBeenCalledOnce();
    expect(duplicateConfirm).not.toHaveBeenCalled();
  });

  it('ST-27 clears global state and quarantines a late application result after session replacement', async () => {
    const { createAdminApplicationController } =
      await import('../../src/admin/application-controller.js');
    const pending = deferred<{ kind: 'success'; value: Record<string, unknown>[] }>();
    const states: unknown[] = [];
    let connection = authenticated();
    const controller = createAdminApplicationController({
      readState: () => connection,
      readOperations: () => ({ listAll: vi.fn(() => pending.promise) }),
      publishState: (state: unknown) => states.push(state),
      requestAuthentication: vi.fn(),
    });
    controller.syncContext(connection, 1);
    const load = controller.load();

    connection = { kind: 'unauthenticated', server };
    controller.syncContext(connection, 2);
    pending.resolve({ kind: 'success', value: [application()] });
    await load;

    expect(states.at(-1)).toEqual({ kind: 'closed' });
    expect(states).not.toContainEqual(
      expect.objectContaining({ kind: 'list', applications: expect.anything() }),
    );
  });

  it('ST-28 permits one SDK-owned 401 refresh replay but publishes one logical mutation', async () => {
    const { createAdminApplicationOperations } =
      await import('../../src/admin/application-service.js');
    const send = vi
      .fn()
      .mockRejectedValueOnce(new PortaAuthenticationError({ fixed: true }))
      .mockResolvedValueOnce(undefined);
    const activate = vi.fn(async () => {
      try {
        await send();
      } catch (error) {
        if (!(error instanceof PortaAuthenticationError)) throw error;
        await send();
      }
    });
    const operations = createAdminApplicationOperations(() => applicationDomain({ activate }));

    await expect(operations.activate(applicationId)).resolves.toEqual({ kind: 'success' });
    expect(activate).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledTimes(2);
  });
});

describe('selected-organization OIDC client administration workflow', () => {
  it('ST-24 validates and freezes every accepted client and secret enum without retaining plaintext', async () => {
    const { createAdminClientOperations } = await import('../../src/admin/client-service.js');
    const clients = [
      client({ status: 'active', clientType: 'confidential', applicationType: 'web' }),
      client({
        id: '77777777-7777-4777-8777-777777777777',
        status: 'inactive',
        clientType: 'public',
        applicationType: 'spa',
        tokenEndpointAuthMethod: 'none',
        requirePkce: true,
      }),
      client({
        id: '88888888-8888-4888-8888-888888888888',
        status: 'revoked',
        clientType: 'public',
        applicationType: 'native',
        tokenEndpointAuthMethod: 'none',
        requirePkce: true,
      }),
    ];
    const secrets = [
      secret({ status: 'active' }),
      secret({ id: '99999999-9999-4999-8999-999999999999', status: 'revoked' }),
    ];
    const operations = createAdminClientOperations(() =>
      clientDomain({
        listAll: vi.fn().mockResolvedValue(clients),
        listSecrets: vi.fn().mockResolvedValue(secrets),
      }),
    );

    const listed = await operations.listAll(organizationId);
    const listedSecrets = await operations.listSecrets(organizationId, clientId);

    expect(listed.kind).toBe('success');
    expect(listedSecrets).toEqual({ kind: 'success', value: secrets });
    expect(listed.kind === 'success' && Object.isFrozen(listed.value)).toBe(true);
    expect(JSON.stringify([listed, listedSecrets])).not.toMatch(
      /internalSecretHash|plaintext|hash/i,
    );
  });

  it.each([
    ['malformed UUID', { id: 'not-a-uuid' }],
    ['wrong organization', { organizationId: otherOrganizationId }],
    ['unknown status', { status: 'deleted' }],
    ['unknown client type', { clientType: 'private' }],
    ['unknown application type', { applicationType: 'desktop' }],
    ['unknown grant', { grantTypes: ['implicit'] }],
    ['unknown response type', { responseTypes: ['token'] }],
    ['unknown authentication method', { tokenEndpointAuthMethod: 'private_key_jwt' }],
    ['unknown login method', { effectiveLoginMethods: ['webauthn'] }],
    ['overlong name', { clientName: 'n'.repeat(256) }],
    ['overlong URI', { redirectUris: [`https://example.test/${'x'.repeat(2_049)}`] }],
    ['ASCII control', { clientId: 'bad\u001bclient' }],
    ['C1 control', { scope: 'openid\u0085profile' }],
  ])('ST-24 and ST-30 reject the complete client catalog for %s', async (_label, override) => {
    const { createAdminClientOperations } = await import('../../src/admin/client-service.js');
    const listAll = vi.fn().mockResolvedValue([client(), client(override)]);
    const operations = createAdminClientOperations(() => clientDomain({ listAll }));

    const result = await operations.listAll(organizationId);

    expect(result).toEqual({ kind: 'failure', failure: 'invalid-response' });
    expect(JSON.stringify(result)).not.toMatch(/bad|deleted|private_key|webauthn|implicit/);
    expect(listAll).toHaveBeenCalledWith({ organizationId });
  });

  it.each([
    ['another parent', { clientId: '88888888-8888-4888-8888-888888888888' }],
    ['unexpected plaintext', { plaintext: 'must-never-enter-state' }],
  ])('ST-30 rejects every secret row when one contains %s', async (_label, override) => {
    const { createAdminClientOperations } = await import('../../src/admin/client-service.js');
    const listSecrets = vi.fn().mockResolvedValue([
      secret(),
      secret({
        id: '77777777-7777-4777-8777-777777777777',
        ...override,
      }),
    ]);
    const operations = createAdminClientOperations(() => clientDomain({ listSecrets }));

    const result = await operations.listSecrets(organizationId, clientId);

    expect(result).toEqual({ kind: 'failure', failure: 'invalid-response' });
    expect(JSON.stringify(result)).not.toContain('must-never-enter-state');
  });

  it('rejects a failed complete client load without publishing an earlier organization row', async () => {
    const { createAdminClientOperations } = await import('../../src/admin/client-service.js');
    const listAll = vi.fn().mockRejectedValue(new TypeError('failed after Payments web client'));
    const operations = createAdminClientOperations(() => clientDomain({ listAll }));

    const result = await operations.listAll(organizationId);

    expect(result).toEqual({ kind: 'failure', failure: 'unavailable' });
    expect(JSON.stringify(result)).not.toMatch(/Payments|failed after/);
  });

  it.each([
    [new PortaValidationError({ raw: true }), { kind: 'failure', failure: 'validation' }],
    [new PortaForbiddenError({ raw: true }), { kind: 'failure', failure: 'unauthorized' }],
    [new PortaConflictError({ raw: true }), { kind: 'failure', failure: 'conflict' }],
    [new PortaAuthenticationError({ raw: true }), { kind: 'session-invalid' }],
    [new DOMException('cancelled', 'AbortError'), { kind: 'cancelled' }],
    [new PortaServerError(500, { raw: true }), { kind: 'outcome-unknown' }],
    [new TypeError('private transport detail'), { kind: 'outcome-unknown' }],
  ])('ST-29 maps a client mutation to a fixed result without retry', async (error, expected) => {
    const { createAdminClientOperations } = await import('../../src/admin/client-service.js');
    const deactivate = vi.fn().mockRejectedValue(error);
    const operations = createAdminClientOperations(() => clientDomain({ deactivate }));

    const result = await operations.deactivate(organizationId, clientId);

    expect(result).toEqual(expected);
    expect(JSON.stringify(result)).not.toMatch(/raw|private|transport|stack|body/i);
    expect(deactivate).toHaveBeenCalledOnce();
  });

  it('parses client capabilities independently and requires app-read for client creation', () => {
    expect(
      validateAdminCapabilities(
        [],
        ['admin:client:read', 'admin:client:create', 'admin:client:update', 'admin:client:revoke'],
      ),
    ).toMatchObject({
      canReadClients: true,
      canCreateClients: false,
      canUpdateClients: true,
      canRevokeClients: true,
    });
    expect(validateAdminCapabilities([], ['admin:client:create', 'admin:app:read'])).toMatchObject({
      canReadApplications: true,
      canCreateClients: true,
    });
  });

  it('injects the production client SDK domain lazily into session operations', async () => {
    const listAll = vi.fn().mockResolvedValue([]);
    const provider = vi.fn(() => clientDomain({ listAll }));
    const interaction = {
      presentAuthorizationUrl: vi.fn(),
      requestManualCallback: vi.fn(),
      confirmCredentialReplacement: vi.fn(),
    };

    const prepared = prepareAdminSession(
      server,
      interaction,
      undefined,
      undefined,
      undefined,
      provider,
    );

    expect(provider).not.toHaveBeenCalled();
    await expect(prepared.session.clients?.listAll(organizationId)).resolves.toEqual({
      kind: 'success',
      value: [],
    });
    expect(provider).toHaveBeenCalledOnce();
    expect(listAll).toHaveBeenCalledWith({ organizationId });
  });

  it('ST-25 clears on organization change and quarantines a late client result', async () => {
    const { createAdminClientController } = await import('../../src/admin/client-controller.js');
    const pending = deferred<{ kind: 'success'; value: Record<string, unknown>[] }>();
    const states: unknown[] = [];
    let connection = authenticated();
    const controller = createAdminClientController({
      readState: () => connection,
      readOperations: () => ({ listAll: vi.fn(() => pending.promise) }),
      publishState: (state: unknown) => states.push(state),
      requestAuthentication: vi.fn(),
    });
    controller.syncContext(connection, 1);
    const load = controller.load();

    connection = authenticated({
      organization: {
        id: otherOrganizationId,
        name: 'Other Organization',
        slug: 'other-organization',
        status: 'active',
      },
    });
    controller.syncContext(connection, 1);
    pending.resolve({ kind: 'success', value: [client()] });
    await load;

    expect(states).toContainEqual({ kind: 'closed' });
    expect(states).not.toContainEqual(
      expect.objectContaining({ kind: 'list', organizationId, clients: expect.anything() }),
    );
  });

  it('ST-31 rechecks organization and capability and owns only one client activation', async () => {
    const { createAdminClientController } = await import('../../src/admin/client-controller.js');
    const confirmation = deferred<boolean>();
    const confirm = vi.fn(() => confirmation.promise);
    const duplicateConfirm = vi.fn().mockResolvedValue(true);
    const activate = vi.fn().mockResolvedValue({ kind: 'success' });
    let connection = authenticated();
    const controller = createAdminClientController({
      readState: () => connection,
      readOperations: () => ({ activate, listAll: vi.fn() }),
      publishState: vi.fn(),
      requestAuthentication: vi.fn(),
    });
    controller.syncContext(connection, 1);

    const first = controller.activate(clientId, confirm);
    const duplicate = controller.activate(clientId, duplicateConfirm);
    connection = authenticated({
      capabilities: {
        ...(authenticated().capabilities as Record<string, boolean>),
        canUpdateClients: false,
      },
    });
    confirmation.resolve(true);
    await Promise.all([first, duplicate]);

    expect(activate).not.toHaveBeenCalled();
    expect(confirm).toHaveBeenCalledOnce();
    expect(duplicateConfirm).not.toHaveBeenCalled();
  });

  it('ST-31 dispatches exactly one mutation for an allowed duplicate activation', async () => {
    const { createAdminClientController } = await import('../../src/admin/client-controller.js');
    const activation = deferred<{ kind: 'success' }>();
    const activate = vi.fn(() => activation.promise);
    const controller = createAdminClientController({
      readState: authenticated,
      readOperations: () => ({ activate, listAll: vi.fn() }),
      publishState: vi.fn(),
      requestAuthentication: vi.fn(),
    });
    controller.syncContext(authenticated(), 1);

    const first = controller.activate(clientId, () => Promise.resolve(true));
    const duplicate = controller.activate(clientId, () => Promise.resolve(true));
    await settle();
    expect(activate).toHaveBeenCalledOnce();
    expect(activate).toHaveBeenCalledWith(organizationId, clientId, expect.any(AbortSignal));
    activation.resolve({ kind: 'success' });
    await Promise.all([first, duplicate]);
  });

  it('rechecks the active organization immediately before mutation dispatch', async () => {
    const { createAdminClientController } = await import('../../src/admin/client-controller.js');
    const confirmation = deferred<boolean>();
    const activate = vi.fn().mockResolvedValue({ kind: 'success' });
    let connection = authenticated();
    const controller = createAdminClientController({
      readState: () => connection,
      readOperations: () => ({ activate, listAll: vi.fn() }),
      publishState: vi.fn(),
      requestAuthentication: vi.fn(),
    });
    controller.syncContext(connection, 1);
    const pending = controller.activate(clientId, () => confirmation.promise);
    connection = authenticated({
      organization: {
        id: otherOrganizationId,
        name: 'Other Organization',
        slug: 'other-organization',
        status: 'active',
      },
    });
    confirmation.resolve(true);
    await pending;

    expect(activate).not.toHaveBeenCalled();
  });

  it('ST-29 blocks another mutation after an indeterminate result until deliberate reload', async () => {
    const { createAdminClientController } = await import('../../src/admin/client-controller.js');
    const deactivate = vi
      .fn()
      .mockResolvedValueOnce({ kind: 'outcome-unknown' })
      .mockResolvedValueOnce({ kind: 'success' });
    const listAll = vi.fn().mockResolvedValue({ kind: 'success', value: [client()] });
    const states: unknown[] = [];
    const controller = createAdminClientController({
      readState: authenticated,
      readOperations: () => ({ deactivate, listAll }),
      publishState: (state: unknown) => states.push(state),
      setRecoveryRequired: vi.fn(),
      requestAuthentication: vi.fn(),
    });
    controller.syncContext(authenticated(), 1);

    await controller.deactivate(clientId, () => Promise.resolve(true));
    await controller.deactivate(clientId, () => Promise.resolve(true));
    expect(deactivate).toHaveBeenCalledOnce();
    expect(states.at(-1)).toEqual(expect.objectContaining({ kind: 'indeterminate' }));

    await controller.load();
    await controller.deactivate(clientId, () => Promise.resolve(true));
    expect(deactivate).toHaveBeenCalledTimes(2);
  });

  it('ST-27 clears state, pending ownership, and plaintext on authentication replacement', async () => {
    const { createAdminClientController } = await import('../../src/admin/client-controller.js');
    const secretDialog = deferred<void>();
    let retainedPlaintext: string | undefined;
    let secretSignal: AbortSignal | undefined;
    let connection = authenticated();
    const create = vi.fn().mockResolvedValue({
      kind: 'success',
      value: {
        client: client(),
        secret: {
          id: secretId,
          clientId,
          label: 'initial',
          plaintext: 'one-time-plaintext',
          expiresAt: null,
          createdAt,
        },
      },
    });
    const states: unknown[] = [];
    const controller = createAdminClientController({
      readState: () => connection,
      readOperations: () => ({ create, listAll: vi.fn() }),
      publishState: (state: unknown) => states.push(state),
      presentSecret: (value: { plaintext: string }, signal: AbortSignal) => {
        retainedPlaintext = value.plaintext;
        secretSignal = signal;
        signal.addEventListener('abort', () => {
          retainedPlaintext = undefined;
        });
        return secretDialog.promise;
      },
      requestAuthentication: vi.fn(),
    });
    controller.syncContext(connection, 1);
    const pendingCreate = controller.create({
      applicationId,
      clientName: 'Payments web client',
      clientType: 'confidential',
      applicationType: 'web',
      redirectUris: ['https://payments.example.test/callback'],
    });
    await settle();
    expect(retainedPlaintext).toBe('one-time-plaintext');
    expect(JSON.stringify(states)).not.toContain('one-time-plaintext');

    connection = { kind: 'unauthenticated', server };
    controller.syncContext(connection, 2);
    expect(secretSignal?.aborted).toBe(true);
    expect(retainedPlaintext).toBeUndefined();
    expect(states.at(-1)).toEqual({ kind: 'closed' });
    secretDialog.resolve();
    await pendingCreate;
  });

  it.each(['cancel', 'resize', 'quit'] as const)(
    'disposes the only plaintext continuation synchronously on %s',
    async (transition) => {
      const { createAdminClientController } = await import('../../src/admin/client-controller.js');
      const secretDialog = deferred<void>();
      let aborted = false;
      const controller = createAdminClientController({
        readState: authenticated,
        readOperations: () => ({
          create: vi.fn().mockResolvedValue({
            kind: 'success',
            value: {
              client: client(),
              secret: {
                id: secretId,
                clientId,
                label: null,
                plaintext: 'single-continuation-secret',
                expiresAt: null,
                createdAt,
              },
            },
          }),
          listAll: vi.fn(),
        }),
        publishState: vi.fn(),
        presentSecret: (_value: unknown, signal: AbortSignal) => {
          signal.addEventListener('abort', () => {
            aborted = true;
          });
          return secretDialog.promise;
        },
        requestAuthentication: vi.fn(),
      });
      controller.syncContext(authenticated(), 1);
      const pendingCreate = controller.create({
        applicationId,
        clientName: 'Payments web client',
        clientType: 'confidential',
        applicationType: 'web',
        redirectUris: ['https://payments.example.test/callback'],
      });
      await settle();

      if (transition === 'cancel') controller.cancelActiveOperation();
      if (transition === 'resize') controller.handleRecoverableGeometry(false);
      if (transition === 'quit') controller.dispose();
      expect(aborted).toBe(true);
      secretDialog.resolve();
      await pendingCreate;
    },
  );
});

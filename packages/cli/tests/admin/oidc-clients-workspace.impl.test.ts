/** Implementation regressions for the organization OIDC client workspace and controller. */

import {
  Button,
  createApplication,
  DataGrid,
  Dialog,
  Group,
  Input,
  Scroller,
  TabView,
  View,
} from '@jsvision/ui';
import { describe, expect, it, vi } from 'vitest';

import { createAdminClientController } from '../../src/admin/client-controller.js';
import {
  showClientConfigurationDialog,
  showOneTimeClientSecretDialog,
} from '../../src/admin/client-dialogs.js';
import type {
  AdminClient,
  AdminClientSecret,
  AdminClientViewState,
} from '../../src/admin/client-state.js';
import type { AdminConnectionState, AdminOrganizationContext } from '../../src/admin/state.js';

const organization: AdminOrganizationContext = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Example Organization',
  slug: 'example',
  status: 'active',
};
const application = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Customer Portal',
  slug: 'customer-portal',
  description: null,
  status: 'active' as const,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-08-01T00:00:00Z',
};
const client: AdminClient = {
  id: '33333333-3333-4333-8333-333333333333',
  organizationId: organization.id,
  applicationId: application.id,
  clientId: 'generated-client-id',
  clientName: 'Portal Web Client',
  clientType: 'confidential',
  applicationType: 'web',
  redirectUris: ['https://portal.example.test/callback'],
  postLogoutRedirectUris: [],
  grantTypes: ['authorization_code', 'refresh_token'],
  responseTypes: ['code'],
  scope: 'openid profile',
  tokenEndpointAuthMethod: 'client_secret_basic',
  allowedOrigins: ['https://portal.example.test'],
  requirePkce: true,
  loginMethods: null,
  effectiveLoginMethods: ['password'],
  status: 'active',
  createdAt: '2026-01-02T00:00:00Z',
  updatedAt: '2026-08-02T00:00:00Z',
};
const secret: AdminClientSecret = {
  id: '44444444-4444-4444-8444-444444444444',
  clientId: client.id,
  label: 'Primary',
  status: 'active',
  lastUsedAt: null,
  expiresAt: null,
  createdAt: '2026-08-03T00:00:00Z',
};

/** Creates one authenticated state with every client capability granted. */
function authenticated(): Extract<AdminConnectionState, { kind: 'authenticated' }> {
  return {
    kind: 'authenticated',
    server: new URL('https://porta.example.test'),
    identity: {
      subject: 'admin',
      displayName: 'Administrator',
      email: 'admin@example.test',
      claims: {},
    },
    organization,
    capabilities: {
      canReadOrganizations: true,
      canCreateOrganizations: true,
      canReadUsers: true,
      canCreateUsers: true,
      canInviteUsers: true,
      canUpdateUsers: true,
      canManageUserLifecycle: true,
      canPurgeUsers: true,
      canReadApplications: true,
      canCreateApplications: true,
      canUpdateApplications: true,
      canArchiveApplications: true,
      canReadClients: true,
      canCreateClients: true,
      canUpdateClients: true,
      canRevokeClients: true,
    },
  };
}

/** Creates a promise whose completion is controlled by the test. */
function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/** Lets controller and modal continuations settle. */
async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

/** Collects a mounted JSVision subtree. */
function descendants(root: View): View[] {
  const result: View[] = [];
  const visit = (view: View): void => {
    result.push(view);
    if (view instanceof Group) for (const child of view.children) visit(child);
  };
  visit(root);
  return result;
}

/** Reads the visible terminal frame. */
function frameText(host: ReturnType<typeof createApplication>): string {
  return host.loop.renderRoot
    .buffer()
    .rows()
    .map((row) => row.map((cell) => (cell.width === 0 ? '' : cell.char)).join(''))
    .join('\n');
}

describe('client controller details and secret ownership', () => {
  it('loads detail and metadata-only secrets through authoritative parent reads', async () => {
    const states: AdminClientViewState[] = [];
    const listAll = vi.fn().mockResolvedValue({ kind: 'success', value: [client] });
    const get = vi.fn().mockResolvedValue({
      kind: 'success',
      value: { client, etag: 'W/"0123456789abcdef"' },
    });
    const listSecrets = vi.fn().mockResolvedValue({ kind: 'success', value: [secret] });
    const controller = createAdminClientController({
      readState: authenticated,
      readOperations: () => ({ listAll, get, listSecrets }),
      publishState: (state) => states.push(state),
      resolveApplicationName: () => application.name,
      requestAuthentication: vi.fn(),
    });
    controller.syncContext(authenticated(), 1);

    await controller.load();
    await controller.select(client.id);
    await controller.loadSecrets(client.id);

    expect(get).toHaveBeenCalledWith(organization.id, client.id);
    expect(listSecrets).toHaveBeenCalledWith(organization.id, client.id);
    expect(states.at(-1)).toEqual(
      expect.objectContaining({
        kind: 'secrets',
        client,
        applicationName: application.name,
        secrets: [secret],
      }),
    );
    expect(JSON.stringify(states)).not.toContain('plaintext');
  });

  it('shows generated plaintext only through the presenter and reloads metadata afterward', async () => {
    const states: AdminClientViewState[] = [];
    const listSecrets = vi
      .fn()
      .mockResolvedValueOnce({ kind: 'success', value: [secret] })
      .mockResolvedValueOnce({ kind: 'success', value: [secret] });
    const generated = { ...secret, plaintext: 'one-time-value' };
    const presentSecret = vi.fn().mockResolvedValue(undefined);
    const controller = createAdminClientController({
      readState: authenticated,
      readOperations: () => ({
        listAll: vi.fn().mockResolvedValue({ kind: 'success', value: [client] }),
        get: vi.fn().mockResolvedValue({ kind: 'success', value: { client, etag: null } }),
        listSecrets,
        generateSecret: vi.fn().mockResolvedValue({ kind: 'success', value: generated }),
      }),
      publishState: (state) => states.push(state),
      presentSecret,
      requestAuthentication: vi.fn(),
    });
    controller.syncContext(authenticated(), 1);
    await controller.load();
    await controller.select(client.id);
    await controller.loadSecrets(client.id);

    await controller.generateSecret(client.id, { label: 'Primary' });

    expect(presentSecret).toHaveBeenCalledWith(
      { ...generated, clientName: client.clientName, oidcClientId: client.clientId },
      expect.any(AbortSignal),
    );
    expect(listSecrets).toHaveBeenCalledTimes(2);
    expect(states.at(-1)).toEqual(expect.objectContaining({ kind: 'secrets' }));
    expect(JSON.stringify(states)).not.toContain('one-time-value');
  });

  it('requires reconciliation when cancellation follows mutation dispatch', async () => {
    const pending = deferred<{ kind: 'success' }>();
    const states: AdminClientViewState[] = [];
    const controller = createAdminClientController({
      readState: authenticated,
      readOperations: () => ({
        listAll: vi.fn().mockResolvedValue({ kind: 'success', value: [client] }),
        get: vi.fn().mockResolvedValue({ kind: 'success', value: { client, etag: null } }),
        update: vi.fn(() => pending.promise),
      }),
      publishState: (state) => states.push(state),
      requestAuthentication: vi.fn(),
    });
    controller.syncContext(authenticated(), 1);

    await controller.load();
    await controller.select(client.id);

    const update = controller.update(client.id, { clientName: 'Changed' });
    await settle();
    controller.cancelActiveOperation();
    pending.resolve({ kind: 'success' });
    await update;

    expect(states.at(-1)).toEqual(expect.objectContaining({ kind: 'indeterminate' }));
  });

  it('aborts a confirmation and prevents dispatch when the owned operation is cancelled', async () => {
    const confirmation = deferred<boolean>();
    let confirmationSignal: AbortSignal | undefined;
    const deactivate = vi.fn().mockResolvedValue({ kind: 'success' });
    const controller = createAdminClientController({
      readState: authenticated,
      readOperations: () => ({ deactivate }),
      publishState: vi.fn(),
      requestAuthentication: vi.fn(),
    });
    controller.syncContext(authenticated(), 1);
    const pending = controller.deactivate(client.id, (signal) => {
      confirmationSignal = signal;
      return confirmation.promise;
    });
    controller.cancelActiveOperation();
    confirmation.resolve(true);
    await pending;

    expect(confirmationSignal?.aborted).toBe(true);
    expect(deactivate).not.toHaveBeenCalled();
  });

  it('rejects a secret outside the retained same-parent metadata projection', async () => {
    const revokeSecret = vi.fn().mockResolvedValue({ kind: 'success' });
    const confirm = vi.fn().mockResolvedValue(true);
    const controller = createAdminClientController({
      readState: authenticated,
      readOperations: () => ({
        listAll: vi.fn().mockResolvedValue({ kind: 'success', value: [client] }),
        get: vi.fn().mockResolvedValue({ kind: 'success', value: { client, etag: null } }),
        listSecrets: vi.fn().mockResolvedValue({ kind: 'success', value: [secret] }),
        revokeSecret,
      }),
      publishState: vi.fn(),
      requestAuthentication: vi.fn(),
    });
    controller.syncContext(authenticated(), 1);
    await controller.load();
    await controller.select(client.id);
    await controller.loadSecrets(client.id);

    await controller.revokeSecret(
      client.id,
      '55555555-5555-4555-8555-555555555555',
      confirm,
    );

    expect(confirm).not.toHaveBeenCalled();
    expect(revokeSecret).not.toHaveBeenCalled();
  });

  it('hands confidential create identity and plaintext directly to one presenter', async () => {
    const presentSecret = vi.fn().mockResolvedValue(undefined);
    const generated = { ...secret, plaintext: 'created-secret' };
    const controller = createAdminClientController({
      readState: authenticated,
      readOperations: () => ({
        create: vi.fn().mockResolvedValue({ kind: 'success', value: { client, secret: generated } }),
        listAll: vi.fn().mockResolvedValue({ kind: 'success', value: [client] }),
      }),
      publishState: vi.fn(),
      presentSecret,
      requestAuthentication: vi.fn(),
    });
    controller.syncContext(authenticated(), 1);

    await controller.create({
      applicationId: application.id,
      clientName: client.clientName,
      clientType: 'confidential',
      applicationType: 'web',
      redirectUris: [...client.redirectUris],
    });

    expect(presentSecret).toHaveBeenCalledWith(
      { ...generated, clientName: client.clientName, oidcClientId: client.clientId },
      expect.any(AbortSignal),
    );
  });

  it('keeps reconciliation required when cancellation closes a pending plaintext presenter', async () => {
    const presentation = deferred<void>();
    const states: AdminClientViewState[] = [];
    const generated = { ...secret, plaintext: 'pending-secret' };
    const controller = createAdminClientController({
      readState: authenticated,
      readOperations: () => ({
        create: vi.fn().mockResolvedValue({ kind: 'success', value: { client, secret: generated } }),
        listAll: vi.fn(),
      }),
      publishState: (state) => states.push(state),
      presentSecret: () => presentation.promise,
      requestAuthentication: vi.fn(),
    });
    controller.syncContext(authenticated(), 1);
    const create = controller.create({
      applicationId: application.id,
      clientName: client.clientName,
      clientType: 'confidential',
      applicationType: 'web',
      redirectUris: [...client.redirectUris],
    });
    await settle();

    controller.cancelActiveOperation();
    presentation.resolve();
    await create;

    expect(states.at(-1)).toEqual(expect.objectContaining({ kind: 'indeterminate' }));
  });

  it('fails closed for public secret generation and already-revoked secret revocation', async () => {
    const publicClient = { ...client, clientType: 'public' as const, tokenEndpointAuthMethod: 'none' as const };
    const generateSecret = vi.fn();
    const revokeSecret = vi.fn();
    const revokedSecret = { ...secret, status: 'revoked' as const };
    const controller = createAdminClientController({
      readState: authenticated,
      readOperations: () => ({
        listAll: vi.fn().mockResolvedValue({ kind: 'success', value: [publicClient] }),
        get: vi.fn().mockResolvedValue({ kind: 'success', value: { client: publicClient, etag: null } }),
        generateSecret,
        revokeSecret,
      }),
      publishState: vi.fn(),
      requestAuthentication: vi.fn(),
    });
    controller.syncContext(authenticated(), 1);
    await controller.load();
    await controller.select(publicClient.id);
    await controller.generateSecret(publicClient.id);
    expect(generateSecret).not.toHaveBeenCalled();

    const confidentialController = createAdminClientController({
      readState: authenticated,
      readOperations: () => ({
        listAll: vi.fn().mockResolvedValue({ kind: 'success', value: [client] }),
        get: vi.fn().mockResolvedValue({ kind: 'success', value: { client, etag: null } }),
        listSecrets: vi.fn().mockResolvedValue({ kind: 'success', value: [revokedSecret] }),
        revokeSecret,
      }),
      publishState: vi.fn(),
      requestAuthentication: vi.fn(),
    });
    confidentialController.syncContext(authenticated(), 1);
    await confidentialController.load();
    await confidentialController.select(client.id);
    await confidentialController.loadSecrets(client.id);
    await confidentialController.revokeSecret(client.id, revokedSecret.id, async () => true);
    expect(revokeSecret).not.toHaveBeenCalled();
  });
});

describe('client dialog geometry and cleanup', () => {
  it('edits the keyboard-focused collection row and removes the mouse-focused row', async () => {
    const host = createApplication({ viewport: { width: 80, height: 24 } });
    const pending = showClientConfigurationDialog(host, new AbortController().signal, {
      mode: 'edit', organization, client, initialTab: 'Redirects',
    });
    await settle();
    const dialog = host.desktop.activeWindow();
    if (!(dialog instanceof Dialog)) throw new Error('Client dialog missing.');
    const grid = descendants(dialog).find((view) => view instanceof DataGrid);
    if (!(grid instanceof DataGrid)) throw new Error('Redirect grid missing.');
    const setRows = Reflect.get(grid, 'setRows');
    if (typeof setRows !== 'function') throw new Error('Collection replacement missing.');
    setRows.call(grid, [
      { id: 'a', value: 'https://a.test' },
      { id: 'b', value: 'https://b.test' },
    ]);
    const entry = descendants(dialog).filter((view) => view instanceof Input).find((input) => input.getMaxLength() === 2_048);
    if (!entry) throw new Error('Collection entry input missing.');
    entry.getValueSignal().set('https://changed.test');
    host.loop.focusView(grid.rows);
    host.loop.dispatch({ type: 'key', key: 'down', ctrl: false, alt: false, shift: false });
    const edit = descendants(dialog).filter((view) => view instanceof Button).find((button) => button.activation.label === 'Edit');
    if (!edit) throw new Error('Collection edit action missing.');
    host.loop.focusView(edit);
    host.loop.dispatch({ type: 'key', key: 'space', ctrl: false, alt: false, shift: false });
    expect(frameText(host)).toContain('https://a.test');
    expect(frameText(host)).toContain('https://changed.test');

    const origin = host.loop.renderRoot.originOf(grid.rows);
    if (!origin) throw new Error('Collection row origin missing.');
    for (const kind of ['down', 'up'] as const) {
      host.loop.dispatch({ type: 'mouse', kind, button: 0, x: origin.x + 2, y: origin.y + 2 });
    }
    const remove = descendants(dialog).filter((view) => view instanceof Button).find((button) => button.activation.label === 'Remove');
    if (!remove) throw new Error('Collection remove action missing.');
    host.loop.focusView(remove);
    host.loop.dispatch({ type: 'key', key: 'space', ctrl: false, alt: false, shift: false });
    expect(frameText(host)).toContain('https://a.test');
    expect(frameText(host)).not.toContain('https://changed.test');
    host.loop.endModal('cancel');
    await pending;
  });

  it('mounts one tabbed scroller with three collection DataGrids and one-row inputs', async () => {
    const host = createApplication({ viewport: { width: 48, height: 12 } });
    const pending = showClientConfigurationDialog(host, new AbortController().signal, {
      mode: 'edit',
      organization,
      client,
      initialTab: 'Redirects',
    });
    await settle();
    const dialog = host.desktop.activeWindow();
    if (!(dialog instanceof Dialog)) throw new Error('Client dialog missing.');
    const views = descendants(dialog);

    expect(views.filter((view) => view instanceof TabView)).toHaveLength(1);
    expect(views.filter((view) => view instanceof Scroller)).toHaveLength(4);
    expect(views.filter((view) => view instanceof DataGrid)).toHaveLength(3);
    expect(views.filter((view) => view instanceof Input).every((input) => input.bounds.height === 1)).toBe(true);
    expect(frameText(host)).not.toContain('[jsvision/ui');
    host.loop.endModal('cancel');
    await pending;
  });

  it('removes transient plaintext and its modal immediately after abort', async () => {
    const host = createApplication({ viewport: { width: 80, height: 24 } });
    const controller = new AbortController();
    const plaintext = 'transient-client-secret';
    const pending = showOneTimeClientSecretDialog(host, controller.signal, {
      clientName: client.clientName,
      clientId: client.clientId,
      label: null,
      plaintext,
    });
    await settle();
    expect(frameText(host)).toContain(plaintext);

    controller.abort();
    await pending;

    expect(host.desktop.activeWindow()).toBeNull();
    expect(frameText(host)).not.toContain(plaintext);
  });

  it('keeps all dialog actions bounded and closes without leaving artifacts', async () => {
    const host = createApplication({ viewport: { width: 80, height: 24 } });
    const pending = showClientConfigurationDialog(host, new AbortController().signal, {
      mode: 'create',
      organization,
      applications: [application],
      initialTab: 'Basic',
    });
    await settle();
    const dialog = host.desktop.activeWindow();
    if (!(dialog instanceof Dialog)) throw new Error('Client dialog missing.');
    expect(descendants(dialog).filter((view) => view instanceof Button).length).toBeGreaterThan(10);
    host.loop.endModal('cancel');
    await pending;
    expect(host.desktop.activeWindow()).toBeNull();
    expect(frameText(host)).not.toContain('[jsvision/ui');
  });
});

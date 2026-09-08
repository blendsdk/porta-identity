/** Immutable behavior specifications for compact OIDC client registration. */

import {
  Button,
  createApplication,
  DataGrid,
  Dialog,
  Group,
  Input,
  RadioGroup,
  TabView,
  View,
} from '@jsvision/ui';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createAdminClientController } from '../../src/admin/client-controller.js';
import type { AdminClient, AdminClientViewState } from '../../src/admin/client-state.js';
import type { AdminConnectionState, AdminOrganizationContext } from '../../src/admin/state.js';
import type { CreateClientInput } from '@portaidentity/sdk';

const organization: AdminOrganizationContext = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Example Organization',
  slug: 'example',
  status: 'active',
};
const otherOrganization: AdminOrganizationContext = {
  id: '99999999-9999-4999-8999-999999999999',
  name: 'Other Organization',
  slug: 'other',
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
  clientId: 'porta-generated-client-id',
  clientName: 'Portal Web Client',
  clientType: 'confidential',
  applicationType: 'web',
  redirectUris: ['https://portal.example.test/callback'],
  postLogoutRedirectUris: [],
  grantTypes: ['authorization_code', 'refresh_token'],
  responseTypes: ['code'],
  scope: 'openid profile email',
  tokenEndpointAuthMethod: 'client_secret_basic',
  allowedOrigins: [],
  requirePkce: true,
  loginMethods: null,
  effectiveLoginMethods: ['password', 'magic_link'],
  status: 'active',
  createdAt: '2026-01-02T00:00:00Z',
  updatedAt: '2026-08-02T00:00:00Z',
};
const createInput: Omit<CreateClientInput, 'organizationId'> = {
  applicationId: application.id,
  clientName: client.clientName,
  clientType: 'confidential',
  applicationType: 'web',
  redirectUris: [...client.redirectUris],
};

interface RegistrationDialogExports {
  /** Opens the direct compact registration dialog. */
  readonly showClientRegistrationDialog: (
    host: ReturnType<typeof createApplication>,
    signal: AbortSignal,
    options: {
      readonly organization: AdminOrganizationContext;
      readonly applications: readonly (typeof application)[];
    },
  ) => Promise<
    | { readonly kind: 'create'; readonly input: Omit<CreateClientInput, 'organizationId'> }
    | { readonly kind: 'cancel' }
  >;
}

interface OneTimeDialogExports {
  /** Presents returned plaintext and expiry only for the current synchronous continuation. */
  readonly showOneTimeClientSecretDialog: (
    host: ReturnType<typeof createApplication>,
    signal: AbortSignal,
    value: {
      readonly clientName: string;
      readonly clientId: string;
      readonly label: string | null;
      readonly plaintext: string;
      readonly expiresAt: string | null;
    },
  ) => Promise<void>;
}

/** Loads the direct registration module only when a specification executes. */
async function registrationExports(): Promise<RegistrationDialogExports> {
  return (await import('../../src/admin/client-registration-dialog.js')) as RegistrationDialogExports;
}

/** Loads the stable dialog facade when a one-time presentation specification executes. */
async function oneTimeDialogExports(): Promise<OneTimeDialogExports> {
  return (await import('../../src/admin/client-dialogs.js')) as OneTimeDialogExports;
}

/** Returns all descendants mounted below one view. */
function descendants(root: View): View[] {
  const result: View[] = [];
  const visit = (view: View): void => {
    result.push(view);
    if (view instanceof Group) for (const child of view.children) visit(child);
  };
  visit(root);
  return result;
}

/** Reads the complete visible terminal frame. */
function frameText(host: ReturnType<typeof createApplication>): string {
  return host.loop.renderRoot
    .buffer()
    .rows()
    .map((row) => row.map((cell) => (cell.width === 0 ? '' : cell.char)).join(''))
    .join('\n');
}

/** Lets reactive layout and asynchronous continuations settle. */
async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

/** Activates a button through the normal keyboard route. */
function activate(host: ReturnType<typeof createApplication>, button: Button): void {
  host.loop.focusView(button);
  host.loop.dispatch({ type: 'key', key: 'space', ctrl: false, alt: false, shift: false });
}

/** Returns the active registration dialog or fails clearly. */
function activeDialog(host: ReturnType<typeof createApplication>): Dialog {
  const dialog = host.desktop.activeWindow();
  if (!(dialog instanceof Dialog)) throw new Error('Expected the client registration dialog.');
  return dialog;
}

/** Returns the dialog's create command. */
function createButton(dialog: Dialog): Button {
  const button = descendants(dialog)
    .filter((view) => view instanceof Button)
    .find((candidate) => candidate.activation.command === 'ok');
  if (!button) throw new Error('Create client button missing.');
  return button;
}

/** Opens compact registration on a real terminal surface. */
async function openRegistration() {
  const host = createApplication({ viewport: { width: 80, height: 24 } });
  const pending = (await registrationExports()).showClientRegistrationDialog(
    host,
    new AbortController().signal,
    { organization, applications: [application] },
  );
  await settle();
  return { host, pending, dialog: activeDialog(host) };
}

/** Creates the active organization connection used by controller specifications. */
function authenticated(
  selected = organization,
): Extract<AdminConnectionState, { kind: 'authenticated' }> {
  return {
    kind: 'authenticated',
    server: new URL('https://porta.example.test'),
    identity: {
      subject: 'administrator',
      displayName: 'Administrator',
      email: 'admin@example.test',
      claims: {},
    },
    organization: selected,
    capabilities: {
      canReadOrganizations: true,
      canCreateOrganizations: true,
      canReadUsers: true,
      canCreateUsers: true,
      canInviteUsers: true,
      canUpdateUsers: true,
      canManageUserLifecycle: true,
      canDeleteOrganizations: true,
      canDeleteUsers: true,
      canReadApplications: true,
      canCreateApplications: true,
      canUpdateApplications: true,
      canDeleteApplications: true,
      canDeleteModules: true,
      canReadClients: true,
      canCreateClients: true,
      canUpdateClients: true,
      canDeleteClients: true,
      canRevokeClientSecrets: true,
    },
  };
}

/** Creates a promise controlled by the specification. */
function deferred<T>(): { readonly promise: Promise<T>; readonly resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('compact OIDC client registration', () => {
  it('shows only the required compact fields and naturally sized Layout DSL actions', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-07T12:00:00.000Z'));
    const { host, pending, dialog } = await openRegistration();
    const views = descendants(dialog);
    const text = frameText(host);

    for (const label of [
      'Client name',
      'Application',
      'Client type',
      'Application type',
      'Redirect URI',
      'Secret label',
      'Expires',
    ]) {
      expect(text).toContain(label);
    }
    expect(text).toContain(application.name);
    expect(views.filter((view) => view instanceof TabView)).toHaveLength(0);
    expect(views.filter((view) => view instanceof DataGrid)).toHaveLength(0);
    for (const advanced of ['Grant types', 'Response types', 'Scope', 'PKCE', 'Login methods']) {
      expect(text).not.toContain(advanced);
    }
    expect(
      views
        .filter((view) => view instanceof Button)
        .every((button) => button.layout.size === undefined),
    ).toBe(true);

    host.loop.endModal('cancel');
    await expect(pending).resolves.toEqual({ kind: 'cancel' });
  });

  it.each(['', 'bad\u001b', 'https://portal.example.test/callback#fragment'])(
    'keeps Create disabled and returns no intent for an invalid visible value: %j',
    async (invalidValue) => {
      const { host, pending, dialog } = await openRegistration();
      const inputs = descendants(dialog).filter((view) => view instanceof Input);
      const name = inputs.filter((input) => input.getMaxLength() === 255)[0];
      const redirect = inputs.find((input) => input.getMaxLength() === 2_048);
      if (!name || !redirect) throw new Error('Required registration inputs missing.');
      name.getValueSignal().set(invalidValue.startsWith('https:') ? 'New client' : invalidValue);
      redirect.getValueSignal().set(invalidValue.startsWith('https:') ? invalidValue : '');
      await settle();

      const create = createButton(dialog);
      expect(create.state.disabled).toBe(true);
      activate(host, create);
      await settle();
      expect(host.desktop.activeWindow()).toBe(dialog);

      host.loop.endModal('cancel');
      await expect(pending).resolves.toEqual({ kind: 'cancel' });
    },
  );

  it('defaults confidential registration to an optional label and six civil months', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-07T12:00:00.000Z'));
    const { host, pending, dialog } = await openRegistration();
    const inputs = descendants(dialog).filter((view) => view instanceof Input);
    const bounded = inputs.filter((input) => input.getMaxLength() === 255);
    const redirect = inputs.find((input) => input.getMaxLength() === 2_048);
    if (!bounded[0] || !redirect) throw new Error('Compact registration inputs missing.');
    bounded[0].getValueSignal().set('New client');
    redirect.getValueSignal().set('https://portal.example.test/callback');
    activate(host, createButton(dialog));

    await expect(pending).resolves.toEqual({
      kind: 'create',
      input: {
        applicationId: application.id,
        clientName: 'New client',
        clientType: 'confidential',
        applicationType: 'web',
        redirectUris: ['https://portal.example.test/callback'],
        secretExpiresAt: '2027-03-08T00:00:00.000Z',
      },
    });
  });

  it('makes secret controls unavailable and omits secret fields for public registration', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-07T12:00:00.000Z'));
    const { host, pending, dialog } = await openRegistration();
    const views = descendants(dialog);
    const inputs = views.filter((view) => view instanceof Input);
    const bounded = inputs.filter((input) => input.getMaxLength() === 255);
    const redirect = inputs.find((input) => input.getMaxLength() === 2_048);
    const clientTypes = views
      .filter((view) => view instanceof RadioGroup)
      .find((group) => group.bounds.height === 2);
    if (!bounded[0] || !bounded[1] || !redirect || !clientTypes) {
      throw new Error('Public registration controls missing.');
    }
    bounded[0].getValueSignal().set('Public client');
    bounded[1].getValueSignal().set('must-not-leak');
    redirect.getValueSignal().set('https://public.example.test/callback');
    host.loop.focusView(clientTypes);
    host.loop.dispatch({ type: 'key', key: 'up', ctrl: false, alt: false, shift: false });
    await settle();

    expect(frameText(host)).not.toContain('must-not-leak');
    activate(host, createButton(dialog));
    const result = await pending;
    expect(result).toEqual({
      kind: 'create',
      input: {
        applicationId: application.id,
        clientName: 'Public client',
        clientType: 'public',
        applicationType: 'web',
        redirectUris: ['https://public.example.test/callback'],
      },
    });
    if (result.kind === 'create') {
      expect(result.input).not.toHaveProperty('secretLabel');
      expect(result.input).not.toHaveProperty('secretExpiresAt');
    }
  });
});

describe('post-create OIDC client continuation', () => {
  it.each([
    ['2027-03-08T00:00:00.000Z', '2027-03-08T00:00:00.000Z'],
    [null, 'Never'],
  ] as const)(
    'shows returned expiry %j in the one-time secret dialog',
    async (expiresAt, expected) => {
      const host = createApplication({ viewport: { width: 80, height: 24 } });
      const pending = (await oneTimeDialogExports()).showOneTimeClientSecretDialog(
        host,
        new AbortController().signal,
        {
          clientName: client.clientName,
          clientId: client.clientId,
          label: null,
          plaintext: 'one-time-secret',
          expiresAt,
        },
      );
      await settle();

      expect(frameText(host)).toContain(`Expires: ${expected}`);
      expect(frameText(host)).toContain('cannot be shown again');
      host.loop.endModal('ok');
      await pending;
    },
  );

  it.each([
    ['2027-03-08T00:00:00.000Z', '2027-03-08T00:00:00.000Z'],
    [null, null],
  ] as const)(
    'presents confidential expiry %j before selecting the authoritative Overview',
    async (expiresAt, expectedExpiry) => {
      const order: string[] = [];
      const states: AdminClientViewState[] = [];
      const secret = {
        id: '44444444-4444-4444-8444-444444444444',
        clientId: client.id,
        label: null,
        plaintext: 'one-time-secret',
        expiresAt,
        createdAt: '2026-09-07T12:00:00Z',
      };
      const create = vi.fn().mockResolvedValue({ kind: 'success', value: { client, secret } });
      const get = vi.fn(async () => {
        order.push('select');
        return { kind: 'success' as const, value: { client, etag: null } };
      });
      const controller = createAdminClientController({
        readState: authenticated,
        readOperations: () => ({ create, get }),
        publishState: (state) => states.push(state),
        presentSecret: async (value) => {
          order.push('present');
          expect(value.expiresAt).toBe(expectedExpiry);
          expect(JSON.stringify(states)).not.toContain(value.plaintext);
        },
        requestAuthentication: vi.fn(),
      });
      controller.syncContext(authenticated(), 1);

      await controller.create(createInput);

      expect(order).toEqual(['present', 'select']);
      expect(get).toHaveBeenCalledWith(organization.id, client.id);
      expect(states.at(-1)).toEqual(expect.objectContaining({ kind: 'detail', client }));
      expect(JSON.stringify(states)).not.toContain(secret.plaintext);
    },
  );

  it('skips secret presentation for public create and selects the authoritative Overview', async () => {
    const publicClient: AdminClient = {
      ...client,
      clientType: 'public',
      tokenEndpointAuthMethod: 'none',
    };
    const presentSecret = vi.fn();
    const get = vi.fn().mockResolvedValue({
      kind: 'success',
      value: { client: publicClient, etag: null },
    });
    const states: AdminClientViewState[] = [];
    const controller = createAdminClientController({
      readState: authenticated,
      readOperations: () => ({
        create: vi.fn().mockResolvedValue({
          kind: 'success',
          value: { client: publicClient },
        }),
        get,
      }),
      publishState: (state) => states.push(state),
      presentSecret,
      requestAuthentication: vi.fn(),
    });
    controller.syncContext(authenticated(), 1);

    await controller.create({ ...createInput, clientType: 'public' });

    expect(presentSecret).not.toHaveBeenCalled();
    expect(get).toHaveBeenCalledWith(organization.id, publicClient.id);
    expect(states.at(-1)).toEqual(
      expect.objectContaining({ kind: 'detail', client: publicClient }),
    );
  });

  it('aborts organization-owned presentation, discards plaintext, and blocks late publication', async () => {
    const presentation = deferred<void>();
    const states: AdminClientViewState[] = [];
    let connection = authenticated();
    let retainedPlaintext: string | undefined;
    let presentationSignal: AbortSignal | undefined;
    const secret = {
      id: '44444444-4444-4444-8444-444444444444',
      clientId: client.id,
      label: null,
      plaintext: 'discard-on-context-change',
      expiresAt: null,
      createdAt: '2026-09-07T12:00:00Z',
    };
    const get = vi.fn();
    const controller = createAdminClientController({
      readState: () => connection,
      readOperations: () => ({
        create: vi.fn().mockResolvedValue({ kind: 'success', value: { client, secret } }),
        get,
      }),
      publishState: (state) => states.push(state),
      presentSecret: (value, signal) => {
        retainedPlaintext = value.plaintext;
        presentationSignal = signal;
        signal.addEventListener('abort', () => {
          retainedPlaintext = undefined;
        });
        return presentation.promise;
      },
      requestAuthentication: vi.fn(),
    });
    controller.syncContext(connection, 1);
    const pendingCreate = controller.create(createInput);
    await settle();

    connection = authenticated(otherOrganization);
    controller.syncContext(connection, 1);
    expect(presentationSignal?.aborted).toBe(true);
    expect(retainedPlaintext).toBeUndefined();
    presentation.resolve();
    await pendingCreate;

    expect(get).not.toHaveBeenCalled();
    expect(states.at(-1)).toEqual({ kind: 'closed' });
    expect(states).not.toContainEqual(
      expect.objectContaining({ kind: 'detail', organizationId: organization.id }),
    );
    expect(JSON.stringify(states)).not.toContain(secret.plaintext);
  });

  it.each([
    ['failure', { kind: 'failure', failure: 'conflict' } as const, 'failure'],
    ['outcome unknown', { kind: 'outcome-unknown' } as const, 'indeterminate'],
  ])(
    'retains the prior validated list without placeholder or secret after %s',
    async (_case, result, expectedKind) => {
      const prior = { ...client, id: '55555555-5555-4555-8555-555555555555' };
      const states: AdminClientViewState[] = [];
      const controller = createAdminClientController({
        readState: authenticated,
        readOperations: () => ({
          listAll: vi.fn().mockResolvedValue({ kind: 'success', value: [prior] }),
          create: vi.fn().mockResolvedValue(result),
        }),
        publishState: (state) => states.push(state),
        presentSecret: vi.fn(),
        requestAuthentication: vi.fn(),
      });
      controller.syncContext(authenticated(), 1);
      await controller.load();

      await controller.create(createInput);

      expect(states.at(-1)).toEqual(
        expect.objectContaining({ kind: expectedKind, previous: [prior] }),
      );
      expect(JSON.stringify(states)).not.toContain(client.id);
      expect(JSON.stringify(states)).not.toContain('plaintext');
    },
  );
});

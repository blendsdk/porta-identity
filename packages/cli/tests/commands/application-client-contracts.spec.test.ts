/**
 * Immutable specification for the bounded conventional application/client CLI inventory.
 *
 * These tests intentionally describe the corrected SDK contract. They must stay red until the
 * existing command implementations are aligned; no additional command family is authorized.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const applications = {
  create: vi.fn(),
  list: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
  activate: vi.fn(),
  deactivate: vi.fn(),
  archive: vi.fn(),
  restore: vi.fn(),
  addModule: vi.fn(),
  listModules: vi.fn(),
  updateModule: vi.fn(),
  deactivateModule: vi.fn(),
  removeModule: vi.fn(),
};

const clients = {
  create: vi.fn(),
  list: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
  activate: vi.fn(),
  deactivate: vi.fn(),
  revoke: vi.fn(),
  restore: vi.fn(),
  generateSecret: vi.fn(),
  listSecrets: vi.fn(),
  revokeSecret: vi.fn(),
};

vi.mock('../../src/client-factory.js', () => ({
  createClient: vi.fn(() => ({ applications, clients })),
}));

vi.mock('../../src/error-handler.js', () => ({ handleError: vi.fn() }));

vi.mock('../../src/output.js', () => ({
  printTable: vi.fn(),
  printJson: vi.fn(),
  success: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  formatDate: vi.fn((value: string | Date | null | undefined) =>
    value instanceof Date ? value.toISOString() : (value ?? 'N/A'),
  ),
  truncate: vi.fn((value: string) => value),
}));

vi.mock('../../src/prompt.js', () => ({
  confirm: vi.fn().mockResolvedValue(true),
  question: vi.fn(),
}));

import { printJson, printTable, success } from '../../src/output.js';

const applicationId = '11111111-1111-4111-8111-111111111111';
const moduleId = '22222222-2222-4222-8222-222222222222';
const organizationId = '33333333-3333-4333-8333-333333333333';
const clientId = '44444444-4444-4444-8444-444444444444';
const secretId = '55555555-5555-4555-8555-555555555555';
const createdAt = '2026-08-30T10:00:00.000Z';
const updatedAt = '2026-08-30T11:00:00.000Z';

const application = {
  id: applicationId,
  name: 'Payments',
  slug: 'payments',
  description: 'Payment application',
  status: 'active',
  createdAt,
  updatedAt,
};

const applicationModule = {
  id: moduleId,
  applicationId,
  name: 'Ledger',
  slug: 'ledger',
  description: 'Ledger module',
  status: 'active',
  createdAt,
  updatedAt,
};

const oidcClient = {
  id: clientId,
  organizationId,
  applicationId,
  clientId: 'porta_machine_client',
  clientName: 'Machine client',
  clientType: 'confidential',
  applicationType: 'web',
  redirectUris: ['https://client.example.test/callback'],
  postLogoutRedirectUris: ['https://client.example.test/signed-out'],
  grantTypes: ['authorization_code', 'refresh_token'],
  responseTypes: ['code'],
  scope: 'openid profile',
  tokenEndpointAuthMethod: 'client_secret_basic',
  allowedOrigins: ['https://client.example.test'],
  requirePkce: false,
  loginMethods: null,
  effectiveLoginMethods: ['password'],
  status: 'active',
  createdAt,
  updatedAt,
};

const generatedSecret = {
  id: secretId,
  clientId,
  label: 'rotation',
  plaintext: 'one-time-plaintext',
  expiresAt: null,
  createdAt,
};

const secretMetadata = {
  id: secretId,
  clientId,
  label: 'rotation',
  status: 'active',
  lastUsedAt: null,
  expiresAt: null,
  createdAt,
};

type CliOption = string | number | boolean | undefined;

/** Run one existing top-level command through strict yargs parsing. */
async function invoke(
  family: 'app' | 'client',
  command: readonly string[],
  options: Record<string, CliOption> = {},
): Promise<void> {
  const yargs = (await import('yargs')).default;
  const commandModule =
    family === 'app'
      ? (await import('../../src/commands/app.js')).appCommand
      : (await import('../../src/commands/client.js')).clientCommand;
  const args = [family, ...command];
  for (const [name, value] of Object.entries(options)) {
    if (value === undefined) continue;
    if (typeof value === 'boolean') {
      if (value) args.push(`--${name}`);
      continue;
    }
    args.push(`--${name}`, String(value));
  }

  try {
    await yargs(args)
      .command(commandModule)
      .option('json', { type: 'boolean', default: false })
      .option('verbose', { type: 'boolean', default: false })
      .option('insecure', { type: 'boolean', default: false })
      .option('force', { type: 'boolean', default: false })
      .option('server', { type: 'string' })
      .strict()
      .exitProcess(false)
      .fail(false)
      .parse();
  } catch {
    // Invalid or not-yet-implemented argv must stop before an SDK call.
  }
}

/** Serialize human-output helper arguments for bounded, control-free assertions. */
function humanOutput(): string {
  return JSON.stringify([
    ...(printTable as ReturnType<typeof vi.fn>).mock.calls,
    ...(success as ReturnType<typeof vi.fn>).mock.calls,
  ]);
}

/** Return whether text contains a terminal control byte rather than printable content. */
function containsTerminalControl(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint < 32 || (codePoint >= 127 && codePoint <= 159);
  });
}

describe('ST-23 bounded conventional CLI inventory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    applications.create.mockResolvedValue(application);
    applications.list.mockResolvedValue({ data: [application], total: 1, page: 1, pageSize: 20 });
    applications.get.mockResolvedValue({ data: application, etag: 'application-etag' });
    applications.update.mockResolvedValue(application);
    applications.activate.mockResolvedValue(undefined);
    applications.deactivate.mockResolvedValue(undefined);
    applications.archive.mockResolvedValue(undefined);
    applications.addModule.mockResolvedValue(applicationModule);
    applications.listModules.mockResolvedValue([applicationModule]);
    applications.updateModule.mockResolvedValue(applicationModule);
    applications.deactivateModule.mockResolvedValue(undefined);

    clients.create.mockResolvedValue({ client: oidcClient, secret: generatedSecret });
    clients.list.mockResolvedValue({ data: [oidcClient], total: 1, page: 1, pageSize: 20 });
    clients.get.mockResolvedValue({ data: oidcClient, etag: 'client-etag' });
    clients.update.mockResolvedValue(oidcClient);
    clients.activate.mockResolvedValue(undefined);
    clients.deactivate.mockResolvedValue(undefined);
    clients.revoke.mockResolvedValue(undefined);
    clients.generateSecret.mockResolvedValue(generatedSecret);
    clients.listSecrets.mockResolvedValue([secretMetadata]);
    clients.revokeSecret.mockResolvedValue(undefined);
  });

  describe('application commands', () => {
    it('maps application create argv to the global SDK create contract and JSON output', async () => {
      await invoke('app', ['create'], {
        name: 'Payments',
        slug: 'payments',
        description: 'Payment application',
        json: true,
      });

      expect(applications.create).toHaveBeenCalledWith({
        name: 'Payments',
        slug: 'payments',
        description: 'Payment application',
      });
      expect(printJson).toHaveBeenCalledWith(application);
    });

    it('maps application list argv and presents human output', async () => {
      await invoke('app', ['list'], { status: 'active', page: 2, 'page-size': 10 });

      expect(applications.list).toHaveBeenCalledWith({ page: 2, pageSize: 10, status: 'active' });
      expect(printTable).toHaveBeenCalled();
      expect(containsTerminalControl(humanOutput())).toBe(false);
    });

    it('maps application get argv to the SDK locator and JSON output', async () => {
      await invoke('app', ['get', 'payments'], { json: true });

      expect(applications.get).toHaveBeenCalledWith('payments');
      expect(printJson).toHaveBeenCalledWith(application);
    });

    it('resolves application update to the internal ID and supported fields only', async () => {
      await invoke('app', ['update', 'payments'], {
        name: 'Payments v2',
        description: 'Updated',
        json: true,
      });

      expect(applications.get).toHaveBeenCalledWith('payments');
      expect(applications.update).toHaveBeenCalledWith(
        applicationId,
        { name: 'Payments v2', description: 'Updated' },
        'application-etag',
      );
      expect(printJson).toHaveBeenCalledWith(application);
    });

    it.each([
      ['activate', applications.activate, 'activated'],
      ['deactivate', applications.deactivate, 'deactivated'],
      ['archive', applications.archive, 'archived'],
    ] as const)('maps application %s to the internal ID', async (operation, sdkMethod, output) => {
      await invoke('app', [operation, 'payments'], { force: true });

      expect(applications.get).toHaveBeenCalledWith('payments');
      expect(sdkMethod).toHaveBeenCalledWith(applicationId);
      expect(success).toHaveBeenCalledWith(expect.stringContaining(output));
    });
  });

  describe('application module commands', () => {
    it('maps module add argv to the owning internal application ID and JSON output', async () => {
      await invoke('app', ['module', 'add', applicationId], {
        name: 'Ledger',
        slug: 'ledger',
        description: 'Ledger module',
        json: true,
      });

      expect(applications.addModule).toHaveBeenCalledWith(applicationId, {
        name: 'Ledger',
        slug: 'ledger',
        description: 'Ledger module',
      });
      expect(printJson).toHaveBeenCalledWith(applicationModule);
    });

    it('maps module list argv to the owning internal application ID', async () => {
      await invoke('app', ['module', 'list', applicationId]);

      expect(applications.listModules).toHaveBeenCalledWith(applicationId);
      expect(printTable).toHaveBeenCalled();
    });

    it('maps module update argv with both internal IDs and JSON output', async () => {
      await invoke('app', ['module', 'update', applicationId, moduleId], {
        name: 'Ledger v2',
        description: 'Updated',
        json: true,
      });

      expect(applications.updateModule).toHaveBeenCalledWith(applicationId, moduleId, {
        name: 'Ledger v2',
        description: 'Updated',
      });
      expect(printJson).toHaveBeenCalledWith(applicationModule);
    });

    it('maps module deactivate argv with both internal IDs', async () => {
      await invoke('app', ['module', 'deactivate', applicationId, moduleId]);

      expect(applications.deactivateModule).toHaveBeenCalledWith(applicationId, moduleId);
      expect(success).toHaveBeenCalledWith(expect.stringContaining('deactivated'));
    });
  });

  describe('OIDC client commands', () => {
    it('maps client create argv to exact corrected field names and JSON output', async () => {
      await invoke('client', ['create'], {
        org: organizationId,
        app: applicationId,
        name: 'Machine client',
        type: 'confidential',
        'application-type': 'web',
        'redirect-uris': 'https://client.example.test/callback',
        json: true,
      });

      expect(clients.create).toHaveBeenCalledWith({
        organizationId,
        applicationId,
        clientName: 'Machine client',
        clientType: 'confidential',
        applicationType: 'web',
        redirectUris: ['https://client.example.test/callback'],
      });
      expect(printJson).toHaveBeenCalledWith({ client: oidcClient, secret: generatedSecret });
    });

    it('maps client list argv to the SDK list contract and human output', async () => {
      await invoke('client', ['list'], {
        app: applicationId,
        status: 'active',
        page: 2,
        'page-size': 10,
      });

      expect(clients.list).toHaveBeenCalledWith({
        applicationId,
        status: 'active',
        page: 2,
        pageSize: 10,
      });
      expect(printTable).toHaveBeenCalled();
    });

    it('maps client get argv to the internal ID and JSON output', async () => {
      await invoke('client', ['get', clientId], { json: true });

      expect(clients.get).toHaveBeenCalledWith(clientId);
      expect(printJson).toHaveBeenCalledWith(oidcClient);
    });

    it('maps client update argv to the resolved internal ID and corrected field names', async () => {
      await invoke('client', ['update', clientId], {
        name: 'Machine client v2',
        'redirect-uris': 'https://client.example.test/new-callback',
        json: true,
      });

      expect(clients.get).toHaveBeenCalledWith(clientId);
      expect(clients.update).toHaveBeenCalledWith(
        clientId,
        {
          clientName: 'Machine client v2',
          redirectUris: ['https://client.example.test/new-callback'],
        },
        'client-etag',
      );
      expect(printJson).toHaveBeenCalledWith(oidcClient);
    });

    it.each([
      ['activate', clients.activate, 'activated'],
      ['deactivate', clients.deactivate, 'deactivated'],
      ['revoke', clients.revoke, 'revoked'],
    ] as const)(
      'maps client %s to the resolved internal ID',
      async (operation, sdkMethod, output) => {
        await invoke('client', [operation, clientId], { force: true });

        expect(clients.get).toHaveBeenCalledWith(clientId);
        expect(sdkMethod).toHaveBeenCalledWith(clientId);
        expect(success).toHaveBeenCalledWith(expect.stringContaining(output));
      },
    );
  });

  describe('client secret commands', () => {
    it('maps secret generate argv to the internal client ID and one-time JSON result', async () => {
      await invoke('client', ['secret', 'generate', clientId], { label: 'rotation', json: true });

      expect(clients.generateSecret).toHaveBeenCalledWith(clientId, { label: 'rotation' });
      expect(printJson).toHaveBeenCalledWith(generatedSecret);
    });

    it('maps secret list argv and presents metadata without plaintext or hashes', async () => {
      await invoke('client', ['secret', 'list', clientId], { json: true });

      expect(clients.listSecrets).toHaveBeenCalledWith(clientId);
      expect(printJson).toHaveBeenCalledWith([secretMetadata]);
      const jsonOutput = JSON.stringify((printJson as ReturnType<typeof vi.fn>).mock.calls);
      expect(jsonOutput).not.toContain('plaintext');
      expect(jsonOutput).not.toContain('secretHash');
      expect(jsonOutput).not.toContain('secretSha256');
    });

    it('maps secret revoke argv with both internal IDs', async () => {
      await invoke('client', ['secret', 'revoke', clientId, secretId], { force: true });

      expect(clients.revokeSecret).toHaveBeenCalledWith(clientId, secretId);
      expect(success).toHaveBeenCalledWith(expect.stringContaining(secretId));
    });
  });

  describe('unsupported surfaces', () => {
    it('does not expose application or client restore commands', async () => {
      await invoke('app', ['restore', 'payments']);
      await invoke('client', ['restore', clientId]);

      expect(applications.restore).not.toHaveBeenCalled();
      expect(clients.restore).not.toHaveBeenCalled();
    });

    it('does not expose module remove', async () => {
      await invoke('app', ['module', 'remove', applicationId, moduleId]);

      expect(applications.removeModule).not.toHaveBeenCalled();
    });
  });
});

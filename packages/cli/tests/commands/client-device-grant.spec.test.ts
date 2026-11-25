/**
 * CLI specification for device-only client commands.
 *
 * The CLI must send the full URN, make redirects optional only for a
 * device-only selection, and clear the response-type collection when the
 * resulting client no longer uses authorization code.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockClients = {
  create: vi.fn(),
  list: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
};

vi.mock('../../src/client-factory.js', () => ({
  createClient: vi.fn(() => ({
    clients: mockClients,
    applications: { get: vi.fn() },
  })),
}));

vi.mock('../../src/error-handler.js', () => ({
  handleError: vi.fn(),
}));

vi.mock('../../src/output.js', () => ({
  printTable: vi.fn(),
  printJson: vi.fn(),
  success: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  formatDate: vi.fn((value: string) => value ?? 'N/A'),
  truncate: vi.fn((value: string) => value.slice(0, 8)),
}));

vi.mock('../../src/prompt.js', () => ({
  confirm: vi.fn(),
  question: vi.fn(),
}));

vi.mock('../../src/parsers.js', () => ({
  parseLoginMethodsFlag: vi.fn(() => undefined),
  parseCommaSeparated: vi.fn((input: string) =>
    input
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
  ),
  parseLoginMethods: vi.fn((input: string) => input.split(',')),
}));

import { handleError } from '../../src/error-handler.js';
import { printTable } from '../../src/output.js';

/** Full RFC 8628 grant value. */
const DEVICE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code';

/** Device-only client response used by the mocked SDK. */
const deviceClient = {
  id: 'client-uuid-device',
  organizationId: 'org-uuid',
  applicationId: 'app-uuid',
  clientId: 'device-client-id',
  clientName: 'Device CLI client',
  clientType: 'public' as const,
  applicationType: 'native' as const,
  status: 'active' as const,
  redirectUris: [] as string[],
  postLogoutRedirectUris: [],
  grantTypes: [DEVICE_GRANT],
  responseTypes: [] as string[],
  scope: 'openid profile',
  tokenEndpointAuthMethod: 'none',
  allowedOrigins: [],
  requirePkce: true,
  requireConsent: false,
  loginMethods: null,
  effectiveLoginMethods: ['password' as const],
  createdAt: '2026-11-25T10:00:00Z',
  updatedAt: '2026-11-25T10:00:00Z',
};

describe('client device grant commands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /** Invoke one client subcommand through the real yargs builder. */
  async function invoke(subcommand: string, extraArgs: Record<string, unknown> = {}): Promise<void> {
    const yargs = (await import('yargs')).default;
    const { clientCommand } = await import('../../src/commands/client.js');
    const args = ['client', ...subcommand.split(' ')];
    for (const [key, value] of Object.entries(extraArgs)) {
      if (key.startsWith('_pos_')) continue;
      if (typeof value === 'boolean') {
        if (value) args.push(`--${key}`);
      } else {
        args.push(`--${key}`, String(value));
      }
    }
    if (extraArgs._pos_) {
      const positionals = Array.isArray(extraArgs._pos_)
        ? extraArgs._pos_.map(String)
        : [String(extraArgs._pos_)];
      args.splice(1 + subcommand.split(' ').length, 0, ...positionals);
    }
    try {
      await yargs(args)
        .command(clientCommand)
        .option('json', { type: 'boolean', default: false })
        .option('verbose', { type: 'boolean', default: false })
        .option('insecure', { type: 'boolean', default: false })
        .option('force', { type: 'boolean', default: false })
        .option('server', { type: 'string' })
        .fail(false)
        .parse();
    } catch {
      // yargs can throw for a rejected command shape; the SDK mocks still reveal the outcome.
    }
  }

  it('creates a device-only public native client without redirect URIs', async () => {
    mockClients.create.mockResolvedValue({ client: deviceClient });

    await invoke('create', {
      org: 'org-uuid',
      app: 'a1234567-1234-1234-1234-123456789abc',
      type: 'public',
      'application-type': 'native',
      'grant-types': DEVICE_GRANT,
    });

    expect(handleError).not.toHaveBeenCalled();
    expect(mockClients.create).toHaveBeenCalledWith(
      expect.objectContaining({
        grantTypes: [DEVICE_GRANT],
        redirectUris: [],
        responseTypes: [],
      }),
    );
  });

  it('rejects an authorization-code create without redirect URIs before the API call', async () => {
    await invoke('create', {
      org: 'org-uuid',
      app: 'a1234567-1234-1234-1234-123456789abc',
      type: 'public',
      'application-type': 'web',
      'grant-types': 'authorization_code',
    });

    expect(mockClients.create).not.toHaveBeenCalled();
  });

  it('rejects an unknown grant before the API call', async () => {
    await invoke('create', {
      org: 'org-uuid',
      app: 'a1234567-1234-1234-1234-123456789abc',
      type: 'public',
      'application-type': 'native',
      'grant-types': 'urn:example:unknown',
    });

    expect(mockClients.create).not.toHaveBeenCalled();
  });

  it('updates to device-only and clears redirect and response types', async () => {
    mockClients.get.mockResolvedValue({ data: { ...deviceClient, grantTypes: ['authorization_code'] } });
    mockClients.update.mockResolvedValue(deviceClient);

    await invoke('update', {
      _pos_: 'client-uuid-device',
      'grant-types': DEVICE_GRANT,
      'redirect-uris': '',
    });

    expect(mockClients.update).toHaveBeenCalledWith(
      'client-uuid-device',
      expect.objectContaining({
        grantTypes: [DEVICE_GRANT],
        redirectUris: [],
        responseTypes: [],
      }),
      undefined,
    );
  });

  it('renders the full URN and the empty response-type state on get', async () => {
    mockClients.get.mockResolvedValue({ data: deviceClient });

    await invoke('get', { _pos_: 'client-uuid-device' });

    const rows = vi.mocked(printTable).mock.calls[0]?.[1] ?? [];
    const serialized = JSON.stringify(rows);
    expect(serialized).toContain(DEVICE_GRANT);
    expect(serialized).toContain('[]');
  });
});

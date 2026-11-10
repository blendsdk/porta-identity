/** Specification tests for the `porta app resource-server` CLI family. */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockApplications = {
  listResourceServers: vi.fn(),
  getResourceServer: vi.fn(),
  createResourceServer: vi.fn(),
  updateResourceServer: vi.fn(),
  deleteResourceServer: vi.fn(),
};

vi.mock('../../src/client-factory.js', () => ({
  createClient: vi.fn(() => ({ applications: mockApplications })),
}));

vi.mock('../../src/error-handler.js', () => ({
  handleError: vi.fn(),
}));

vi.mock('../../src/output.js', () => ({
  printTable: vi.fn(),
  printJson: vi.fn(),
  success: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  formatDate: vi.fn((value: string) => value),
}));

vi.mock('../../src/prompt.js', () => ({
  confirm: vi.fn(),
}));

import { printTable, success, warn } from '../../src/output.js';
import { confirm } from '../../src/prompt.js';

const sample = {
  id: '11111111-1111-4111-8111-111111111111',
  applicationId: '22222222-2222-4222-8222-222222222222',
  slug: 'billing-api',
  name: 'Billing API',
  identifier: 'https://billing.example.test',
  audience: 'https://billing.example.test',
  scopes: ['billing:read'],
  createdAt: '2026-11-09T00:00:00.000Z',
  updatedAt: '2026-11-09T00:00:00.000Z',
};

async function invokeSubcommand(subcommands: string[], extraArgs: Record<string, unknown> = {}) {
  const yargs = (await import('yargs')).default;
  const { appCommand } = await import('../../src/commands/app.js');
  const args = ['app', ...subcommands];

  for (const [key, value] of Object.entries(extraArgs)) {
    if (typeof value === 'boolean') {
      if (value) args.push(`--${key}`);
    } else if (Array.isArray(value)) {
      for (const entry of value) args.push(`--${key}`, String(entry));
    } else {
      args.push(`--${key}`, String(value));
    }
  }

  try {
    await yargs(args)
      .command(appCommand)
      .option('json', { type: 'boolean', default: false })
      .option('verbose', { type: 'boolean', default: false })
      .option('insecure', { type: 'boolean', default: false })
      .option('force', { type: 'boolean', default: false })
      .option('server', { type: 'string' })
      .fail(false)
      .parse();
  } catch {
    // yargs may throw; behavior is asserted through the mocks.
  }
}

describe('app resource-server command', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists an application resource servers in a table', async () => {
    mockApplications.listResourceServers.mockResolvedValue([sample]);

    await invokeSubcommand(['resource-server', 'list', 'acme']);

    expect(mockApplications.listResourceServers).toHaveBeenCalledWith('acme');
    expect(printTable).toHaveBeenCalledWith(
      ['ID', 'Name', 'Slug', 'Identifier', 'Audience', 'Scopes'],
      [[sample.id, sample.name, sample.slug, sample.identifier, sample.audience, 'billing:read']],
    );
  });

  it('creates a resource server with repeated scope flags', async () => {
    mockApplications.createResourceServer.mockResolvedValue(sample);

    await invokeSubcommand(['resource-server', 'create', 'acme'], {
      name: 'Billing API',
      identifier: 'https://billing.example.test',
      scope: ['billing:read', 'billing:write'],
    });

    expect(mockApplications.createResourceServer).toHaveBeenCalledWith('acme', {
      name: 'Billing API',
      identifier: 'https://billing.example.test',
      scopes: ['billing:read', 'billing:write'],
    });
    expect(success).toHaveBeenCalledWith(expect.stringContaining('Billing API'));
  });

  it('clears the custom scope set on update when --scope is omitted', async () => {
    mockApplications.updateResourceServer.mockResolvedValue({ ...sample, scopes: [] });

    await invokeSubcommand(['resource-server', 'update', 'acme', 'billing-api'], {
      name: 'Billing API',
      slug: 'billing-api',
      identifier: 'https://billing.example.test',
    });

    expect(mockApplications.updateResourceServer).toHaveBeenCalledWith('acme', 'billing-api', {
      name: 'Billing API',
      slug: 'billing-api',
      identifier: 'https://billing.example.test',
      scopes: [],
    });
  });

  it('does not delete when confirmation is declined', async () => {
    vi.mocked(confirm).mockResolvedValue(false);

    await invokeSubcommand(['resource-server', 'delete', 'acme', 'billing-api']);

    expect(confirm).toHaveBeenCalled();
    expect(mockApplications.deleteResourceServer).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith('Deletion cancelled');
  });

  it('deletes without confirmation when --yes is set', async () => {
    mockApplications.deleteResourceServer.mockResolvedValue(undefined);

    await invokeSubcommand(['resource-server', 'delete', 'acme', 'billing-api'], { yes: true });

    expect(confirm).not.toHaveBeenCalled();
    expect(mockApplications.deleteResourceServer).toHaveBeenCalledWith('acme', 'billing-api');
  });
});

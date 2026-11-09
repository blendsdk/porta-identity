/** Implementation tests for CLI resource-server output and flag edges. */

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

vi.mock('../../src/prompt.js', () => ({ confirm: vi.fn() }));

import { printJson, printTable, warn } from '../../src/output.js';

const sample = {
  id: '11111111-1111-4111-8111-111111111111',
  applicationId: '22222222-2222-4222-8222-222222222222',
  slug: 'billing-api',
  name: 'Billing API',
  identifier: 'https://billing.example.test',
  audience: 'https://billing.example.test',
  scopes: [],
  createdAt: '2026-11-09T00:00:00.000Z',
  updatedAt: '2026-11-09T00:00:00.000Z',
};

async function invoke(subcommands: string[], extraArgs: Record<string, unknown> = {}) {
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
    // Behavior is asserted through mocks.
  }
}

describe('app resource-server implementation edges', () => {
  beforeEach(() => vi.clearAllMocks());

  it('warns without printing a table for an empty list', async () => {
    mockApplications.listResourceServers.mockResolvedValue([]);

    await invoke(['resource-server', 'list', 'acme']);

    expect(warn).toHaveBeenCalledWith('No resource servers found');
    expect(printTable).not.toHaveBeenCalled();
  });

  it('prints JSON for a get request', async () => {
    mockApplications.getResourceServer.mockResolvedValue(sample);

    await invoke(['resource-server', 'get', 'acme', 'billing-api'], { json: true });

    expect(printJson).toHaveBeenCalledWith(sample);
  });

  it('passes an explicit audience and empty scope list on create', async () => {
    mockApplications.createResourceServer.mockResolvedValue(sample);

    await invoke(['resource-server', 'create', 'acme'], {
      name: 'Billing API',
      identifier: 'https://billing.example.test',
      audience: 'https://api.billing.example.test',
    });

    expect(mockApplications.createResourceServer).toHaveBeenCalledWith('acme', {
      name: 'Billing API',
      identifier: 'https://billing.example.test',
      audience: 'https://api.billing.example.test',
      scopes: [],
    });
  });
});

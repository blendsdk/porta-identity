import { beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({
  exports: { manifest: vi.fn() },
  imports: { preview: vi.fn(), apply: vi.fn() },
}));
const filesystem = vi.hoisted(() => ({
  access: vi.fn(),
  readFile: vi.fn(),
  stat: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock('../../src/client-factory.js', () => ({ createClient: vi.fn(() => sdk) }));
vi.mock('../../src/error-handler.js', () => ({ handleError: vi.fn() }));
vi.mock('../../src/output.js', () => ({
  printTable: vi.fn(),
  printJson: vi.fn(),
  success: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  formatDate: vi.fn((value: string) => value),
  truncate: vi.fn((value: string) => value),
}));
vi.mock('../../src/prompt.js', () => ({ confirm: vi.fn() }));
vi.mock('node:fs/promises', () => ({ ...filesystem, default: filesystem }));

import { handleError } from '../../src/error-handler.js';
import { confirm } from '../../src/prompt.js';

const manifest = {
  version: '1.0',
  exported_at: '2026-09-14T10:11:12.345Z',
  scope: { kind: 'organization', organization_slug: 'acme' },
  categories: ['organizations'],
  application_selection: { all_applications: false, application_slugs: [] },
  organizations: [],
  applications: [],
  application_modules: [],
  roles: [],
  permissions: [],
  claim_definitions: [],
  role_permission_mappings: [],
  users: [],
  user_role_assignments: [],
  user_claim_values: [],
  clients: [],
} as const;
const counts = { created: 0, updated: 0, skipped: 0, rejected: 0 } as const;
const preview = {
  mode: 'dry-run',
  summary: Object.fromEntries(
    [
      'organizations',
      'applications',
      'application_modules',
      'roles',
      'permissions',
      'claim_definitions',
      'role_permission_mappings',
      'users',
      'user_role_assignments',
      'user_claim_values',
      'clients',
    ].map((entity) => [entity, counts]),
  ),
  items: [],
  errors: [],
} as const;

/** Run one command module through its strict yargs boundary. */
async function invoke(family: 'export' | 'import', arguments_: readonly string[]): Promise<void> {
  const yargs = (await import('yargs')).default;
  const command =
    family === 'export'
      ? (await import('../../src/commands/export.js')).exportCommand
      : (await import('../../src/commands/import.js')).importCommand;
  try {
    await yargs([family, ...arguments_])
      .command(command)
      .option('json', { type: 'boolean', default: false })
      .option('verbose', { type: 'boolean', default: false })
      .option('insecure', { type: 'boolean', default: false })
      .option('server', { type: 'string' })
      .option('force', { type: 'boolean', default: false })
      .strict()
      .exitProcess(false)
      .parse();
  } catch {
    // These tests exercise failures handled inside the command implementation.
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  process.exitCode = undefined;
  filesystem.access.mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' }));
  filesystem.stat.mockResolvedValue({ size: Buffer.byteLength(JSON.stringify(manifest)) });
  filesystem.readFile.mockResolvedValue(JSON.stringify(manifest));
  filesystem.writeFile.mockResolvedValue(undefined);
  vi.mocked(confirm).mockResolvedValue(false);
  sdk.imports.preview.mockResolvedValue(preview);
});

describe('portability CLI implementation edges', () => {
  it('routes a non-missing output access failure without calling the SDK', async () => {
    const accessFailure = Object.assign(new Error('access denied'), { code: 'EACCES' });
    filesystem.access.mockRejectedValue(accessFailure);

    await invoke('export', [
      'manifest',
      '--environment',
      '--category',
      'organizations',
      '--output',
      'manifest.json',
    ]);

    expect(handleError).toHaveBeenCalledWith(accessFailure, false);
    expect(sdk.exports.manifest).not.toHaveBeenCalled();
    expect(filesystem.writeFile).not.toHaveBeenCalled();
  });

  it('accepts a manifest exactly at the local size limit', async () => {
    filesystem.stat.mockResolvedValue({ size: 64 * 1024 * 1024 });

    await invoke('import', ['manifest', 'manifest.json', '--mode', 'keep-existing']);

    expect(sdk.imports.preview).toHaveBeenCalledWith(manifest);
    expect(sdk.imports.apply).not.toHaveBeenCalled();
  });

  it('hides filesystem details when reading a manifest fails', async () => {
    filesystem.readFile.mockRejectedValue(new Error('/private/operator/path: permission denied'));

    await invoke('import', ['manifest', 'manifest.json', '--mode', 'keep-existing']);

    expect(handleError).toHaveBeenCalledOnce();
    const failure = vi.mocked(handleError).mock.calls[0]?.[0];
    expect(failure).toBeInstanceOf(Error);
    expect(failure).toMatchObject({ message: 'Unable to read manifest file.' });
    expect(String(failure)).not.toContain('/private/operator/path');
    expect(sdk.imports.preview).not.toHaveBeenCalled();
  });
});

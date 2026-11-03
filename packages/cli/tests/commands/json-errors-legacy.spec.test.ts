/** JSON diagnostics are additive: legacy reports, exits and mutation boundaries remain intact. */
import type * as NodeFs from 'node:fs';
import type * as NodeFsPromises from 'node:fs/promises';
import { join } from 'node:path';
import { PortaForbiddenError } from '@portaidentity/sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  captureCommandOutput,
  CommandExit,
  createEmptyHome,
  expectErrorEnvelope,
  removeEmptyHome,
} from '../helpers/json-error-contract.js';

const boundary = vi.hoisted(() => ({
  createClient: vi.fn(),
  readFile: vi.fn(),
  stat: vi.fn(),
  existsSync: vi.fn((_path: unknown) => false),
  readFileSync: vi.fn(),
}));
vi.mock('../../src/client-factory.js', () => ({ createClient: boundary.createClient }));
vi.mock('node:fs', async (original) => {
  const actual = await original<typeof NodeFs>();
  const simulated = { existsSync: boundary.existsSync, readFileSync: boundary.readFileSync };
  return { ...actual, ...simulated, default: { ...actual.default, ...simulated } };
});
vi.mock('node:fs/promises', async (original) => {
  const actual = await original<typeof NodeFsPromises>();
  const simulated = { readFile: boundary.readFile, stat: boundary.stat };
  return { ...actual, ...simulated, default: { ...actual.default, ...simulated } };
});

const id = '11111111-1111-4111-8111-111111111111';
const invalidInput = { code: 'VALIDATION_ERROR', message: 'The command input is invalid.' };
const incomplete = {
  code: 'BATCH_INCOMPLETE',
  message: 'The operation did not complete successfully.',
};
const configEntry = {
  key: 'magic_link_ttl',
  group: 'lifetimes',
  label: 'Magic-link lifetime',
  description: 'How long a magic link remains valid.',
  value: 900,
  defaultValue: 900,
  valueType: 'integer',
  unit: 'seconds',
  minimum: 60,
  maximum: 3600,
  applicationMode: 'runtime',
  updatedAt: '2026-09-16T00:00:00.000Z',
};
const manifest = {
  version: '1.0',
  exported_at: '2026-09-14T10:11:12.345Z',
  scope: { kind: 'organization', organization_slug: 'acme' },
  categories: ['organizations'],
  application_selection: { all_applications: false, application_slugs: [] },
  organizations: [{ slug: 'acme', name: 'Acme' }],
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
};
const partialBulk = {
  total: 2,
  succeeded: 1,
  failed: 1,
  results: [
    { id: 'u1', success: true, previousStatus: 'active', newStatus: 'inactive' },
    { id: 'u2', success: false, error: 'User not found' },
  ],
};

let home: string;
let output: ReturnType<typeof captureCommandOutput>;
let priorExitCode: typeof process.exitCode;
const sdk = {
  config: { get: vi.fn(), set: vi.fn() },
  bulk: { organizationStatus: vi.fn(), userStatus: vi.fn() },
  organizations: { list: vi.fn() },
  applications: { list: vi.fn() },
  clients: { list: vi.fn() },
  users: { list: vi.fn() },
  sessions: { list: vi.fn() },
  imports: { preview: vi.fn(), apply: vi.fn() },
};

beforeEach(async () => {
  vi.resetAllMocks();
  home = await createEmptyHome();
  vi.stubEnv('HOME', home);
  vi.stubEnv('PORTA_SERVER', 'https://porta.example.test');
  priorExitCode = process.exitCode;
  process.exitCode = undefined;
  output = captureCommandOutput();
  boundary.createClient.mockReturnValue(sdk);
  boundary.existsSync.mockReturnValue(false);
  boundary.readFileSync.mockImplementation(() => {
    throw new Error('No credential file exists');
  });
  boundary.readFile.mockResolvedValue(JSON.stringify(manifest));
  boundary.stat.mockResolvedValue({ size: Buffer.byteLength(JSON.stringify(manifest)) });
  sdk.config.get.mockResolvedValue(configEntry);
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Unexpected HTTP request')));
});
afterEach(async () => {
  process.exitCode = priorExitCode;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await removeEmptyHome(home);
});

/** Run the real parser and handler; suppress only the deliberate process-exit sentinel. */
async function run(args: readonly string[]): Promise<number> {
  const { createCli } = await import('../../src/cli.js');
  try {
    await createCli(args).parseAsync();
  } catch (error) {
    if (!(error instanceof CommandExit)) throw error;
  }
  const calls = vi.mocked(process.exit).mock.calls;
  expect(calls.length).toBeLessThanOrEqual(1);
  return Number(calls[0]?.[0] ?? process.exitCode ?? 0);
}

describe('legacy local failures', () => {
  it('should report missing whoami credentials with the original exit one and empty stdout', async () => {
    expect(await run(['whoami', '--json'])).toBe(1);
    expectErrorEnvelope(output.stderr, {
      code: 'AUTHENTICATION_REQUIRED',
      message: 'Authentication is required.',
    });
    expect(output.stdout).toBe('');
    expect(boundary.readFileSync).not.toHaveBeenCalled();
    for (const [path] of boundary.existsSync.mock.calls)
      expect(String(path).startsWith(home)).toBe(true);
  });

  it('should report a locally invalid config value with exit three and no HTTP status', async () => {
    expect(await run(['config', 'set', configEntry.key, '1.5', '--json'])).toBe(3);
    expectErrorEnvelope(output.stderr, invalidInput);
    expect(output.stdout).toBe('');
    expect(sdk.config.set).not.toHaveBeenCalled();
  });

  it.each([
    ['no IDs', ['--entity-type', 'organizations', '--action', 'suspend', '--ids', ', ,']],
    [
      'incompatible action',
      ['--entity-type', 'organizations', '--action', 'deactivate', '--ids', id],
    ],
    ['missing organization', ['--entity-type', 'users', '--action', 'deactivate', '--ids', id]],
  ] as const)('should retain bulk return zero for %s without mutating', async (_name, args) => {
    expect(await run(['bulk', 'execute', ...args, '--json', '--force'])).toBe(0);
    expectErrorEnvelope(output.stderr, invalidInput);
    expect(output.stdout).toBe('');
    expect(sdk.bulk.organizationStatus).not.toHaveBeenCalled();
    expect(sdk.bulk.userStatus).not.toHaveBeenCalled();
  });
});

describe('legacy structured failure reports', () => {
  it('should preserve a partial bulk result and exit zero, adding only one aggregate error', async () => {
    sdk.bulk.userStatus.mockResolvedValue(partialBulk);
    expect(
      await run([
        'bulk',
        'execute',
        '--entity-type',
        'users',
        '--action',
        'deactivate',
        '--ids',
        'u1,u2',
        '--organization-id',
        id,
        '--force',
        '--json',
      ]),
    ).toBe(0);
    expect(JSON.parse(output.stdout)).toStrictEqual(partialBulk);
    expectErrorEnvelope(output.stderr, incomplete);
    expect(sdk.bulk.userStatus).toHaveBeenCalledOnce();
  });

  it('should preserve a rejected import preview and exit one without applying it', async () => {
    const rejected = {
      mode: 'dry-run',
      summary: { organizations: { created: 0, updated: 0, skipped: 0, rejected: 1 } },
      items: [],
      errors: [
        {
          entity_type: 'organizations',
          natural_key: { slug: 'acme' },
          code: 'incompatible_record',
        },
      ],
    };
    sdk.imports.preview.mockResolvedValue(rejected);
    expect(
      await run([
        'import',
        'manifest',
        join(home, 'manifest.json'),
        '--mode',
        'keep-existing',
        '--json',
      ]),
    ).toBe(1);
    expect(JSON.parse(output.stdout)).toStrictEqual(rejected);
    expectErrorEnvelope(output.stderr, incomplete);
    expect(sdk.imports.apply).not.toHaveBeenCalled();
  });

  it('should preserve the doctor checks array and exit one with a single diagnostic summary', async () => {
    const body = { status: 'unhealthy', checks: { database: 'error', redis: 'ok' } };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 503 })),
    );
    expect(await run(['doctor', '--server', 'https://porta.example.test', '--json'])).toBe(1);
    const checks: unknown = JSON.parse(output.stdout);
    expect(Array.isArray(checks)).toBe(true);
    expect(checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Node.js version' }),
        expect.objectContaining({ name: 'Credentials' }),
        expect.objectContaining({ name: 'Token validity' }),
        expect.objectContaining({ name: 'Server health', status: 'fail' }),
        expect.objectContaining({ name: 'Admin metadata' }),
      ]),
    );
    expectErrorEnvelope(output.stderr, {
      code: 'DIAGNOSTIC_FAILED',
      message: 'One or more checks failed.',
    });
  });

  it('should preserve an unhealthy health JSON body and legacy return zero with known status', async () => {
    const body = { status: 'unhealthy', checks: { database: 'error', redis: 'ok' } };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 503 })),
    );
    expect(await run(['health', '--server', 'https://porta.example.test', '--json'])).toBe(0);
    expect(JSON.parse(output.stdout)).toStrictEqual(body);
    expectErrorEnvelope(output.stderr, {
      code: 'SERVER_ERROR',
      message: 'The server could not complete the request.',
      status: 503,
    });
  });

  it('should retain the unhealthy health human exit one without a JSON wrapper', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('{"status":"unhealthy"}', { status: 503 })),
    );
    expect(await run(['health', '--server', 'https://porta.example.test'])).toBe(1);
    expect(`${output.stdout}${output.stderr}`).not.toContain('"code"');
  });
});

describe('conventional caller groups', () => {
  it.each([
    ['organization', ['org', 'list'], sdk.organizations.list],
    ['application', ['app', 'list'], sdk.applications.list],
    ['client', ['client', 'list', '--app', id], sdk.clients.list],
    ['user', ['user', 'list', '--org', id], sdk.users.list],
    ['infrastructure', ['sessions', 'list'], sdk.sessions.list],
  ] as const)(
    'should classify a forbidden %s failure through the real handler',
    async (_name, args, method) => {
      method.mockRejectedValue(new PortaForbiddenError({ error: 'SENSITIVE_MARKER' }));
      expect(await run([...args, '--json'])).toBe(2);
      expect(method).toHaveBeenCalledOnce();
      expect(output.stdout).toBe('');
      expectErrorEnvelope(output.stderr, {
        code: 'FORBIDDEN',
        message: 'This operation is not permitted.',
        status: 403,
      });
    },
  );
});

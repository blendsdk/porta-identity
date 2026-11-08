/**
 * Bounded local validation for the service-account policy file.
 *
 * Every rejected case must stop before the SDK client exists and must not repeat the
 * supplied path, address or document body. The exact 100 KiB boundary, the policy
 * maxima and the accepted cross-target duplicate control are covered as well.
 */

import { execFile } from 'node:child_process';
import { constants } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CliArgumentError } from '../../src/error-format.js';
import {
  captureCommandOutput,
  CommandExit,
  createEmptyHome,
  expectErrorEnvelope,
  removeEmptyHome,
  runExecutable,
} from '../helpers/json-error-contract.js';

const { mockCreateClient } = vi.hoisted(() => ({ mockCreateClient: vi.fn() }));
const mockSetServiceAccount = vi.fn();
const mockClients = { setServiceAccount: mockSetServiceAccount };

vi.mock('../../src/client-factory.js', () => ({ createClient: mockCreateClient }));
vi.mock('../../src/prompt.js', () => ({ confirm: vi.fn(), question: vi.fn() }));

const clientUuid = '11111111-1111-4111-8111-111111111111';
const marker = 'SENSITIVE_MARKER';
/** Maximum raw policy-file size, including whitespace and line endings. */
const MAX_POLICY_BYTES = 102_400;
const invalid = { code: 'VALIDATION_ERROR', message: 'The command input is invalid.' };
const execute = promisify(execFile);

let home: string;
let output: ReturnType<typeof captureCommandOutput>;
let previousExitCode: typeof process.exitCode;

/**
 * Run the real conventional CLI and report the number its command boundary chose.
 * Parser rejections and terminal exits stop the fixture; no other error is swallowed.
 */
async function runClient(args: readonly string[]): Promise<number> {
  const { createCli } = await import('../../src/cli.js');
  try {
    await createCli(['client', ...args]).parseAsync();
  } catch (error) {
    if (!(error instanceof CommandExit) && !(error instanceof CliArgumentError)) throw error;
  }
  const exits = vi.mocked(process.exit).mock.calls;
  expect(exits.length).toBeLessThanOrEqual(1);
  return Number(exits[0]?.[0] ?? process.exitCode ?? 0);
}

/** Remove ANSI colour so assertions compare the text an operator actually reads. */
function plain(value: string): string {
  // eslint-disable-next-line no-control-regex -- Strip ANSI colour only for comparison.
  return value.replace(/\u001b\[[0-9;]*m/g, '');
}

/** Build a distinct, lowercase UUID for a synthetic organization or assignment. */
function uuid(index: number): string {
  return `00000000-1111-4111-8111-${index.toString(16).padStart(12, '0')}`;
}

/** One policy target with both mandatory assignment arrays present. */
function target(index: number): {
  organizationId: string;
  allowedRoles: { applicationId: string; roleId: string }[];
  allowedClaimDefinitions: { applicationId: string; claimDefinitionId: string }[];
} {
  return { organizationId: uuid(index), allowedRoles: [], allowedClaimDefinitions: [] };
}

/** Write one owned JSON policy document and return its absolute path. */
async function writeJson(name: string, document: unknown): Promise<string> {
  const path = join(home, name);
  await writeFile(path, JSON.stringify(document), 'utf8');
  return path;
}

/** Invoke set in JSON mode unless a test asks for the human boundary. */
async function runSet(
  policyPath: string,
  flags: readonly string[] = ['--json'],
): Promise<number> {
  return runClient(['service-account', 'set', clientUuid, '--policy-file', policyPath, ...flags]);
}

/** Require the fixed local validation outcome and prove no SDK work happened. */
function expectLocalRejection(): void {
  expect(mockCreateClient).not.toHaveBeenCalled();
  expect(mockSetServiceAccount).not.toHaveBeenCalled();
  expect(output.stdout).toBe('');
  expectErrorEnvelope(output.stderr, invalid);
}

beforeEach(async () => {
  vi.resetAllMocks();
  home = await createEmptyHome();
  vi.stubEnv('HOME', home);
  vi.stubEnv('XDG_CONFIG_HOME', home);
  vi.stubEnv('PORTA_SERVER', 'https://porta.example.test');
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Unexpected HTTP request')));
  previousExitCode = process.exitCode;
  process.exitCode = undefined;
  output = captureCommandOutput();
  mockCreateClient.mockReturnValue({ clients: mockClients });
});

afterEach(async () => {
  process.exitCode = previousExitCode;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await removeEmptyHome(home);
});

describe('bounded regular-file input', () => {
  it('rejects malformed JSON without constructing a client or echoing the path', async () => {
    const path = join(home, `${marker}-broken.json`);
    await writeFile(path, `{"targets":[],"${marker}":`, 'utf8');

    expect(await runSet(path)).toBe(3);

    expectLocalRejection();
    expect(output.stderr).not.toContain(marker);
    expect(output.stderr).not.toContain(path);
  });

  it('rejects invalid UTF-8 bytes before constructing a client', async () => {
    const valid = Buffer.from(JSON.stringify({ targets: [target(1)] }), 'utf8');
    const path = join(home, 'invalid-utf8.json');
    await writeFile(path, Buffer.concat([valid, Buffer.from([0x0a, 0xc3, 0x28])]));

    expect(await runSet(path)).toBe(3);

    expectLocalRejection();
  });

  it('rejects a directory path without constructing a client', async () => {
    const path = join(home, `${marker}-directory`);
    await mkdir(path);

    expect(await runSet(path)).toBe(3);

    expectLocalRejection();
    expect(output.stderr).not.toContain(marker);
  });

  it('rejects a file one byte over 100 KiB', async () => {
    const body = JSON.stringify({ targets: [target(1)] });
    const content = body + ' '.repeat(MAX_POLICY_BYTES + 1 - Buffer.byteLength(body));
    expect(Buffer.byteLength(content)).toBe(MAX_POLICY_BYTES + 1);
    const path = join(home, 'oversized.json');
    await writeFile(path, content, 'utf8');

    expect(await runSet(path)).toBe(3);

    expectLocalRejection();
  });

  it('accepts exactly 100 KiB and sends the parsed policy once', async () => {
    const body = JSON.stringify({ targets: [target(1)] });
    const content = body + ' '.repeat(MAX_POLICY_BYTES - Buffer.byteLength(body));
    expect(Buffer.byteLength(content)).toBe(MAX_POLICY_BYTES);
    const path = join(home, 'at-limit.json');
    await writeFile(path, content, 'utf8');
    mockSetServiceAccount.mockResolvedValue({});

    expect(await runSet(path)).toBe(0);

    expect(mockSetServiceAccount).toHaveBeenCalledExactlyOnceWith(clientUuid, {
      targets: [target(1)],
    });
  });
});

describe('policy shape and bounds', () => {
  it('rejects an empty target set', async () => {
    expect(await runSet(await writeJson('empty.json', { targets: [] }))).toBe(3);

    expectLocalRejection();
  });

  it('rejects an unknown top-level field without echoing its value', async () => {
    const document = { targets: [target(1)], [marker]: marker };

    expect(await runSet(await writeJson('unknown-field.json', document))).toBe(3);

    expectLocalRejection();
    expect(output.stderr).not.toContain(marker);
  });

  it.each([
    [
      'organization',
      { targets: [{ organizationId: '*', allowedRoles: [], allowedClaimDefinitions: [] }] },
    ],
    [
      'role',
      {
        targets: [
          {
            organizationId: uuid(1),
            allowedRoles: [{ applicationId: uuid(2), roleId: 'not-a-uuid' }],
            allowedClaimDefinitions: [],
          },
        ],
      },
    ],
    [
      'claim definition',
      {
        targets: [
          {
            organizationId: uuid(1),
            allowedRoles: [],
            allowedClaimDefinitions: [
              { applicationId: uuid(2), claimDefinitionId: 'not-a-uuid' },
            ],
          },
        ],
      },
    ],
  ])('rejects a malformed %s identifier', async (name, document) => {
    expect(await runSet(await writeJson(`invalid-${name}.json`, document))).toBe(3);

    expectLocalRejection();
  });

  it('rejects a target that omits one assignment array', async () => {
    const document = { targets: [{ organizationId: uuid(1), allowedRoles: [] }] };

    expect(await runSet(await writeJson('missing-array.json', document))).toBe(3);

    expectLocalRejection();
  });

  it('rejects duplicate organizations regardless of UUID case', async () => {
    const document = {
      targets: [target(10), { ...target(10), organizationId: uuid(10).toUpperCase() }],
    };

    expect(await runSet(await writeJson('duplicate-org.json', document))).toBe(3);

    expectLocalRejection();
  });

  it('rejects a duplicate application-qualified role pair regardless of case', async () => {
    const pair = { applicationId: uuid(0xabc), roleId: uuid(0xabd) };
    const document = {
      targets: [
        {
          organizationId: uuid(1),
          allowedRoles: [
            pair,
            {
              applicationId: pair.applicationId.toUpperCase(),
              roleId: pair.roleId.toUpperCase(),
            },
          ],
          allowedClaimDefinitions: [],
        },
      ],
    };

    expect(await runSet(await writeJson('duplicate-pair.json', document))).toBe(3);

    expectLocalRejection();
  });

  it('rejects a duplicate application-qualified claim pair regardless of case', async () => {
    const pair = { applicationId: uuid(0xabe), claimDefinitionId: uuid(0xabf) };
    const document = {
      targets: [
        {
          organizationId: uuid(1),
          allowedRoles: [],
          allowedClaimDefinitions: [
            pair,
            {
              applicationId: pair.applicationId.toUpperCase(),
              claimDefinitionId: pair.claimDefinitionId.toUpperCase(),
            },
          ],
        },
      ],
    };

    expect(await runSet(await writeJson('duplicate-claim-pair.json', document))).toBe(3);

    expectLocalRejection();
  });

  it('accepts the same role pair under two distinct organizations', async () => {
    const pair = { applicationId: uuid(900), roleId: uuid(901) };
    const document = {
      targets: [
        { organizationId: uuid(1), allowedRoles: [pair], allowedClaimDefinitions: [] },
        { organizationId: uuid(2), allowedRoles: [pair], allowedClaimDefinitions: [] },
      ],
    };
    mockSetServiceAccount.mockResolvedValue({});

    expect(await runSet(await writeJson('cross-target.json', document))).toBe(0);

    expect(mockSetServiceAccount).toHaveBeenCalledExactlyOnceWith(clientUuid, document);
  });

  it('accepts exactly 100 distinct organizations', async () => {
    const targets = Array.from({ length: 100 }, (_, index) => target(index + 1));
    mockSetServiceAccount.mockResolvedValue({});

    expect(await runSet(await writeJson('max-targets.json', { targets }))).toBe(0);

    expect(mockSetServiceAccount).toHaveBeenCalledExactlyOnceWith(clientUuid, { targets });
  });

  it('rejects 101 distinct organizations', async () => {
    const targets = Array.from({ length: 101 }, (_, index) => target(index + 1));

    expect(await runSet(await writeJson('too-many-targets.json', { targets }))).toBe(3);

    expectLocalRejection();
  });

  it('accepts exactly 100 role pairs on one target', async () => {
    const pairs = Array.from({ length: 100 }, (_, index) => ({
      applicationId: uuid(900),
      roleId: uuid(2_000 + index),
    }));
    const document = {
      targets: [
        { organizationId: uuid(1), allowedRoles: pairs, allowedClaimDefinitions: [] },
      ],
    };
    mockSetServiceAccount.mockResolvedValue({});

    expect(await runSet(await writeJson('max-pairs.json', document))).toBe(0);

    expect(mockSetServiceAccount).toHaveBeenCalledExactlyOnceWith(clientUuid, document);
  });

  it('rejects 101 role pairs spread over two targets', async () => {
    const pairs = Array.from({ length: 101 }, (_, index) => ({
      applicationId: uuid(900),
      roleId: uuid(1_000 + index),
    }));
    const document = {
      targets: [
        { organizationId: uuid(1), allowedRoles: pairs.slice(0, 51), allowedClaimDefinitions: [] },
        { organizationId: uuid(2), allowedRoles: pairs.slice(51), allowedClaimDefinitions: [] },
      ],
    };

    expect(await runSet(await writeJson('too-many-pairs.json', document))).toBe(3);

    expectLocalRejection();
  });

  it('rejects 101 claim-definition pairs spread over two targets', async () => {
    const pairs = Array.from({ length: 101 }, (_, index) => ({
      applicationId: uuid(900),
      claimDefinitionId: uuid(3_000 + index),
    }));
    const document = {
      targets: [
        {
          organizationId: uuid(1),
          allowedRoles: [],
          allowedClaimDefinitions: pairs.slice(0, 51),
        },
        {
          organizationId: uuid(2),
          allowedRoles: [],
          allowedClaimDefinitions: pairs.slice(51),
        },
      ],
    };

    expect(await runSet(await writeJson('too-many-claim-pairs.json', document))).toBe(3);

    expectLocalRejection();
  });
});

describe('email and human diagnostics', () => {
  it('rejects an invalid email without echoing it', async () => {
    const path = await writeJson('valid.json', { targets: [target(1)] });

    expect(await runSet(path, ['--email', marker, '--json'])).toBe(3);

    expect(mockCreateClient).not.toHaveBeenCalled();
    expect(mockSetServiceAccount).not.toHaveBeenCalled();
    expect(output.stderr).not.toContain(marker);
    expectErrorEnvelope(output.stderr, invalid);
  });

  it('reports malformed JSON in human mode without echoing the path or body', async () => {
    const path = join(home, `${marker}-broken.json`);
    await writeFile(path, `{"targets":[],"${marker}":`, 'utf8');

    expect(await runSet(path, [])).toBe(3);

    expect(mockCreateClient).not.toHaveBeenCalled();
    expect(mockSetServiceAccount).not.toHaveBeenCalled();
    expect(output.stdout).toBe('');
    const text = plain(output.stderr);
    expect(text.trim()).not.toBe('');
    expect(text).not.toContain(marker);
    expect(text).not.toContain('"code"');
  });
});

describe.skipIf(process.platform === 'win32' || !constants.O_NONBLOCK)('special files', () => {
  it('rejects a no-writer FIFO without blocking or constructing a client', async () => {
    const path = join(home, `${marker}.fifo`);
    await execute('mkfifo', [path]);

    const result = await runExecutable([
      'client',
      'service-account',
      'set',
      clientUuid,
      '--policy-file',
      path,
      '--json',
    ]);

    expect(result.status).toBe(3);
    expect(result.stdout).toBe('');
    expectErrorEnvelope(result.stderr, invalid);
    expect(result.stderr).not.toContain(marker);
  });
});

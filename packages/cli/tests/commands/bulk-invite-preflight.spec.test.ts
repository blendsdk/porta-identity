/** Every file and shared-option check completes before client creation or any recipient mutation. */
import fs, { writeFile } from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
import type { InviteUserInput } from '@portaidentity/sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  captureCommandOutput, CommandExit, createEmptyHome, expectErrorEnvelope, removeEmptyHome, runExecutable,
} from '../helpers/json-error-contract.js';

const boundary = vi.hoisted(() => ({ createClient: vi.fn(), invite: vi.fn() }));
vi.mock('../../src/client-factory.js', () => ({ createClient: boundary.createClient }));

const org = '11111111-1111-4111-8111-111111111111';
const applicationId = 'abcdefab-1234-4123-8123-abcdefabcdef';
const claimDefinitionId = 'fedcbafe-4321-4321-8321-fedcbafedcba';
const marker = 'SENSITIVE_MARKER';
const invalid = { code: 'VALIDATION_ERROR', message: 'The command input is invalid.' };
const argument = { code: 'ARGUMENT_ERROR', message: 'Invalid command arguments.' };
let root: string;
let path: string;
let output: ReturnType<typeof captureCommandOutput>;
let previousExitCode: typeof process.exitCode;

/** Split only the identifier separators; the complete JSON remainder is one flag argument. */
function claim(raw: string): string { return `${applicationId}:${claimDefinitionId}:${raw}`; }

/** Runtime qualification ensures finite JSON is not confused with complete-request encodability. */
function encodingCounterexample(): string {
  for (let depth = 1000; depth <= 32_000; depth *= 2) {
    const raw = `${'['.repeat(depth)}0${']'.repeat(depth)}`;
    const input: InviteUserInput = {
      organizationId: org, email: 'alice@example.com',
      claims: [{ applicationId, claimDefinitionId, value: JSON.parse(raw) }],
    };
    try { JSON.stringify(input); } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      return raw;
    }
  }
  throw new Error('Runtime did not qualify a complete-request encoding counterexample');
}

/** Keep the real registration, parser, preflight, runner and formatter on the tested path. */
async function run(flags: readonly string[] = [], organization = org): Promise<number> {
  const { createCli } = await import('../../src/cli.js');
  try {
    await createCli(['bulk', 'invite', '--file', path, '--org', organization, ...flags, '--json', '--verbose']).parseAsync();
  } catch (error) {
    if (!(error instanceof CommandExit)) throw error;
  }
  const exits = vi.mocked(process.exit).mock.calls;
  expect(exits.length).toBeLessThanOrEqual(1);
  return Number(exits[0]?.[0] ?? process.exitCode ?? 0);
}

/** No partial recipient report or factory construction is permitted for known-bad local input. */
async function expectLocal(flags: readonly string[] = [], organization = org): Promise<void> {
  expect(await run(flags, organization)).toBe(3);
  expect(output.stdout).toBe('');
  expectErrorEnvelope(output.stderr, invalid);
  expect(boundary.createClient).not.toHaveBeenCalled();
  expect(boundary.invite).not.toHaveBeenCalled();
}

beforeEach(async () => {
  vi.resetAllMocks();
  root = await createEmptyHome();
  path = join(root, 'SENSITIVE_MARKER-recipients.txt');
  await writeFile(path, 'alice@example.com\nbob@example.com');
  vi.stubEnv('HOME', root);
  vi.stubEnv('XDG_CONFIG_HOME', root);
  vi.stubEnv('PORTA_SERVER', 'https://porta.example.test');
  previousExitCode = process.exitCode;
  process.exitCode = undefined;
  output = captureCommandOutput();
  boundary.createClient.mockReturnValue({ users: { invite: boundary.invite } });
  boundary.invite.mockImplementation(async (input: InviteUserInput) => ({
    invitationId: '33333333-3333-4333-8333-333333333333', email: input.email,
    invitationSent: true, emailDelivery: 'sent', expiresAt: '2026-12-01T12:00:00.000Z',
  }));
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Unexpected HTTP')));
});
afterEach(async () => {
  const httpCalls = vi.mocked(fetch).mock.calls.length;
  process.exitCode = previousExitCode;
  vi.restoreAllMocks();
  syncBuiltinESMExports();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await removeEmptyHome(root);
  expect(httpCalls).toBe(0);
});

describe('atomic local preflight', () => {
  it.each([
    ['later invalid address', 'alice@example.com\nSENSITIVE_MARKER'],
    ['interior BOM', 'alice@example.com\nbob\uFEFF@example.com'],
    ['interior carriage return', 'alice@example.com\nbob@example.com\rcarol@example.com'],
    ['blank only', ' \r\n\t\n'],
    ['too many unique recipients', Array.from({ length: 1001 }, (_, index) => `person${index}@example.com`).join('\n')],
  ])('should reject %s without sending an earlier valid row', async (_name, content) => {
    await writeFile(path, content);
    await expectLocal();
  });

  it('should reject invalid UTF-8 before the SDK factory is created', async () => {
    await writeFile(path, Buffer.concat([Buffer.from('alice@example.com\n'), Buffer.from([0xc3, 0x28])]));
    await expectLocal();
  });

  it('should reject oversized raw bytes before the SDK factory is created', async () => {
    await writeFile(path, 'alice@example.com\n' + ' '.repeat(1_048_576));
    await expectLocal();
  });

  it.each(['missing', 'directory'])('should reject the %s file with no path disclosure', async (kind) => {
    path = kind === 'directory' ? root : join(root, `${marker}-missing.txt`);
    await expectLocal();
  });

  it('should classify an external unreadable-file fault before constructing a client', async () => {
    vi.spyOn(fs, 'open').mockRejectedValue(Object.assign(new Error(path), { code: 'EACCES' }));
    syncBuiltinESMExports();
    await expectLocal();
  });

  it('should reject a malformed organization UUID locally', async () => { await expectLocal([], marker); });

  it.each([
    ['role without separators', ['--role', marker]],
    ['role with malformed application', ['--role', `invalid:${org}`]],
    ['role with malformed role', ['--role', `${org}:invalid`]],
    ['claim without separators', ['--claim', marker]],
    ['claim with invalid application', ['--claim', `invalid:${claimDefinitionId}:null`]],
    ['claim with invalid definition', ['--claim', `${applicationId}:invalid:null`]],
    ['claim with empty JSON', ['--claim', claim('')]],
    ['claim with malformed JSON', ['--claim', claim(`{"${marker}":`)]],
    ['claim with non-finite JSON', ['--claim', claim('{"nested":[1e309]}')]],
    ['duplicate claim pair', ['--claim', claim('null'), '--claim', `${applicationId.toUpperCase()}:${claimDefinitionId.toUpperCase()}:false`]],
    ['long locale', ['--locale', 'a'.repeat(11)]],
    ['long personal message', ['--personal-message', 'a'.repeat(501)]],
    ['explicit empty claim', ['--claim', '']],
    ['non-string negated claim', ['--no-claim']],
  ] as const)('should classify %s as bounded local validation without changing legacy commands', async (_name, flags) => {
    await expectLocal(flags);
  });

  it('should classify finite but unencodable complete requests locally before any client creation', async () => {
    await expectLocal(['--claim', claim(encodingCounterexample())]);
  });

  it('should traverse deeply nested non-finite values without an unclassified recursion failure', async () => {
    const raw = encodingCounterexample().replace('0', '1e309');
    await expectLocal(['--claim', claim(raw)]);
  });

  it('should forward repeated shared options exactly once per recipient without an extra catalogue call', async () => {
    const raw = `{"url":"https://example.test:a","__proto__":{"${marker}":true}}`;
    const claims: NonNullable<InviteUserInput['claims']> = [
      { applicationId, claimDefinitionId, value: JSON.parse(raw) },
      { applicationId: org, claimDefinitionId, value: false },
    ];
    expect(await run([
      '--role', `${applicationId}:${org}`, '--role', `${org}:${claimDefinitionId}`,
      '--claim', claim(raw), '--claim', `${org}:${claimDefinitionId}:false`,
      '--locale', ' nl ', '--personal-message', 'Welcome',
    ])).toBe(0);
    expect(boundary.createClient).toHaveBeenCalledOnce();
    expect(boundary.invite.mock.calls).toStrictEqual(['alice@example.com', 'bob@example.com'].map((email) => [{
      organizationId: org, email,
      roles: [{ applicationId, roleId: org }, { applicationId: org, roleId: claimDefinitionId }],
      claims, locale: 'nl', personalMessage: 'Welcome',
    }]));
    expect(Object.getOwnPropertyDescriptor(Object.prototype, marker)).toBeUndefined();
    expect(`${output.stdout}${output.stderr}`).not.toContain(marker);
    expect(output.stderr).toBe('');
  });
});

describe('real option cardinality and required flags', () => {
  it.each([
    ['file missing', ['bulk', 'invite', '--org', org]],
    ['org missing', ['bulk', 'invite', '--file', 'SENSITIVE_MARKER.txt']],
    ['bare claim', ['bulk', 'invite', '--file', 'SENSITIVE_MARKER.txt', '--org', org, '--claim']],
    ['trailing bare claim', ['bulk', 'invite', '--file', 'SENSITIVE_MARKER.txt', '--org', org, '--claim', claim('null'), '--claim']],
  ])('should return only the parser error from the actual executable when %s', async (_name, args) => {
    const result = await runExecutable([...args, '--json', '--verbose']);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expectErrorEnvelope(result.stderr, argument);
  });

  it.each([['--claim'], ['--claim', claim('null'), '--claim']])
    ('should reject missing claim values %j before client creation', async (...flags) => {
      const { createCli } = await import('../../src/cli.js');
      await expect(async () => createCli(['bulk', 'invite', '--file', path, '--org', org, ...flags, '--json']).parseAsync())
        .rejects.toBeInstanceOf(Error);
      expect(boundary.createClient).not.toHaveBeenCalled();
      expect(boundary.invite).not.toHaveBeenCalled();
    });

  it.each([['--claim', ''], ['--no-claim']])
    ('should return local validation from the actual executable for %j', async (...flags) => {
      const result = await runExecutable(['bulk', 'invite', '--file', path, '--org', org, ...flags, '--json']);
      expect(result.status).toBe(3);
      expect(result.stdout).toBe('');
      expectErrorEnvelope(result.stderr, invalid);
    });
});

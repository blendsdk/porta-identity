/** Claim input is validated before dispatch, without changing invitation results or leaking values. */
import type { InviteUserInput, InviteUserResult } from '@portaidentity/sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  captureCommandOutput,
  CommandExit,
  createEmptyHome,
  expectErrorEnvelope,
  removeEmptyHome,
  runExecutable,
} from '../helpers/json-error-contract.js';

const boundary = vi.hoisted(() => ({ createClient: vi.fn(), invite: vi.fn() }));
vi.mock('../../src/client-factory.js', () => ({ createClient: boundary.createClient }));

const applicationId = 'abcdefab-1234-4123-8123-abcdefabcdef';
const claimDefinitionId = 'fedcbafe-4321-4321-8321-fedcbafedcba';
const organizationId = '11111111-1111-4111-8111-111111111111';
const email = 'invited@example.com';
const marker = 'SENSITIVE_MARKER';
const request = { organizationId, email };
const prefix = ['user', 'invite', '--org', organizationId, '--email', email];
const invalidInput = { code: 'VALIDATION_ERROR', message: 'The command input is invalid.' };
const argumentError = { code: 'ARGUMENT_ERROR', message: 'Invalid command arguments.' };
const invitation: InviteUserResult = {
  invitationId: '33333333-3333-4333-8333-333333333333',
  email,
  invitationSent: true,
  emailDelivery: 'sent',
  expiresAt: '2026-12-01T12:00:00.000Z',
};
let home: string;
let output: ReturnType<typeof captureCommandOutput>;
let priorExitCode: typeof process.exitCode;

/** Keep each assignment intact so colons inside the JSON remainder stay data. */
function assignment(raw: string, claimId = claimDefinitionId): string {
  return `${applicationId}:${claimId}:${raw}`;
}

/** Observe the real parser, handler and formatter; only deliberate process exits are intercepted. */
async function run(extra: readonly string[], json = true): Promise<number> {
  const { createCli } = await import('../../src/cli.js');
  try {
    await createCli([...prefix, ...extra, ...(json ? ['--json'] : [])]).parseAsync();
  } catch (error) {
    if (!(error instanceof CommandExit)) throw error;
  }
  const exits = vi.mocked(process.exit).mock.calls;
  expect(exits.length).toBeLessThanOrEqual(1);
  return Number(exits[0]?.[0] ?? process.exitCode ?? 0);
}

/** Local rejection must be atomic and emit one fixed diagnostic, including with verbose enabled. */
async function expectLocalRejection(extra: readonly string[]): Promise<void> {
  expect(await run([...extra, '--verbose'])).toBe(3);
  expectErrorEnvelope(output.stderr, invalidInput);
  expect(output.stdout).toBe('');
  expect(boundary.createClient).not.toHaveBeenCalled();
  expect(boundary.invite).not.toHaveBeenCalled();
}

/** Find a finite JSON value that this runtime parses but cannot encode inside the complete body. */
function qualifyEncodingFailure(): { raw: string; encodableRaw: string; input: InviteUserInput } {
  let encodableRaw = '0';
  for (let depth = 1000; depth <= 32_000; depth *= 2) {
    const raw = `${'['.repeat(depth)}0${']'.repeat(depth)}`;
    const value: unknown = JSON.parse(raw);
    const input: InviteUserInput = {
      ...request,
      claims: [{ applicationId, claimDefinitionId, value }],
    };
    try {
      JSON.stringify(input);
      encodableRaw = raw;
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      return { raw, input, encodableRaw };
    }
  }
  throw new Error('This runtime did not qualify a complete-request encoding counterexample');
}

beforeEach(async () => {
  vi.resetAllMocks();
  home = await createEmptyHome();
  vi.stubEnv('HOME', home);
  vi.stubEnv('XDG_CONFIG_HOME', home);
  vi.stubEnv('PORTA_SERVER', 'https://porta.example.test');
  priorExitCode = process.exitCode;
  process.exitCode = undefined;
  output = captureCommandOutput();
  boundary.createClient.mockReturnValue({ users: { invite: boundary.invite } });
  boundary.invite.mockResolvedValue(invitation);
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Unexpected HTTP request')));
});
afterEach(async () => {
  const fetchCalls = vi.mocked(fetch).mock.calls.length;
  process.exitCode = priorExitCode;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await removeEmptyHome(home);
  expect(fetchCalls).toBe(0);
});

describe('ordered claim payloads', () => {
  it('should omit claims for undefined or empty helper input', async () => {
    const { parseClaimAssignments } = await import('../../src/parsers.js');
    expect(parseClaimAssignments()).toBeUndefined();
    expect(parseClaimAssignments([])).toBeUndefined();
  });

  it('should preserve the existing payload and result when claims are absent', async () => {
    expect(await run([])).toBe(0);
    expect(boundary.invite).toHaveBeenCalledExactlyOnceWith(request);
    expect(JSON.parse(output.stdout)).toStrictEqual(invitation);
    expect(output.stderr).toBe('');
  });

  it('should retain UUID case, split only two colons and distinguish application pairs', async () => {
    const { parseClaimAssignments } = await import('../../src/parsers.js');
    const claims = parseClaimAssignments([
      ` ${applicationId.toUpperCase()} : ${claimDefinitionId.toUpperCase()} :"a:b:c"`,
      `${organizationId}:${claimDefinitionId}:false`,
    ]);
    expect(claims).toStrictEqual([
      {
        applicationId: applicationId.toUpperCase(),
        claimDefinitionId: claimDefinitionId.toUpperCase(),
        value: 'a:b:c',
      },
      { applicationId: organizationId, claimDefinitionId, value: false },
    ]);
  });

  it('should forward all JSON kinds in flag order with existing roles, locale and message', async () => {
    const rawValues = [
      '"Engineering:West"', '{"url":"https://example.test:a"}', '[1,false,null]',
      '0', 'false', 'null',
    ];
    const claims = rawValues.map((raw, index) => ({
      applicationId,
      claimDefinitionId: `22222222-2222-4222-8222-${String(index).padStart(12, '0')}`,
      value: JSON.parse(raw),
    }));
    const flags = claims.flatMap((claim, index) => [
      '--claim', assignment(rawValues[index]!, claim.claimDefinitionId),
    ]);
    expect(await run([
      '--role', `${applicationId}:${organizationId}`, '--locale', 'nl',
      '--personal-message', 'Welcome', ...flags,
    ])).toBe(0);
    expect(boundary.createClient).toHaveBeenCalledOnce();
    expect(boundary.invite).toHaveBeenCalledExactlyOnceWith({
      ...request, roles: [{ applicationId, roleId: organizationId }],
      locale: 'nl', personalMessage: 'Welcome', claims,
    });
    expect(JSON.parse(output.stdout)).toStrictEqual(invitation);
    expect(output.stderr).toBe('');
  });

  it('should keep prototype and configuration-like keys as inert nested claim data', async () => {
    const raw = `{"__proto__":{"${marker}":true},"auth":{"token":"${marker}"},"json":false}`;
    expect(await run(['--claim', assignment(raw)])).toBe(0);
    expect(boundary.invite).toHaveBeenCalledExactlyOnceWith({
      ...request, claims: [{ applicationId, claimDefinitionId, value: JSON.parse(raw) }],
    });
    expect(Object.getOwnPropertyDescriptor(Object.prototype, marker)).toBeUndefined();
    expect(JSON.parse(output.stdout)).toStrictEqual(invitation);
    expect(`${output.stdout}${output.stderr}`).not.toContain(marker);
  });
});

describe('atomic claim rejection', () => {
  it.each([
    ['no separators', marker], ['one separator', `${applicationId}:${marker}`],
    ['invalid application UUID', `invalid:${claimDefinitionId}:null`],
    ['invalid claim UUID', `${applicationId}:invalid:null`],
    ['empty application UUID', `:${claimDefinitionId}:null`],
    ['empty claim UUID', `${applicationId}::null`],
    ['empty JSON', assignment('')], ['whitespace JSON', assignment('   ')],
    ['malformed JSON', assignment(`{"value":"${marker}"`)],
    ['trailing JSON data', assignment(`null ${marker}`)],
    ['non-finite number', assignment('1e309')],
    ['nested non-finite object', assignment('{"nested":[{"value":-1e309}]}')],
    ['nested non-finite array', assignment('[[1e309]]')],
  ])('should reject %s before client creation without raw diagnostics', async (_name, value) => {
    await expectLocalRejection(['--claim', assignment('true', organizationId), '--claim', value]);
  });

  it.each([
    ['identical pair and value', assignment('0')],
    ['identical pair with different value', assignment('false')],
    ['case-insensitive pair', `${applicationId.toUpperCase()}:${claimDefinitionId.toUpperCase()}:0`],
  ])('should reject %s without sending the earlier valid assignment', async (_name, duplicate) => {
    await expectLocalRejection(['--claim', assignment('0'), '--claim', duplicate]);
  });

  it('should identify the option and one-based position without echoing human claim values', async () => {
    expect(await run([
      '--claim', assignment('true'), '--claim', assignment(`{"${marker}":`),
    ], false)).toBe(3);
    expect(output.stdout).toBe('');
    expect(output.stderr).toMatch(/--claim/);
    expect(output.stderr).toMatch(/\b2\b/);
    expect(output.stderr).not.toContain(marker);
    expect(output.stderr).not.toMatch(/\n\s+at /);
    expect(boundary.createClient).not.toHaveBeenCalled();
    expect(boundary.invite).not.toHaveBeenCalled();
  });
});

describe('claim option cardinality', () => {
  it.each([
    ['bare flag', ['--claim'], 1, argumentError],
    ['trailing bare flag', ['--claim', assignment('null'), '--claim'], 1, argumentError],
    ['explicit empty string', ['--claim', ''], 3, invalidInput],
    ['negated flag', ['--no-claim'], 3, invalidInput],
  ] as const)('should reject %s through the actual executable', async (_name, flags, status, envelope) => {
    const result = await runExecutable([...prefix, ...flags, '--json', '--verbose']);
    expect(result.status).toBe(status);
    expect(result.stdout).toBe('');
    expectErrorEnvelope(result.stderr, envelope);
  });

  it.each([
    { label: 'bare', flags: ['--claim'] },
    { label: 'trailing', flags: ['--claim', assignment('null'), '--claim'] },
  ])(
    'should reject $label missing claim values before client creation', async ({ flags }) => {
      const { createCli } = await import('../../src/cli.js');
      await expect(async () => {
        await createCli([...prefix, ...flags, '--json']).parseAsync();
      }).rejects.toBeInstanceOf(Error);
      expect(boundary.createClient).not.toHaveBeenCalled();
      expect(boundary.invite).not.toHaveBeenCalled();
    },
  );

  it.each([['--claim', ''], ['--no-claim']])(
    'should reject local option %j before client creation', async (...flags) => {
      await expectLocalRejection(flags);
    },
  );
});

describe('complete invitation encoding', () => {
  it('should accept runtime-qualified encodable nesting without returning serialized text', async () => {
    const { encodableRaw } = qualifyEncodingFailure();
    const value: unknown = JSON.parse(encodableRaw);
    const { validateInvitationEncoding } = await import('../../src/parsers.js');
    expect(validateInvitationEncoding({
      ...request, claims: [{ applicationId, claimDefinitionId, value }],
    })).toBeUndefined();
    expect(await run(['--claim', assignment(encodableRaw)])).toBe(0);
    expect(boundary.invite).toHaveBeenCalledOnce();
    expect(output.stderr).toBe('');
  });

  it('should reject a runtime-qualified complete-body encoding failure before client creation', async () => {
    const { raw, input } = qualifyEncodingFailure();
    const { validateInvitationEncoding } = await import('../../src/parsers.js');
    expect(typeof validateInvitationEncoding).toBe('function');
    expect(() => JSON.stringify(input)).toThrow(RangeError);
    expect(() => validateInvitationEncoding(input)).toThrow();
    await expectLocalRejection(['--claim', assignment(raw)]);
  });

  it('should classify deeply nested non-finite input locally without a traversal stack failure', async () => {
    const { raw } = qualifyEncodingFailure();
    await expectLocalRejection(['--claim', assignment(raw.replace('0', '1e309'))]);
  });
});

describe('unchanged deferred invitation results', () => {
  it.each(['sent', 'failed', 'unknown'] as const)(
    'should preserve JSON and human presentation and exit behaviour for %s delivery', async (emailDelivery) => {
      const result = { ...invitation, emailDelivery, invitationSent: emailDelivery === 'sent' };
      boundary.invite.mockResolvedValue(result);
      for (const json of [true, false]) {
        const baselineExit = await run([], json);
        const baseline = { ...output };
        output.stdout = '';
        output.stderr = '';
        vi.mocked(process.exit).mockClear();
        process.exitCode = undefined;
        expect(await run(['--claim', assignment('null')], json)).toBe(baselineExit);
        expect(output).toStrictEqual(baseline);
        if (json) expect(JSON.parse(output.stdout)).toStrictEqual(result);
        output.stdout = '';
        output.stderr = '';
        vi.mocked(process.exit).mockClear();
        process.exitCode = undefined;
      }
    },
  );
});

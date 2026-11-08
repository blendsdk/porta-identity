/**
 * Public CLI contract for service-account bindings managed by a human administrator.
 *
 * The tests use the real command registration, yargs parsing, output helpers and error
 * handler. Only the SDK factory and the interactive prompt are replaced, which makes the
 * exact SDK request observable and proves that a mutation needs no extra confirmation.
 */

import { readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  PortaAuthenticationError,
  PortaConflictError,
  PortaForbiddenError,
  PortaRateLimitError,
  PortaServerError,
} from '@portaidentity/sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CliArgumentError } from '../../src/error-format.js';
import { confirm, question } from '../../src/prompt.js';
import {
  captureCommandOutput,
  CommandExit,
  createEmptyHome,
  expectErrorEnvelope,
  removeEmptyHome,
} from '../helpers/json-error-contract.js';

const { mockCreateClient } = vi.hoisted(() => ({ mockCreateClient: vi.fn() }));

/**
 * Independent SDK spies. The absence of a call is meaningful evidence: no preflight read,
 * no second mutation and no retry may hide behind another client method.
 */
const mockClients = {
  get: vi.fn(),
  list: vi.fn(),
  getServiceAccount: vi.fn(),
  setServiceAccount: vi.fn(),
  revokeServiceAccount: vi.fn(),
};

vi.mock('../../src/client-factory.js', () => ({ createClient: mockCreateClient }));
vi.mock('../../src/prompt.js', () => ({ confirm: vi.fn(), question: vi.fn() }));

const clientUuid = '11111111-1111-4111-8111-111111111111';
const bindingId = '22222222-2222-4222-8222-222222222222';
const serviceAccountId = '33333333-3333-4333-8333-333333333333';
const organizationId = '44444444-4444-4444-8444-444444444444';
const applicationId = '55555555-5555-4555-8555-555555555555';
const roleId = '66666666-6666-4666-8666-666666666666';
const claimDefinitionId = '77777777-7777-4777-8777-777777777777';
const requestId = '88888888-8888-4888-8888-888888888888';
const marker = 'SENSITIVE_MARKER';

/** One representative policy target; both assignment arrays are always present. */
const target = {
  organizationId,
  allowedRoles: [{ applicationId, roleId }],
  allowedClaimDefinitions: [{ applicationId, claimDefinitionId }],
};

/** The secret-free projection a successful SDK call returns. */
const binding = {
  id: bindingId,
  clientId: clientUuid,
  serviceAccountId,
  accountEmail: 'service.account@example.test',
  status: 'active',
  targets: [target],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
};

/** An ordinary client used only to prove the pre-existing commands did not change. */
const ordinaryClient = {
  id: clientUuid,
  organizationId,
  applicationId,
  clientId: 'porta_ordinary_client',
  clientName: 'Ordinary Client',
  clientType: 'confidential',
  applicationType: 'web',
  status: 'active',
  redirectUris: ['https://example.test/callback'],
  postLogoutRedirectUris: [],
  grantTypes: ['authorization_code'],
  responseTypes: ['code'],
  scope: 'openid profile',
  tokenEndpointAuthMethod: 'client_secret_post',
  allowedOrigins: ['https://example.test'],
  requirePkce: true,
  requireConsent: true,
  loginMethods: null,
  effectiveLoginMethods: ['password'],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
};

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

/** Write one owned policy document and return its absolute path. */
async function writePolicy(name: string, document: unknown): Promise<string> {
  const path = join(home, name);
  await writeFile(path, JSON.stringify(document), 'utf8');
  return path;
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

describe('direct service-account set', () => {
  it('sends one set request with the parsed policy and nothing else', async () => {
    const policyPath = await writePolicy('policy.json', { targets: [target] });
    mockClients.setServiceAccount.mockResolvedValue(binding);

    expect(
      await runClient(['service-account', 'set', clientUuid, '--policy-file', policyPath]),
    ).toBe(0);

    expect(mockCreateClient).toHaveBeenCalledOnce();
    expect(mockClients.setServiceAccount).toHaveBeenCalledExactlyOnceWith(clientUuid, {
      targets: [target],
    });
    expect(mockClients.getServiceAccount).not.toHaveBeenCalled();
    expect(mockClients.get).not.toHaveBeenCalled();
    expect(mockClients.list).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
    expect(question).not.toHaveBeenCalled();
    // No credential or mutation report may be persisted in the operator's home.
    expect(await readdir(home)).toStrictEqual(['policy.json']);
  });

  it('adds the optional account email to the same request', async () => {
    const policyPath = await writePolicy('policy.json', { targets: [target] });
    mockClients.setServiceAccount.mockResolvedValue(binding);

    expect(
      await runClient([
        'service-account',
        'set',
        clientUuid,
        '--policy-file',
        policyPath,
        '--email',
        'operator@example.test',
      ]),
    ).toBe(0);

    expect(mockClients.setServiceAccount).toHaveBeenCalledExactlyOnceWith(clientUuid, {
      targets: [target],
      accountEmail: 'operator@example.test',
    });
  });

  it('does not read or retry when the one mutation fails', async () => {
    const policyPath = await writePolicy('policy.json', { targets: [target] });
    mockClients.setServiceAccount.mockRejectedValue(new PortaServerError(503));

    expect(
      await runClient(['service-account', 'set', clientUuid, '--policy-file', policyPath, '--json']),
    ).toBe(1);

    expect(mockClients.setServiceAccount).toHaveBeenCalledTimes(1);
    expect(mockClients.getServiceAccount).not.toHaveBeenCalled();
    expect(mockClients.get).not.toHaveBeenCalled();
    expect(mockClients.list).not.toHaveBeenCalled();
    expectErrorEnvelope(output.stderr, {
      code: 'SERVER_ERROR',
      message: 'The server could not complete the request.',
      status: 503,
    });
  });
});

describe('machine-readable results', () => {
  it('prints the unwrapped binding for get without secrets or version fields', async () => {
    mockClients.getServiceAccount.mockResolvedValue(binding);

    expect(await runClient(['service-account', 'get', clientUuid, '--json'])).toBe(0);

    expect(mockCreateClient).toHaveBeenCalledOnce();
    expect(mockClients.getServiceAccount).toHaveBeenCalledExactlyOnceWith(clientUuid);
    expect(JSON.parse(output.stdout)).toStrictEqual(binding);
    expect(output.stdout).not.toContain('authorizationVersion');
    expect(output.stdout).not.toContain('authorization_version');
    expect(output.stdout).not.toContain('plaintext');
  });

  it('prints the unwrapped binding for set without secrets or version fields', async () => {
    const policyPath = await writePolicy('policy.json', { targets: [target] });
    mockClients.setServiceAccount.mockResolvedValue(binding);

    expect(
      await runClient(['service-account', 'set', clientUuid, '--policy-file', policyPath, '--json']),
    ).toBe(0);

    expect(JSON.parse(output.stdout)).toStrictEqual(binding);
    expect(output.stdout).not.toContain('authorizationVersion');
    expect(output.stdout).not.toContain('authorization_version');
    expect(output.stdout).not.toContain('plaintext');
  });

  it('prints the same exact confirmation for an initial and a repeated revoke', async () => {
    mockClients.revokeServiceAccount.mockResolvedValue(undefined);

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      output.stdout = '';
      output.stderr = '';
      expect(await runClient(['service-account', 'revoke', clientUuid, '--json'])).toBe(0);
      expect(JSON.parse(output.stdout)).toStrictEqual({
        clientId: clientUuid,
        status: 'revoked',
      });
      expect(output.stderr).toBe('');
    }

    expect(mockClients.revokeServiceAccount).toHaveBeenCalledTimes(2);
    expect(mockCreateClient).toHaveBeenCalledTimes(2);
    expect(mockClients.getServiceAccount).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
    expect(question).not.toHaveBeenCalled();
  });
});

describe('human presentation safety', () => {
  it('keeps a long label intact and replaces controls only in human output', async () => {
    const longHostileEmail = `${'a'.repeat(160)}\u001b[31m\u202e@example.test`;
    const hostileBinding = { ...binding, accountEmail: longHostileEmail };
    mockClients.getServiceAccount.mockResolvedValue(hostileBinding);

    expect(await runClient(['service-account', 'get', clientUuid])).toBe(0);
    const human = plain(output.stdout);
    expect(human).toContain(`${'a'.repeat(160)}\ufffd[31m\ufffd@example.test`);
    expect(human).toContain(organizationId);
    expect(human).not.toContain('\u001b');
    expect(human).not.toContain('\u202e');
    expect(human).not.toContain('authorizationVersion');
    expect(human).not.toContain('plaintext');

    const lines = human.split('\n');
    // One long value must not be padded or wrapped into an amplified block.
    expect(Math.max(...lines.map((line) => line.length))).toBeLessThan(
      longHostileEmail.length + 240,
    );
    expect(lines.length).toBeLessThan(40);

    output.stdout = '';
    expect(await runClient(['service-account', 'get', clientUuid, '--json'])).toBe(0);
    expect(JSON.parse(output.stdout)).toStrictEqual(hostileBinding);
    expect(output.stdout).not.toContain('\u001b');
    expect(output.stdout).toContain('\\u001b');
  });

  it('keeps human set and revoke summaries free of controls and version fields', async () => {
    const policyPath = await writePolicy('policy.json', { targets: [target] });
    mockClients.setServiceAccount.mockResolvedValue(binding);

    expect(
      await runClient(['service-account', 'set', clientUuid, '--policy-file', policyPath]),
    ).toBe(0);
    const setText = plain(output.stdout);
    expect(setText.trim()).not.toBe('');
    expect(setText).not.toContain('\u001b');
    expect(setText).not.toContain('authorizationVersion');

    output.stdout = '';
    mockClients.revokeServiceAccount.mockResolvedValue(undefined);
    expect(await runClient(['service-account', 'revoke', clientUuid])).toBe(0);
    const revokeText = plain(output.stdout);
    expect(revokeText.trim()).not.toBe('');
    expect(revokeText).not.toContain('\u001b');
  });
});

describe('existing error classifications', () => {
  const failureCases = [
    {
      name: 'authentication',
      create: () => new PortaAuthenticationError({ error: marker }),
      envelope: { code: 'AUTHENTICATION_REQUIRED', message: 'Authentication is required.' },
      exit: 2,
    },
    {
      name: 'permission',
      create: () => new PortaForbiddenError({ error: marker }),
      envelope: { code: 'FORBIDDEN', message: 'This operation is not permitted.', status: 403 },
      exit: 2,
    },
    {
      name: 'conflict',
      create: () => new PortaConflictError({ error: marker }),
      envelope: {
        code: 'CONFLICT',
        message: 'The request conflicts with existing state.',
        status: 409,
      },
      exit: 1,
    },
    {
      name: 'dependency outage',
      create: () => new PortaServerError(503, { request_id: requestId, error: marker }),
      envelope: {
        code: 'SERVER_ERROR',
        message: 'The server could not complete the request.',
        status: 503,
        requestId,
      },
      exit: 1,
    },
    {
      name: 'rate limit',
      create: () => new PortaRateLimitError({ error: marker }, 30),
      envelope: {
        code: 'RATE_LIMITED',
        message: 'The request was rate limited.',
        status: 429,
        retryAfter: 30,
      },
      exit: 1,
    },
  ] as const;

  it.each(failureCases)(
    'preserves the $name classification, exit and verbose JSON redaction',
    async ({ create, envelope, exit }) => {
      mockClients.getServiceAccount.mockRejectedValue(create());

      expect(
        await runClient(['service-account', 'get', clientUuid, '--json', '--verbose']),
      ).toBe(exit);

      expect(output.stdout).toBe('');
      expectErrorEnvelope(output.stderr, envelope);
      expect(output.stderr).not.toContain(marker);
      expect(output.stderr).not.toContain('Stack trace');
    },
  );

  it('keeps the human permission failure text and exit', async () => {
    mockClients.getServiceAccount.mockRejectedValue(new PortaForbiddenError());

    expect(await runClient(['service-account', 'get', clientUuid])).toBe(2);

    const text = plain(output.stderr);
    expect(text).toContain('Access denied:');
    expect(text).toContain('required permissions');
    expect(output.stdout).toBe('');
    expect(text).not.toContain('Stack trace');
  });
});

describe('unchanged ordinary client commands', () => {
  it('keeps client get and client list on their existing SDK methods', async () => {
    mockClients.get.mockResolvedValue({ data: ordinaryClient, etag: 'etag-1' });

    expect(await runClient(['get', clientUuid, '--json'])).toBe(0);
    expect(mockClients.get).toHaveBeenCalledExactlyOnceWith(clientUuid);
    expect(JSON.parse(output.stdout)).toStrictEqual(ordinaryClient);
    expect(mockClients.getServiceAccount).not.toHaveBeenCalled();

    output.stdout = '';
    const page = { data: [ordinaryClient], total: 1, page: 1, pageSize: 20 };
    mockClients.list.mockResolvedValue(page);

    expect(await runClient(['list', '--app', applicationId, '--json'])).toBe(0);
    expect(JSON.parse(output.stdout)).toStrictEqual(page);
    expect(mockClients.getServiceAccount).not.toHaveBeenCalled();
  });
});

describe('public help', () => {
  it('advertises the namespace, its commands and the set options', async () => {
    expect(await runClient(['--help'])).toBe(0);
    expect(plain(output.stdout)).toContain('service-account');

    output.stdout = '';
    expect(await runClient(['service-account', '--help'])).toBe(0);
    const groupHelp = plain(output.stdout);
    for (const command of ['get', 'set', 'revoke']) expect(groupHelp).toContain(command);

    output.stdout = '';
    expect(await runClient(['service-account', 'set', '--help'])).toBe(0);
    const setHelp = plain(output.stdout);
    expect(setHelp).toContain('policy-file');
    expect(setHelp).toContain('email');
  });
});

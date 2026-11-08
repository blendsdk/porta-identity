/** Normal bulk completion emits one closed report, preserves delivery distinctions and exits once. */
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PortaAuthenticationError, PortaConflictError, PortaRateLimitError, PortaServerError } from '@portaidentity/sdk';
import type { InviteUserInput, InviteUserResult } from '@portaidentity/sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  captureCommandOutput, CommandExit, createEmptyHome, expectErrorEnvelope, removeEmptyHome,
} from '../helpers/json-error-contract.js';

const boundary = vi.hoisted(() => ({ createClient: vi.fn(), invite: vi.fn() }));
vi.mock('../../src/client-factory.js', () => ({ createClient: boundary.createClient }));

const org = '11111111-1111-4111-8111-111111111111';
const requestId = '22222222-2222-4222-8222-222222222222';
const marker = 'SENSITIVE_MARKER';
const incomplete = { code: 'BATCH_INCOMPLETE', message: 'The operation did not complete successfully.' };
let root: string;
let path: string;
let output: ReturnType<typeof captureCommandOutput>;
let previousExitCode: typeof process.exitCode;

/** Produce the existing public result, with delivery independent of creation acknowledgement. */
function acknowledged(input: InviteUserInput, emailDelivery: InviteUserResult['emailDelivery'] = 'sent'): InviteUserResult {
  return {
    invitationId: '33333333-3333-4333-8333-333333333333', email: input.email,
    invitationSent: emailDelivery === 'sent', emailDelivery, expiresAt: '2026-12-01T12:00:00.000Z',
  };
}

/** Only the external SDK factory and process termination are replaced; parser and formatting stay real. */
async function run(flags: readonly string[] = [], json = true): Promise<number> {
  const { createCli } = await import('../../src/cli.js');
  try {
    await createCli(['bulk', 'invite', '--file', path, '--org', org, ...flags, ...(json ? ['--json'] : [])]).parseAsync();
  } catch (error) {
    if (!(error instanceof CommandExit)) throw error;
  }
  const exits = vi.mocked(process.exit).mock.calls;
  expect(exits.length).toBeLessThanOrEqual(1);
  return Number(exits[0]?.[0] ?? process.exitCode ?? 0);
}

beforeEach(async () => {
  vi.resetAllMocks();
  root = await createEmptyHome();
  path = join(root, 'SENSITIVE_MARKER-recipients.txt');
  await writeFile(path, 'Alice@example.com\n\nalice@EXAMPLE.com\nbob@example.com');
  vi.stubEnv('HOME', root);
  vi.stubEnv('XDG_CONFIG_HOME', root);
  vi.stubEnv('PORTA_SERVER', 'https://porta.example.test');
  previousExitCode = process.exitCode;
  process.exitCode = undefined;
  output = captureCommandOutput();
  boundary.createClient.mockReturnValue({ users: { invite: boundary.invite } });
  boundary.invite.mockImplementation(async (input: InviteUserInput) => acknowledged(input));
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Unexpected real HTTP')));
});
afterEach(async () => {
  const httpCalls = vi.mocked(fetch).mock.calls.length;
  process.exitCode = previousExitCode;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await removeEmptyHome(root);
  expect(httpCalls).toBe(0);
});

describe('one final JSON report', () => {
  it('should send once per unique address and return an exact all-sent report with exit zero', async () => {
    expect(await run()).toBe(0);
    expect(JSON.parse(output.stdout)).toStrictEqual({
      summary: {
        inputRecords: 3, uniqueRecipients: 2, duplicates: 1, attempted: 2,
        created: 2, sent: 2, deliveryFailed: 0, deliveryUnknown: 0, rejected: 0, unknown: 0, unattempted: 0,
      },
      results: [
        { line: 1, email: 'Alice@example.com', outcome: 'created', invitation: acknowledged({ organizationId: org, email: 'Alice@example.com' }) },
        { line: 4, email: 'bob@example.com', outcome: 'created', invitation: acknowledged({ organizationId: org, email: 'bob@example.com' }) },
      ],
      stopReason: null,
    });
    expect(output.stderr).toBe('');
    expect(boundary.createClient).toHaveBeenCalledOnce();
    expect(boundary.invite.mock.calls).toStrictEqual([
      [{ organizationId: org, email: 'Alice@example.com' }], [{ organizationId: org, email: 'bob@example.com' }],
    ]);
    expect(`${output.stdout}${output.stderr}`).not.toContain(marker);
  });

  it('should acknowledge all delivery states without resending or calling them uncertain creations', async () => {
    await writeFile(path, 'alice@example.com\nbob@example.com\ncarol@example.com');
    const deliveries = ['sent', 'failed', 'unknown'] as const;
    boundary.invite.mockImplementation(async (input: InviteUserInput) => {
      const index = ['alice@example.com', 'bob@example.com', 'carol@example.com'].indexOf(input.email);
      return acknowledged(input, deliveries[index]);
    });
    expect(await run()).toBe(1);
    const invitations = deliveries.map((delivery, index) => acknowledged({
      organizationId: org, email: ['alice@example.com', 'bob@example.com', 'carol@example.com'][index]!,
    }, delivery));
    expect(JSON.parse(output.stdout)).toStrictEqual({
      summary: {
        inputRecords: 3, uniqueRecipients: 3, duplicates: 0, attempted: 3,
        created: 3, sent: 1, deliveryFailed: 1, deliveryUnknown: 1, rejected: 0, unknown: 0, unattempted: 0,
      },
      results: invitations.map((invitation, index) => ({ line: index + 1, email: invitation.email, outcome: 'created', invitation })),
      stopReason: null,
    });
    expect(boundary.invite).toHaveBeenCalledTimes(3);
    expectErrorEnvelope(output.stderr, incomplete);
  });

  it.each([
    [new PortaServerError(503, { error: marker, request_id: requestId, details: marker }),
      { status: 503, requestId }, 1],
    [new PortaRateLimitError({ error: marker }, 30), { status: 429, retryAfter: 30 }, 1],
    [new PortaAuthenticationError({ error: marker }), {}, 2],
  ] as const)('should emit a single safe aggregate envelope for %s', async (error, metadata, exit) => {
    boundary.invite.mockRejectedValue(error);
    expect(await run(['--verbose', '--claim', `${org}:${requestId}:"${marker}"`])).toBe(exit);
    const report = JSON.parse(output.stdout);
    expect(Object.keys(report).sort()).toStrictEqual(['results', 'stopReason', 'summary']);
    expect(report.summary).toMatchObject({ attempted: 1, unattempted: 1, created: 0 });
    expect(report.results[1]).toStrictEqual({ line: 4, email: 'bob@example.com', outcome: 'unattempted' });
    expectErrorEnvelope(output.stderr, { ...incomplete, ...metadata });
    expect(boundary.invite).toHaveBeenCalledOnce();
    expect(`${output.stdout}${output.stderr}`).not.toContain(marker);
    expect(`${output.stdout}${output.stderr}`).not.toContain(path);
  });

  it('should give conflict-only incomplete output no invented stop metadata', async () => {
    boundary.invite.mockRejectedValueOnce(new PortaConflictError()).mockImplementation(async (input: InviteUserInput) => acknowledged(input));
    expect(await run()).toBe(1);
    expect(JSON.parse(output.stdout).stopReason).toBeNull();
    expectErrorEnvelope(output.stderr, incomplete);
    expect(boundary.invite).toHaveBeenCalledTimes(2);
  });

  it('should retain only public acknowledgement fields rather than arbitrary server extensions', async () => {
    boundary.invite.mockImplementation(async (input: InviteUserInput) => ({
      ...acknowledged(input), requestId: marker, emailError: marker, token: marker,
    }));
    expect(await run()).toBe(0);
    expect(JSON.parse(output.stdout).results[0].invitation).toStrictEqual(
      acknowledged({ organizationId: org, email: 'Alice@example.com' }),
    );
    expect(`${output.stdout}${output.stderr}`).not.toContain(marker);
  });
});

describe('client construction before any invitation', () => {
  it.each([
    [new PortaAuthenticationError({ error: marker }), 2, { code: 'AUTHENTICATION_REQUIRED', message: 'Authentication is required.' }],
    [new Error(marker), 1, { code: 'COMMAND_FAILED', message: 'The command failed.' }],
  ] as const)('should mark every recipient unattempted for %s', async (error, exit, reason) => {
    boundary.createClient.mockImplementation(() => { throw error; });
    expect(await run()).toBe(exit);
    expect(JSON.parse(output.stdout)).toStrictEqual({
      summary: {
        inputRecords: 3, uniqueRecipients: 2, duplicates: 1, attempted: 0,
        created: 0, sent: 0, deliveryFailed: 0, deliveryUnknown: 0, rejected: 0, unknown: 0, unattempted: 2,
      },
      results: [
        { line: 1, email: 'Alice@example.com', outcome: 'unattempted' },
        { line: 4, email: 'bob@example.com', outcome: 'unattempted' },
      ],
      stopReason: reason,
    });
    expect(boundary.createClient).toHaveBeenCalledOnce();
    expect(boundary.invite).not.toHaveBeenCalled();
    expectErrorEnvelope(output.stderr, incomplete);
    expect(`${output.stdout}${output.stderr}`).not.toContain(marker);
  });
});

describe('bounded ordered human output', () => {
  it('should show source order, delivery distinctions and counts without echoing shared claim data', async () => {
    await writeFile(path, 'alice@example.com\nbob@example.com\ncarol@example.com');
    const deliveries = ['sent', 'failed', 'unknown'] as const;
    let index = 0;
    boundary.invite.mockImplementation(async (input: InviteUserInput) => acknowledged(input, deliveries[index++]));
    expect(await run(['--claim', `${org}:${requestId}:"${marker}"`], false)).toBe(1);
    const human = `${output.stdout}${output.stderr}`;
    expect(human.indexOf('alice@example.com')).toBeLessThan(human.indexOf('bob@example.com'));
    expect(human.indexOf('bob@example.com')).toBeLessThan(human.indexOf('carol@example.com'));
    for (const term of ['line', 'email', 'outcome', 'created', 'sent', 'failed', 'unknown']) {
      expect(human.toLowerCase()).toContain(term);
    }
    expect(human).toMatch(/\b3\b/);
    expect(human).toMatch(/\b1\b/);
    expect(human).not.toContain(marker);
    expect(human).not.toContain(path);
    expect(human.length).toBeLessThan(10_000);
    expect(boundary.invite).toHaveBeenCalledTimes(3);
  });

  it('should bound stop text and discard raw external control sequences even with verbose enabled', async () => {
    boundary.invite.mockRejectedValue(new Error(`${marker}\u001b[31m\n${'x'.repeat(20_000)}`));
    expect(await run(['--verbose'], false)).toBe(1);
    const human = `${output.stdout}${output.stderr}`;
    expect(human).not.toContain(marker);
    expect(human).not.toContain('x'.repeat(100));
    expect(human.length).toBeLessThan(10_000);
    expect(human).toContain('Alice@example.com');
    expect(human).toContain('bob@example.com');
    expect(boundary.invite).toHaveBeenCalledOnce();
  });
});

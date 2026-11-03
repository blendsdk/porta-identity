/** Human reports retain complete recipient data without multiplying a long address across rows. */
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import type { InviteUserInput, InviteUserResult } from '@portaidentity/sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  captureCommandOutput,
  CommandExit,
  createEmptyHome,
  removeEmptyHome,
} from '../helpers/json-error-contract.js';

const boundary = vi.hoisted(() => ({
  createClient: vi.fn(),
  invite: vi.fn<(input: InviteUserInput) => Promise<InviteUserResult>>(),
}));
vi.mock('../../src/client-factory.js', () => ({ createClient: boundary.createClient }));

const organizationId = '11111111-1111-4111-8111-111111111111';
let home: string;
let output: ReturnType<typeof captureCommandOutput>;
let priorExitCode: typeof process.exitCode;

/** Exercise registration, parsing, dispatch and rendering, intercepting only deliberate exits. */
async function run(file: string): Promise<number> {
  const { createCli } = await import('../../src/cli.js');
  try {
    await createCli(['bulk', 'invite', '--file', file, '--org', organizationId]).parseAsync();
  } catch (error) {
    if (!(error instanceof CommandExit)) throw error;
  }
  const exits = vi.mocked(process.exit).mock.calls;
  expect(exits.length).toBeLessThanOrEqual(1);
  return Number(exits[0]?.[0] ?? process.exitCode ?? 0);
}

beforeEach(async () => {
  vi.resetAllMocks();
  home = await createEmptyHome();
  vi.stubEnv('HOME', home);
  vi.stubEnv('XDG_CONFIG_HOME', home);
  vi.stubEnv('PORTA_SERVER', 'https://porta.example.test');
  vi.stubEnv('NO_COLOR', '1');
  priorExitCode = process.exitCode;
  process.exitCode = undefined;
  output = captureCommandOutput();
  boundary.createClient.mockReturnValue({ users: { invite: boundary.invite } });
  boundary.invite.mockImplementation(async (input: InviteUserInput): Promise<InviteUserResult> => ({
    invitationId: '33333333-3333-4333-8333-333333333333',
    email: input.email,
    invitationSent: true,
    emailDelivery: 'sent',
    expiresAt: '2026-12-01T12:00:00.000Z',
  }));
});

afterEach(async () => {
  process.exitCode = priorExitCode;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await removeEmptyHome(home);
});

describe('bulk invitation human report size', () => {
  it('should preserve full ordered recipient rows and counts with output proportional to input', async () => {
    // The accepted ASCII grammar has no local-part length cap. Keep this counterexample small:
    // one long address and 99 short ones detect excessive padding without a large allocation.
    const emails = [
      `${'a'.repeat(4096)}@example.com`,
      ...Array.from({ length: 99 }, (_, index) => `recipient-${index + 1}@example.com`),
    ];
    // Blank source lines distinguish physical line numbers from recipient indexes.
    const source = `\n${emails.join('\n\n')}\n`;
    const inputBytes = Buffer.byteLength(source, 'utf8');
    const file = join(home, 'recipients.txt');
    await writeFile(file, source, 'utf8');

    expect(await run(file)).toBe(0);
    expect(boundary.createClient).toHaveBeenCalledOnce();
    expect(boundary.invite).toHaveBeenCalledTimes(100);
    expect(boundary.invite.mock.calls.map(([input]) => input)).toStrictEqual(
      emails.map((email) => ({ organizationId, email })),
    );
    expect(output.stderr).toBe('');

    const human = stripVTControlCharacters(output.stdout);
    const rows = human.split(/\r?\n/);
    let previousPosition = -1;
    for (const [index, email] of emails.entries()) {
      const position = human.indexOf(email);
      expect(position, `Full recipient ${index + 1} remains in source order`).toBeGreaterThan(
        previousPosition,
      );
      previousPosition = position;
      const row = rows.find((line) => line.includes(email));
      expect(row, `Recipient ${index + 1} has a complete human row`).toBeDefined();
      if (row === undefined) throw new Error('Missing recipient row');
      const prefix = row.slice(0, row.indexOf(email));
      expect(prefix).toMatch(new RegExp(`(?:^|\\D)${index * 2 + 2}(?:\\D|$)`));
      expect(row).toMatch(/\bcreated\b/i);
      expect(row).toMatch(/\bsent\b/i);
    }

    // Check count meaning, not colour, border characters or alignment. Whitespace and
    // punctuation between labels and counts are deliberately not part of the oracle.
    for (const label of [
      'input[\\s_-]*records',
      'unique[\\s_-]*recipients',
      'attempted',
      'created',
      'sent',
    ]) {
      expect(human).toMatch(new RegExp(`\\b${label}\\b[^\\w\\r\\n]*100\\b`, 'i'));
    }
    for (const label of [
      'duplicates',
      'delivery[\\s_-]*failed',
      'delivery[\\s_-]*unknown',
      'rejected',
      'unknown',
      'unattempted',
    ]) {
      expect(human).toMatch(new RegExp(`\\b${label}\\b[^\\w\\r\\n]*0\\b`, 'i'));
    }
    expect(human).not.toContain(file);

    // This generous fixture-specific ceiling allows full addresses and ample row metadata.
    // It rejects repeating the longest address's width for every short recipient.
    const linearUpperBound = inputBytes * 10 + 100_000;
    expect(Buffer.byteLength(output.stdout, 'utf8')).toBeLessThanOrEqual(linearUpperBound);
  });
});

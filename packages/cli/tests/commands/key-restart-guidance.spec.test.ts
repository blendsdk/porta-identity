import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockKeys = {
  generate: vi.fn(),
  rotate: vi.fn(),
};

vi.mock('../../src/client-factory.js', () => ({
  createClient: vi.fn(() => ({ keys: mockKeys })),
}));

vi.mock('../../src/error-handler.js', () => ({
  handleError: vi.fn(),
}));

vi.mock('../../src/output.js', () => ({
  printTable: vi.fn(),
  printJson: vi.fn(),
  success: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  formatDate: vi.fn((date: string) => date ?? 'N/A'),
  truncate: vi.fn((value: string) => value.slice(0, 8)),
}));

vi.mock('../../src/prompt.js', () => ({
  confirm: vi.fn(),
}));

import { handleError } from '../../src/error-handler.js';
import { error, info, printJson, success, warn } from '../../src/output.js';
import { confirm } from '../../src/prompt.js';

const generatedKey = {
  id: 'key-uuid-1234',
  kid: 'kid-active-1234',
  algorithm: 'ES256',
  isActive: true,
  createdAt: '2026-09-13T12:00:00Z',
  rotatedAt: null,
};

const conventionalOutputSpies = [success, info, warn, error];

/** Collect every human-oriented output channel into one assertion string. */
function conventionalOutput() {
  return conventionalOutputSpies
    .flatMap((spy) => vi.mocked(spy).mock.calls.flat())
    .map(String)
    .join('\n');
}

/** Invoke one signing-key subcommand through its public yargs command module. */
async function invokeKeyCommand(subcommand: 'generate' | 'rotate', json = false) {
  const yargs = (await import('yargs')).default;
  const { keysCommand } = await import('../../src/commands/keys.js');
  const arguments_ = ['keys', subcommand];

  if (subcommand === 'rotate') arguments_.push('--force');
  if (json) arguments_.push('--json');

  await yargs(arguments_)
    .command(keysCommand)
    .option('json', { type: 'boolean', default: false })
    .option('verbose', { type: 'boolean', default: false })
    .option('insecure', { type: 'boolean', default: false })
    .option('force', { type: 'boolean', default: false })
    .option('server', { type: 'string' })
    .fail(false)
    .parse();
}

/** Assert the two required fleet restart and committed-key verification instructions. */
function expectRestartAndVerificationGuidance(output: string) {
  expect(output).toMatch(/restart every running Porta instance/i);
  expect(output).toMatch(/after (?:the )?restart(?:ing)?|after restarting/i);
  expect(output).toMatch(
    /verify[^\n]*(?:committed[^\n]*active signing key|active signing key[^\n]*committed)/i,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(confirm).mockResolvedValue(true);
});

// Human key-management output must state the lifecycle change and the operator's restart and verification duties.
describe('key command restart guidance', () => {
  it('describes generate as adding an active key without retiring active keys', async () => {
    mockKeys.generate.mockResolvedValue(generatedKey);

    await invokeKeyCommand('generate');

    const output = conventionalOutput();
    expect(output).toMatch(/add(?:s|ed)?[^\n]*(?:another|additional|new)[^\n]*active signing key/i);
    expect(output).toMatch(/without[^\n]*(?:retir|deactivat)[^\n]*existing active key/i);
    expectRestartAndVerificationGuidance(output);
  });

  it('describes rotate as retiring every active key and creating one new active key', async () => {
    mockKeys.rotate.mockResolvedValue(generatedKey);

    await invokeKeyCommand('rotate');

    const output = conventionalOutput();
    expect(output).toMatch(/(?:retir|deactivat)[^\n]*(?:all|every)[^\n]*active key/i);
    expect(output).toMatch(/(?:creat|generat)[^\n]*(?:one|single|a new)[^\n]*active key/i);
    expectRestartAndVerificationGuidance(output);
  });

  it.each(['generate', 'rotate'] as const)(
    'keeps successful %s JSON output machine-only',
    async (subcommand) => {
      mockKeys[subcommand].mockResolvedValue(generatedKey);

      await invokeKeyCommand(subcommand, true);

      expect(printJson).toHaveBeenCalledWith(generatedKey);
      expect(conventionalOutput()).toBe('');
    },
  );

  it.each(['generate', 'rotate'] as const)(
    'preserves safe %s failure handling without success implications',
    async (subcommand) => {
      const failure = new Error('request failed without exposing credentials');
      mockKeys[subcommand].mockRejectedValue(failure);

      await invokeKeyCommand(subcommand);

      expect(handleError).toHaveBeenCalledWith(failure, expect.anything());
      expect(conventionalOutput()).not.toMatch(
        /success|restart|committed|created|generated|retired/i,
      );
    },
  );
});

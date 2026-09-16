/** Parser edge cases and table projection for the existing configuration commands. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({ list: vi.fn(), get: vi.fn(), set: vi.fn() }));
vi.mock('../../src/client-factory.js', () => ({ createClient: () => ({ config: sdk }) }));
vi.mock('../../src/error-handler.js', () => ({ handleError: vi.fn(), EXIT_VALIDATION_ERROR: 3 }));
vi.mock('../../src/output.js', () => ({
  printTable: vi.fn(),
  printJson: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  formatDate: (value: string) => `date:${value}`,
}));

import { configCommand } from '../../src/commands/config.js';
import { handleError } from '../../src/error-handler.js';
import { printTable, printJson, error, info } from '../../src/output.js';

const ENTRY = {
  key: 'magic_link_ttl',
  group: 'lifetimes',
  label: 'Magic-link lifetime',
  description: 'Lifetime of newly issued magic links.',
  value: 900,
  defaultValue: 900,
  valueType: 'integer',
  unit: 'seconds',
  minimum: 60,
  maximum: 3600,
  applicationMode: 'runtime',
  updatedAt: '2026-09-16T00:00:00.000Z',
};

/** Exercise actual yargs parsing while replacing only the external client and terminal output. */
async function invoke(args: string[]): Promise<void> {
  const yargs = (await import('yargs')).default;
  await yargs(['config', ...args])
    .command(configCommand)
    .option('json', { type: 'boolean', default: false })
    .option('verbose', { type: 'boolean', default: false })
    .exitProcess(false)
    .parseAsync();
}

describe('configuration command implementation', () => {
  const originalExitCode = process.exitCode;
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = originalExitCode;
    sdk.list.mockResolvedValue([ENTRY]);
    sdk.get.mockResolvedValue(ENTRY);
    sdk.set.mockImplementation(async (key: string, value: unknown) => ({
      data: { ...ENTRY, key, value },
      restartRequired: false,
    }));
  });
  afterEach(() => {
    process.exitCode = originalExitCode;
  });

  it.each([
    ['60', 60],
    ['3600', 3600],
    ['+900', 900],
    ['00900', 900],
  ])('should accept inclusive bounds and exact base-ten integer text %s', async (text, value) => {
    await invoke(['set', ENTRY.key, String(text)]);
    expect(sdk.set).toHaveBeenCalledWith(ENTRY.key, value);
  });
  it.each(['', ' 900 ', '900.0', '9e2', '-900', '0b1110000100'])(
    'should reject non-integer lexical forms or out-of-range value %s',
    async (text) => {
      await invoke(['set', ENTRY.key, text]);
      expect(sdk.set).not.toHaveBeenCalled();
      expect(error).toHaveBeenCalledWith('Expected integer (seconds): 60–3600.');
      expect(process.exitCode).toBe(3);
    },
  );
  it('should fail closed when numeric bounds are missing from metadata', async () => {
    sdk.get.mockResolvedValue({ ...ENTRY, minimum: undefined });
    await invoke(['set', ENTRY.key, '900']);
    expect(sdk.set).not.toHaveBeenCalled();
  });
  it('should project all metadata into the existing table formatter', async () => {
    await invoke(['get', ENTRY.key]);
    expect(printTable).toHaveBeenCalledWith(
      ['Key', 'Value', 'Type', 'Unit', 'Allowed', 'Application mode', 'Updated', 'Description'],
      [
        [
          ENTRY.key,
          '900',
          'integer',
          'seconds',
          '60–3600',
          'runtime',
          `date:${ENTRY.updatedAt}`,
          ENTRY.description,
        ],
      ],
    );
  });
  it('should preserve restart metadata in JSON without extra human output', async () => {
    const result = { data: ENTRY, restartRequired: true };
    sdk.set.mockResolvedValue(result);
    await invoke(['set', ENTRY.key, '900', '--json']);
    expect(printJson).toHaveBeenCalledWith(result);
    expect(info).not.toHaveBeenCalled();
  });
  it('should propagate write failures once without a retry', async () => {
    const failure = new Error('Configuration store is unavailable');
    sdk.set.mockRejectedValue(failure);
    await invoke(['set', ENTRY.key, '900']);
    expect(sdk.set).toHaveBeenCalledTimes(1);
    expect(handleError).toHaveBeenCalledWith(failure, false);
  });
});

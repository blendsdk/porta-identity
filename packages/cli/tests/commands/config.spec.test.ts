/** Configuration edits must obtain live metadata before converting a positional value to native JSON. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({ list: vi.fn(), get: vi.fn(), set: vi.fn() }));
vi.mock('../../src/client-factory.js', () => ({ createClient: () => ({ config: sdk }) }));
vi.mock('../../src/error-handler.js', () => ({ handleError: vi.fn() }));
vi.mock('../../src/output.js', () => ({
  printTable: vi.fn(),
  printJson: vi.fn(),
  success: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  formatDate: (value: string) => value,
  truncate: (value: string) => value,
}));

import { configCommand } from '../../src/commands/config.js';
import { handleError } from '../../src/error-handler.js';
import { printTable, printJson, success, warn, error, info } from '../../src/output.js';

const ENTRY = {
  key: 'magic_link_ttl',
  group: 'lifetimes',
  label: 'Magic-link lifetime',
  description: 'How long newly created magic-link tokens remain valid.',
  value: 900,
  defaultValue: 900,
  valueType: 'integer',
  unit: 'seconds',
  minimum: 60,
  maximum: 3600,
  applicationMode: 'runtime',
  updatedAt: '2026-09-16T00:00:00.000Z',
};
const LOCALE = {
  key: 'default_locale',
  group: 'general',
  label: 'Default locale',
  description: 'Final locale fallback.',
  value: 'en',
  defaultValue: 'en',
  valueType: 'string',
  unit: 'locale',
  allowedValues: ['en'],
  applicationMode: 'runtime',
  updatedAt: ENTRY.updatedAt,
};

/** Execute the real yargs command without swallowing command errors in the fixture. */
async function invoke(args: string[]): Promise<void> {
  const yargs = (await import('yargs')).default;
  await yargs(['config', ...args])
    .command(configCommand)
    .option('json', { type: 'boolean', default: false })
    .option('verbose', { type: 'boolean', default: false })
    .option('insecure', { type: 'boolean', default: false })
    .option('server', { type: 'string' })
    .exitProcess(false)
    .parseAsync();
}

/** Observe user-facing messages without imposing table column order or exact prose. */
function messages(): string {
  return JSON.stringify([
    vi.mocked(printTable).mock.calls,
    vi.mocked(success).mock.calls,
    vi.mocked(warn).mock.calls,
    vi.mocked(error).mock.calls,
    vi.mocked(info).mock.calls,
    vi
      .mocked(handleError)
      .mock.calls.map(([failure]) => (failure instanceof Error ? failure.message : failure)),
  ]);
}

describe('metadata-driven configuration CLI contract', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    sdk.list.mockResolvedValue([ENTRY, LOCALE]);
    sdk.get.mockResolvedValue(ENTRY);
    sdk.set.mockImplementation(async (key: string, value: unknown) => ({
      data: { ...ENTRY, key, value },
      restartRequired: false,
    }));
  });

  it.each(['list', 'get'])(
    'should display type, unit, bounds, application mode and timestamp for %s',
    async (operation) => {
      await invoke(operation === 'get' ? ['get', ENTRY.key] : ['list']);
      for (const token of [
        ENTRY.key,
        '900',
        'integer',
        'seconds',
        '60',
        '3600',
        'runtime',
        ENTRY.updatedAt,
      ])
        expect(messages()).toContain(token);
    },
  );
  it('should display the locale allowlist instead of numeric bounds', async () => {
    sdk.get.mockResolvedValue(LOCALE);
    await invoke(['get', LOCALE.key]);
    for (const token of ['default_locale', 'string', 'locale', 'en', 'runtime'])
      expect(messages()).toContain(token);
  });
  it.each(['list', 'get'])('should preserve SDK JSON output for %s', async (operation) => {
    await invoke(operation === 'get' ? ['get', ENTRY.key, '--json'] : ['list', '--json']);
    expect(printJson).toHaveBeenCalledWith(operation === 'get' ? ENTRY : [ENTRY, LOCALE]);
  });
  it('should get metadata first and send a native integer using the returned entry key', async () => {
    await invoke(['set', ENTRY.key, '1200']);
    expect(sdk.get).toHaveBeenCalledWith(ENTRY.key);
    expect(sdk.set).toHaveBeenCalledWith(ENTRY.key, 1200);
    expect(sdk.get.mock.invocationCallOrder[0]).toBeLessThan(
      sdk.set.mock.invocationCallOrder[0] ?? 0,
    );
    expect(success).toHaveBeenCalled();
    expect(messages()).toContain('1200');
    expect(messages()).not.toMatch(/restart/i);
  });
  it('should use the typed key returned by metadata rather than trusting argv as a mutation key', async () => {
    await invoke(['set', 'untrusted-read-alias', '1200']);
    expect(sdk.get).toHaveBeenCalledWith('untrusted-read-alias');
    expect(sdk.set).toHaveBeenCalledWith(ENTRY.key, 1200);
  });
  it('should tell the operator to restart every Porta server instance after a startup-policy edit', async () => {
    sdk.get.mockResolvedValue({
      ...ENTRY,
      key: 'access_token_ttl',
      applicationMode: 'restart-required',
      minimum: 60,
      maximum: 86400,
    });
    sdk.set.mockResolvedValue({
      data: { ...ENTRY, key: 'access_token_ttl', value: 7200 },
      restartRequired: true,
    });
    await invoke(['set', 'access_token_ttl', '7200']);
    expect(sdk.set).toHaveBeenCalledWith('access_token_ttl', 7200);
    expect(messages()).toMatch(/restart/i);
    expect(messages()).toMatch(/every|all/i);
    expect(messages()).toMatch(/Porta/i);
    expect(messages()).toMatch(/server.*instance/i);
  });
  it('should preserve the full SDK update envelope in JSON output', async () => {
    const result = { data: { ...ENTRY, value: 1200 }, restartRequired: false };
    sdk.set.mockResolvedValue(result);
    await invoke(['set', ENTRY.key, '1200', '--json']);
    expect(printJson).toHaveBeenCalledWith(result);
  });
  it.each(['1.5', '59', '3601', '1e3', '0x400', 'NaN', 'Infinity', '9007199254740992'])(
    'should reject invalid integer text %s without PUT',
    async (value) => {
      await invoke(['set', ENTRY.key, value]);
      expect(sdk.get).toHaveBeenCalledWith(ENTRY.key);
      expect(sdk.set).not.toHaveBeenCalled();
    },
  );
  it('should derive inclusive range validation from returned metadata, not a copied registry', async () => {
    sdk.get.mockResolvedValue({ ...ENTRY, minimum: 1000, maximum: 1100 });
    await invoke(['set', ENTRY.key, '1200']);
    expect(sdk.set).not.toHaveBeenCalled();
    expect(messages()).toContain('1000');
    expect(messages()).toContain('1100');
  });
  it('should accept an exact locale string as native JSON', async () => {
    sdk.get.mockResolvedValue(LOCALE);
    await invoke(['set', LOCALE.key, 'en']);
    expect(sdk.set).toHaveBeenCalledWith(LOCALE.key, 'en');
  });
  it.each(['EN', 'nl', ' en '])(
    'should reject unsupported locale %s without PUT',
    async (value) => {
      sdk.get.mockResolvedValue(LOCALE);
      await invoke(['set', LOCALE.key, value]);
      expect(sdk.set).not.toHaveBeenCalled();
    },
  );
  it('should preserve unknown-key errors and never attempt a write', async () => {
    const failure = new Error('Configuration entry not found');
    sdk.get.mockRejectedValue(failure);
    await invoke(['set', 'DATABASE_URL', 'private']);
    expect(handleError).toHaveBeenCalledWith(failure, expect.anything());
    expect(sdk.set).not.toHaveBeenCalled();
  });
});

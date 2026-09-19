import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({
  exports: { manifest: vi.fn() },
  imports: { preview: vi.fn(), apply: vi.fn() },
}));

const filesystem = vi.hoisted(() => ({
  access: vi.fn(),
  readFile: vi.fn(),
  stat: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock('../../src/client-factory.js', () => ({
  createClient: vi.fn(() => sdk),
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
  formatDate: vi.fn((value: string) => value),
  truncate: vi.fn((value: string) => value),
}));

vi.mock('../../src/prompt.js', () => ({
  confirm: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  ...filesystem,
  default: filesystem,
}));

import { handleError } from '../../src/error-handler.js';
import { error, info, printJson, printTable, success, warn } from '../../src/output.js';
import { confirm } from '../../src/prompt.js';

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
} as const;

const zeroCounts = { created: 0, updated: 0, skipped: 0, rejected: 0 } as const;
const emptySummary = {
  organizations: zeroCounts,
  applications: zeroCounts,
  application_modules: zeroCounts,
  roles: zeroCounts,
  permissions: zeroCounts,
  claim_definitions: zeroCounts,
  role_permission_mappings: zeroCounts,
  users: zeroCounts,
  user_role_assignments: zeroCounts,
  user_claim_values: zeroCounts,
  clients: zeroCounts,
} as const;
const preview = { mode: 'dry-run', summary: emptySummary, items: [], errors: [] } as const;
const applied = {
  mode: 'keep-existing',
  summary: emptySummary,
  items: [],
  errors: [],
  credentials: [
    {
      client_id: 'portal-client',
      label: 'Imported',
      secret: 'one-time-portability-secret',
      expires_at: '2027-09-14T10:11:12.345Z',
    },
    {
      client_id: 'billing-client',
      label: 'Imported',
      secret: 'second-portability-secret',
      expires_at: null,
    },
  ],
} as const;

type CliValue = string | boolean | readonly string[] | undefined;

/** Invoke one portability command through the conventional strict yargs boundary. */
async function invoke(
  family: 'export' | 'import',
  positionals: readonly string[],
  options: Record<string, CliValue> = {},
): Promise<string> {
  const yargs = (await import('yargs')).default;
  const commandModule =
    family === 'export'
      ? (await import('../../src/commands/export.js')).exportCommand
      : (await import('../../src/commands/import.js')).importCommand;
  const arguments_ = [family, ...positionals];
  let parseFailure = '';

  for (const [name, value] of Object.entries(options)) {
    if (value === undefined) continue;
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) {
      if (typeof item === 'boolean') {
        if (item) arguments_.push(`--${name}`);
      } else {
        arguments_.push(`--${name}`, item);
      }
    }
  }

  try {
    await yargs(arguments_)
      .command(commandModule)
      .option('json', { type: 'boolean', default: false })
      .option('verbose', { type: 'boolean', default: false })
      .option('insecure', { type: 'boolean', default: false })
      .option('server', { type: 'string' })
      .option('force', { type: 'boolean', default: false })
      .strict()
      .exitProcess(false)
      .fail((message, thrown) => {
        parseFailure = message || (thrown instanceof Error ? thrown.message : String(thrown));
        throw thrown ?? new Error(message);
      })
      .parse();
  } catch (caught) {
    if (!parseFailure && caught instanceof Error) parseFailure = caught.message;
  }

  return parseFailure;
}

const outputSpies = [success, info, warn, error, printTable, printJson];

/** Collect output mock arguments without writing command content to the test process. */
function outputText(): string {
  return outputSpies
    .flatMap((spy) => vi.mocked(spy).mock.calls)
    .map((call) => JSON.stringify(call))
    .join('\n');
}

/** Return the safe command failure text from yargs or the shared error handler. */
function failureText(parseFailure: string): string {
  const handled = vi.mocked(handleError).mock.calls[0]?.[0];
  return parseFailure || (handled instanceof Error ? handled.message : String(handled ?? ''));
}

beforeEach(() => {
  vi.clearAllMocks();
  process.exitCode = undefined;
  filesystem.access.mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' }));
  filesystem.readFile.mockResolvedValue(JSON.stringify(manifest));
  filesystem.stat.mockResolvedValue({ size: Buffer.byteLength(JSON.stringify(manifest)) });
  filesystem.writeFile.mockResolvedValue(undefined);
  vi.mocked(confirm).mockResolvedValue(true);
  sdk.exports.manifest.mockResolvedValue({
    manifest,
    filename: 'porta-manifest-2026-09-14T10-11-12-345Z.json',
  });
  sdk.imports.preview.mockResolvedValue(preview);
  sdk.imports.apply.mockResolvedValue(applied);
});

describe('conventional portability commands', () => {
  // Invalid scope, category, and application selections stop before export reaches the SDK.
  it.each([
    ['missing scope', { category: 'organizations', output: 'porta.json' }],
    [
      'both scopes',
      { organization: 'acme', environment: true, category: 'organizations', output: 'porta.json' },
    ],
    ['unknown category', { organization: 'acme', category: 'secrets', output: 'porta.json' }],
    [
      'duplicate category',
      { organization: 'acme', category: ['organizations', 'organizations'], output: 'porta.json' },
    ],
    [
      'missing application selector',
      { organization: 'acme', category: 'oidc_clients', output: 'porta.json' },
    ],
    [
      'both application selectors',
      {
        organization: 'acme',
        category: 'applications_authorization',
        application: 'portal',
        'all-applications': true,
        output: 'porta.json',
      },
    ],
    [
      'application selector without an application category',
      {
        organization: 'acme',
        category: 'organizations',
        application: 'portal',
        output: 'porta.json',
      },
    ],
    [
      'invalid application slug',
      {
        organization: 'acme',
        category: 'users_assignments',
        application: '../portal',
        output: 'porta.json',
      },
    ],
    [
      'duplicate application slug',
      {
        organization: 'acme',
        category: 'users_assignments',
        application: ['portal', 'portal'],
        output: 'porta.json',
      },
    ],
  ] as const)('rejects %s before making an export request', async (_case, options) => {
    await invoke('export', ['manifest'], options);

    expect(sdk.exports.manifest).not.toHaveBeenCalled();
    expect(filesystem.writeFile).not.toHaveBeenCalled();
  });

  // A valid selection is sent once and its returned manifest is serialized once to the resolved UTF-8 output path.
  it('exports one selected manifest to one resolved JSON file', async () => {
    const output = 'artifacts/porta.json';
    const expectedPath = resolve(output);

    await invoke('export', ['manifest'], {
      organization: 'acme',
      category: ['organizations', 'users_assignments'],
      application: ['portal', 'billing'],
      output,
    });

    expect(sdk.exports.manifest).toHaveBeenCalledOnce();
    expect(sdk.exports.manifest).toHaveBeenCalledWith({
      scope: { kind: 'organization', organization_slug: 'acme' },
      categories: ['organizations', 'users_assignments'],
      application_selection: {
        all_applications: false,
        application_slugs: ['portal', 'billing'],
      },
    });
    expect(filesystem.writeFile).toHaveBeenCalledOnce();
    const [writtenPath, content, encoding] = filesystem.writeFile.mock.calls[0];
    expect(writtenPath).toBe(expectedPath);
    expect(JSON.parse(String(content))).toStrictEqual(manifest);
    expect(encoding).toMatch(/^utf-?8$/i);
  });

  // Refusing replacement preserves an existing output file without making an export request or write.
  it('preserves an existing export after replacement is refused', async () => {
    filesystem.access.mockResolvedValue(undefined);
    vi.mocked(confirm).mockResolvedValue(false);

    await invoke('export', ['manifest'], {
      environment: true,
      category: 'organizations',
      output: 'existing.json',
    });

    expect(confirm).toHaveBeenCalledOnce();
    expect(sdk.exports.manifest).not.toHaveBeenCalled();
    expect(filesystem.writeFile).not.toHaveBeenCalled();
  });

  // The yes flag authorizes exactly one replacement of an existing output without prompting.
  it('replaces an existing export once when yes is supplied', async () => {
    filesystem.access.mockResolvedValue(undefined);

    await invoke('export', ['manifest'], {
      environment: true,
      category: 'organizations',
      output: 'existing.json',
      yes: true,
    });

    expect(confirm).not.toHaveBeenCalled();
    expect(sdk.exports.manifest).toHaveBeenCalledOnce();
    expect(filesystem.writeFile).toHaveBeenCalledOnce();
  });

  // JSON export status contains only path, filename, and collection counts while manifest content stays in the file.
  it('prints machine-only export metadata without printing the manifest', async () => {
    const expectedPath = resolve('portable.json');

    await invoke('export', ['manifest'], {
      environment: true,
      category: 'organizations',
      output: 'portable.json',
      json: true,
    });

    expect(printJson).toHaveBeenCalledOnce();
    expect(printJson).toHaveBeenCalledWith({
      path: expectedPath,
      filename: 'porta-manifest-2026-09-14T10-11-12-345Z.json',
      counts: {
        organizations: 1,
        applications: 0,
        application_modules: 0,
        roles: 0,
        permissions: 0,
        claim_definitions: 0,
        role_permission_mappings: 0,
        users: 0,
        user_role_assignments: 0,
        user_claim_values: 0,
        clients: 0,
      },
    });
    expect(outputText()).not.toContain('exported_at');
    expect(filesystem.writeFile).toHaveBeenCalledOnce();
  });

  // Missing, unreadable, oversized, and invalid JSON imports fail concisely without previewing or applying.
  it.each([
    ['missing path', [], undefined, /manifest.*(?:path|required)|not enough arguments/i],
    [
      'unreadable file',
      ['unreadable.json'],
      () => {
        filesystem.stat.mockRejectedValue(new Error('private filesystem detail'));
        filesystem.readFile.mockRejectedValue(new Error('private filesystem detail'));
      },
      /(?:unable|could not|failed).*read.*manifest/i,
    ],
    [
      'oversized file',
      ['large.json'],
      () => filesystem.stat.mockResolvedValue({ size: 64 * 1024 * 1024 + 1 }),
      /manifest.*too large|64 MiB/i,
    ],
    [
      'invalid JSON',
      ['invalid.json'],
      () => filesystem.readFile.mockResolvedValue('{"version":'),
      /invalid.*JSON|JSON.*invalid/i,
    ],
  ] as const)(
    'rejects an %s import before any SDK operation',
    async (_case, positionals, arrange, expectedMessage) => {
      arrange?.();

      const parseFailure = await invoke('import', ['manifest', ...positionals], {
        mode: 'keep-existing',
      });
      const message = failureText(parseFailure);

      expect(message).toMatch(expectedMessage);
      expect(message.length).toBeLessThan(160);
      expect(message).not.toContain('private filesystem detail');
      expect(sdk.imports.preview).not.toHaveBeenCalled();
      expect(sdk.imports.apply).not.toHaveBeenCalled();
    },
  );

  // A rejected preview renders bounded errors in order, sets failure status, and never applies.
  it('stops after printing an ordered rejected preview', async () => {
    sdk.imports.preview.mockResolvedValue({
      ...preview,
      summary: {
        ...emptySummary,
        organizations: { ...zeroCounts, rejected: 2 },
      },
      errors: [
        {
          entity_type: 'organizations',
          natural_key: { slug: 'alpha' },
          code: 'incompatible_record',
        },
        {
          entity_type: 'organizations',
          natural_key: { slug: 'zulu' },
          code: 'missing_dependency',
        },
      ],
    });

    await invoke('import', ['manifest', 'portable.json'], { mode: 'keep-existing' });

    const rendered = outputText();
    expect(rendered.indexOf('alpha')).toBeLessThan(rendered.indexOf('zulu'));
    expect(rendered).toContain('incompatible_record');
    expect(rendered).toContain('missing_dependency');
    expect(process.exitCode).toBe(1);
    expect(sdk.imports.apply).not.toHaveBeenCalled();
  });

  // Cancelling after a successful preview leaves the original manifest unapplied.
  it('does not apply when the operator cancels after preview', async () => {
    vi.mocked(confirm).mockResolvedValue(false);

    await invoke('import', ['manifest', 'portable.json'], { mode: 'update-existing' });

    expect(sdk.imports.preview).toHaveBeenCalledOnce();
    expect(sdk.imports.preview).toHaveBeenCalledWith(manifest);
    expect(confirm).toHaveBeenCalledOnce();
    expect(sdk.imports.apply).not.toHaveBeenCalled();
  });

  // Confirming after a successful preview applies the unchanged manifest exactly once in the selected mode.
  it('applies the original manifest once after confirmation', async () => {
    await invoke('import', ['manifest', 'portable.json'], { mode: 'keep-existing' });

    expect(sdk.imports.preview).toHaveBeenCalledOnce();
    expect(sdk.imports.preview).toHaveBeenCalledWith(manifest);
    expect(confirm).toHaveBeenCalledOnce();
    expect(sdk.imports.apply).toHaveBeenCalledOnce();
    expect(sdk.imports.apply).toHaveBeenCalledWith(manifest, 'keep-existing');
  });

  // The yes flag skips only confirmation and still requires one successful preview before one apply.
  it('previews before applying when yes is supplied', async () => {
    await invoke('import', ['manifest', 'portable.json'], {
      mode: 'update-existing',
      yes: true,
    });

    expect(confirm).not.toHaveBeenCalled();
    expect(sdk.imports.preview).toHaveBeenCalledOnce();
    expect(sdk.imports.apply).toHaveBeenCalledOnce();
    expect(sdk.imports.preview.mock.invocationCallOrder[0]).toBeLessThan(
      sdk.imports.apply.mock.invocationCallOrder[0],
    );
  });

  // Readable apply output reveals each returned one-time credential once without retrying or writing it.
  it('prints a returned credential secret exactly once in readable mode', async () => {
    await invoke('import', ['manifest', 'portable.json'], { mode: 'keep-existing', yes: true });

    expect(outputText().split('one-time-portability-secret')).toHaveLength(2);
    expect(outputText().split('second-portability-secret')).toHaveLength(2);
    expect(sdk.imports.preview).toHaveBeenCalledOnce();
    expect(sdk.imports.apply).toHaveBeenCalledOnce();
    expect(filesystem.writeFile).not.toHaveBeenCalled();
  });

  // JSON apply output emits one result containing each one-time credential once without human output or persistence.
  it('prints a returned credential secret exactly once in JSON mode', async () => {
    await invoke('import', ['manifest', 'portable.json'], {
      mode: 'keep-existing',
      yes: true,
      json: true,
    });

    expect(printJson).toHaveBeenCalledOnce();
    expect(printJson).toHaveBeenCalledWith(applied);
    expect(outputText().split('one-time-portability-secret')).toHaveLength(2);
    expect(outputText().split('second-portability-secret')).toHaveLength(2);
    expect(sdk.imports.preview).toHaveBeenCalledOnce();
    expect(sdk.imports.apply).toHaveBeenCalledOnce();
    expect(filesystem.writeFile).not.toHaveBeenCalled();
  });
});

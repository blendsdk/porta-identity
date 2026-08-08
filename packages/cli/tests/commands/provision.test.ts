/**
 * Tests for the provision command — transformer + duration parser.
 *
 * The provision command is tested primarily through its exported helpers
 * (parseDuration, parseProvisioningFile) and via SDK mock for the handler.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockImports = {
  provision: vi.fn(),
};

vi.mock('../../src/client-factory.js', () => ({
  createClient: vi.fn(() => ({ imports: mockImports })),
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
  formatDate: vi.fn((d: string) => d ?? 'N/A'),
  truncate: vi.fn((s: string) => s.slice(0, 8)),
}));

vi.mock('yaml', () => ({
  parse: vi.fn((content: string) => JSON.parse(content)),
}));

import { handleError } from '../../src/error-handler.js';
import { printJson, success, warn } from '../../src/output.js';

// ---------------------------------------------------------------------------
// Pure function tests — parseDuration
// ---------------------------------------------------------------------------

describe('parseDuration', () => {
  // Import directly (no mocking needed for pure function)
  async function getDurationParser() {
    const { parseDuration } = await import('../../src/commands/provision.js');
    return parseDuration;
  }

  it('parses days', async () => {
    const parseDuration = await getDurationParser();
    const before = new Date();
    const result = parseDuration('90d');
    expect(result.getTime()).toBeGreaterThan(before.getTime());
    // Should be roughly 90 days from now
    const diffDays = (result.getTime() - before.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeCloseTo(90, 0);
  });

  it('parses months', async () => {
    const parseDuration = await getDurationParser();
    const now = new Date();
    const result = parseDuration('6m');
    expect(result.getMonth()).toBe((now.getMonth() + 6) % 12);
  });

  it('parses years', async () => {
    const parseDuration = await getDurationParser();
    const now = new Date();
    const result = parseDuration('1y');
    expect(result.getFullYear()).toBe(now.getFullYear() + 1);
  });

  it('parses hours', async () => {
    const parseDuration = await getDurationParser();
    const before = new Date();
    const result = parseDuration('24h');
    const diffHours = (result.getTime() - before.getTime()) / (1000 * 60 * 60);
    expect(diffHours).toBeCloseTo(24, 0);
  });

  it('throws on invalid format', async () => {
    const parseDuration = await getDurationParser();
    expect(() => parseDuration('abc')).toThrow('Invalid duration format');
    expect(() => parseDuration('90x')).toThrow('Invalid duration format');
    expect(() => parseDuration('')).toThrow('Invalid duration format');
  });
});

// ---------------------------------------------------------------------------
// Provision handler tests
// ---------------------------------------------------------------------------

describe('provision command handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function getCommand() {
    const { provisionCommand } = await import('../../src/commands/provision.js');
    return provisionCommand;
  }

  async function invokeProvision(extraArgs: Record<string, unknown> = {}) {
    const yargs = (await import('yargs')).default;
    const cmd = await getCommand();

    const args = ['provision'];
    for (const [key, value] of Object.entries(extraArgs)) {
      if (typeof value === 'boolean') {
        if (value) args.push(`--${key}`);
      } else {
        args.push(`--${key}`, String(value));
      }
    }

    try {
      await yargs(args)
        .command(cmd)
        .option('json', { type: 'boolean', default: false })
        .option('verbose', { type: 'boolean', default: false })
        .option('insecure', { type: 'boolean', default: false })
        .option('force', { type: 'boolean', default: false })
        .option('server', { type: 'string' })
        .fail(false)
        .parse();
    } catch {
      // yargs may throw
    }
  }

  function mockFileRead(data: object) {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(data));
  }

  const minimalFile = {
    version: '1',
    organizations: [
      {
        name: 'Acme Corp',
        slug: 'acme',
        applications: [
          {
            name: 'Portal',
            slug: 'portal',
            clients: [{ client_name: 'Portal SPA', client_type: 'public' }],
            roles: [{ name: 'Admin', slug: 'admin', permissions: ['read', 'write'] }],
            permissions: [
              { name: 'Read', slug: 'read' },
              { name: 'Write', slug: 'write' },
            ],
          },
        ],
        users: [{ email: 'admin@acme.com', given_name: 'Admin' }],
      },
    ],
  };

  /** Response shape matching server ImportResult exactly */
  const importResult = {
    mode: 'merge',
    created: [
      { type: 'organization', slug: 'acme', name: 'Acme Corp' },
      { type: 'application', slug: 'portal', name: 'Portal' },
      { type: 'client', slug: 'portal-spa', name: 'Portal SPA' },
      { type: 'role', slug: 'admin', name: 'Admin' },
      { type: 'permission', slug: 'read', name: 'Read' },
      { type: 'permission', slug: 'write', name: 'Write' },
      { type: 'user', slug: 'admin@acme.com', name: 'admin@acme.com' },
    ],
    updated: [],
    skipped: [],
    errors: [],
    credentials: [],
  };

  it('transforms and sends manifest via SDK', async () => {
    mockFileRead(minimalFile);
    mockImports.provision.mockResolvedValue(importResult);

    await invokeProvision({ file: '/tmp/infra.json' });

    expect(mockImports.provision).toHaveBeenCalledWith(
      expect.objectContaining({
        manifest: expect.objectContaining({
          version: '1',
          organizations: expect.arrayContaining([
            expect.objectContaining({ name: 'Acme Corp', slug: 'acme' }),
          ]),
        }),
      }),
    );
    expect(success).toHaveBeenCalled();
  });

  it('sends dry-run flag', async () => {
    mockFileRead(minimalFile);
    mockImports.provision.mockResolvedValue({ ...importResult, dryRun: true });

    await invokeProvision({ file: '/tmp/infra.json', 'dry-run': true });

    expect(mockImports.provision).toHaveBeenCalledWith(
      expect.objectContaining({ dryRun: true }),
    );
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Dry-run'));
  });

  it('outputs JSON when --json', async () => {
    mockFileRead(minimalFile);
    mockImports.provision.mockResolvedValue(importResult);

    await invokeProvision({ file: '/tmp/infra.json', json: true });

    expect(printJson).toHaveBeenCalledWith(importResult);
  });

  it('rejects passwords without allow_passwords', async () => {
    const fileWithPasswords = {
      ...minimalFile,
      organizations: [
        {
          ...minimalFile.organizations[0],
          users: [{ email: 'admin@acme.com', password: 'secret123' }],
        },
      ],
    };
    mockFileRead(fileWithPasswords);

    await invokeProvision({ file: '/tmp/infra.json' });

    expect(handleError).toHaveBeenCalled();
  });

  it('allows passwords with allow_passwords: true', async () => {
    const fileWithPasswords = {
      ...minimalFile,
      allow_passwords: true,
      organizations: [
        {
          ...minimalFile.organizations[0],
          users: [{ email: 'admin@acme.com', password: 'secret123' }],
        },
      ],
    };
    mockFileRead(fileWithPasswords);
    mockImports.provision.mockResolvedValue(importResult);

    await invokeProvision({ file: '/tmp/infra.json' });

    expect(mockImports.provision).toHaveBeenCalled();
  });

  it('handles errors', async () => {
    mockFileRead(minimalFile);
    mockImports.provision.mockRejectedValue(new Error('fail'));

    await invokeProvision({ file: '/tmp/infra.json' });

    expect(handleError).toHaveBeenCalled();
  });
});

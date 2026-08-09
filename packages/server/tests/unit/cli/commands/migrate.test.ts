import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock bootstrap
vi.mock('../../../../src/cli/bootstrap.js', () => ({
  withBootstrap: vi.fn().mockImplementation(async (_argv: unknown, fn: () => Promise<unknown>) => fn()),
}));

// Mock error handler — run fn directly, skip process.exit
vi.mock('../../../../src/cli/error-handler.js', () => ({
  withErrorHandling: vi.fn().mockImplementation(async (fn: () => Promise<void>) => fn()),
}));

// Mock output helpers
vi.mock('../../../../src/cli/output.js', () => ({
  printTable: vi.fn(),
  printJson: vi.fn(),
  success: vi.fn(),
  warn: vi.fn(),
  outputResult: vi.fn().mockImplementation(
    (_isJson: boolean, tableRenderer: () => void) => {
      tableRenderer();
    },
  ),
  formatDate: vi.fn().mockImplementation((d: string) => d ? d.split('T')[0] : '—'),
  printTotal: vi.fn(),
}));

// Mock migrator
vi.mock('../../../../src/lib/migrator.js', () => ({
  runMigrations: vi.fn().mockResolvedValue(undefined),
}));

// Mock database
vi.mock('../../../../src/lib/database.js', () => ({
  getPool: vi.fn().mockReturnValue({
    query: vi.fn().mockResolvedValue({ rows: [] }),
  }),
}));

import { migrateCommand } from '../../../../src/cli/commands/migrate.js';
import { success, warn, printTable, printTotal } from '../../../../src/cli/output.js';
import { runMigrations } from '../../../../src/lib/migrator.js';
import { getPool } from '../../../../src/lib/database.js';
import type { GlobalOptions } from '../../../../src/cli/index.js';

/** Create test argv with defaults */
function createArgv(overrides: Partial<GlobalOptions & { count?: number }> = {}): GlobalOptions & { count: number } {
  return {
    json: false,
    verbose: false,
    force: false,
    'dry-run': false,
    count: 1,
    ...overrides,
  };
}

/**
 * Extract subcommand handlers from the migrate command builder.
 * Provides a test-friendly way to invoke each subcommand directly.
 */
function getSubcommandHandlers() {
  const handlers: Record<string, (args: Record<string, unknown>) => Promise<void>> = {};
  const builders: Record<string, (y: unknown) => unknown> = {};

  const fakeYargs = {
    command: (cmd: string | object, desc?: string, builder?: unknown, handler?: unknown) => {
      // Handle both .command('name', 'desc', builder, handler) and .command<T>(...) forms
      if (typeof cmd === 'string') {
        handlers[cmd] = handler as (args: Record<string, unknown>) => Promise<void>;
        builders[cmd] = builder as (y: unknown) => unknown;
      }
      return fakeYargs;
    },
    demandCommand: () => fakeYargs,
  };

  (migrateCommand.builder as (y: typeof fakeYargs) => typeof fakeYargs)(fakeYargs);
  return { handlers, builders };
}

describe('CLI Migrate Command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(runMigrations).mockResolvedValue(undefined);
    vi.mocked(getPool).mockReturnValue({
      query: vi.fn().mockResolvedValue({ rows: [] }),
    } as never);
  });

  describe('migrate up', () => {
    it('should run all pending migrations', async () => {
      const { handlers } = getSubcommandHandlers();

      await handlers['up'](createArgv());

      expect(runMigrations).toHaveBeenCalledWith('up');
      expect(success).toHaveBeenCalledWith('All migrations applied');
    });

    it('should skip execution in dry-run mode', async () => {
      const { handlers } = getSubcommandHandlers();

      await handlers['up'](createArgv({ 'dry-run': true }));

      expect(runMigrations).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith('Dry run — no migrations applied');
    });
  });

  describe('migrate down', () => {
    it('should rollback 1 migration by default', async () => {
      const { handlers } = getSubcommandHandlers();

      await handlers['down'](createArgv());

      expect(runMigrations).toHaveBeenCalledWith('down', 1);
      expect(success).toHaveBeenCalledWith('Rolled back 1 migration(s)');
    });

    it('should rollback specified number of migrations', async () => {
      const { handlers } = getSubcommandHandlers();

      await handlers['down'](createArgv({ count: 3 }));

      expect(runMigrations).toHaveBeenCalledWith('down', 3);
      expect(success).toHaveBeenCalledWith('Rolled back 3 migration(s)');
    });

    it('should skip execution in dry-run mode', async () => {
      const { handlers } = getSubcommandHandlers();

      await handlers['down'](createArgv({ 'dry-run': true, count: 2 }));

      expect(runMigrations).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith('Dry run — would rollback 2 migration(s)');
    });
  });

  describe('migrate status', () => {
    it('should show warning when no migrations applied', async () => {
      const { handlers } = getSubcommandHandlers();

      await handlers['status'](createArgv());

      expect(warn).toHaveBeenCalledWith('No migrations have been applied');
    });

    it('should display applied migrations in table format', async () => {
      vi.mocked(getPool).mockReturnValue({
        query: vi.fn().mockResolvedValue({
          rows: [
            { id: 1, name: '001_extensions', run_on: '2026-04-01T00:00:00Z' },
            { id: 2, name: '002_organizations', run_on: '2026-04-01T00:00:00Z' },
          ],
        }),
      } as never);

      const { handlers } = getSubcommandHandlers();
      await handlers['status'](createArgv());

      expect(printTable).toHaveBeenCalledWith(
        ['ID', 'Name', 'Applied'],
        expect.arrayContaining([
          ['1', '001_extensions', expect.any(String)],
          ['2', '002_organizations', expect.any(String)],
        ]),
      );
      expect(printTotal).toHaveBeenCalledWith('migrations applied', 2);
    });
  });

  describe('command metadata', () => {
    it('should have correct command name', () => {
      expect(migrateCommand.command).toBe('migrate');
    });

    it('should have a description', () => {
      expect(migrateCommand.describe).toBeTruthy();
    });
  });
});

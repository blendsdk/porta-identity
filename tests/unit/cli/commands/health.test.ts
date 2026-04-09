import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock bootstrap — prevent actual DB/Redis connections
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
  error: vi.fn(),
  outputResult: vi.fn().mockImplementation(
    (isJson: boolean, tableRenderer: () => void, jsonData: unknown) => {
      if (isJson) {
        // Store jsonData for assertion
        vi.mocked(outputResult).__jsonData = jsonData;
      } else {
        tableRenderer();
      }
    },
  ),
}));

// Mock database module
vi.mock('../../../../src/lib/database.js', () => ({
  getPool: vi.fn().mockReturnValue({
    query: vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }),
  }),
}));

// Mock redis module
vi.mock('../../../../src/lib/redis.js', () => ({
  getRedis: vi.fn().mockReturnValue({
    ping: vi.fn().mockResolvedValue('PONG'),
  }),
}));

import { healthCommand } from '../../../../src/cli/commands/health.js';
import { printTable, success, error as errorFn, outputResult } from '../../../../src/cli/output.js';
import { getPool } from '../../../../src/lib/database.js';
import { getRedis } from '../../../../src/lib/redis.js';
import type { GlobalOptions } from '../../../../src/cli/index.js';

// Extend the mock type to allow storing jsonData for assertions
declare module '../../../../src/cli/output.js' {
  interface OutputResultFn {
    __jsonData?: unknown;
  }
}

/** Create test argv with defaults */
function createArgv(overrides: Partial<GlobalOptions> = {}): GlobalOptions {
  return {
    json: false,
    verbose: false,
    force: false,
    'dry-run': false,
    ...overrides,
  };
}

/**
 * Execute the health check subcommand handler.
 * Navigates the yargs command tree to find and run the 'check' handler.
 */
async function runHealthCheck(argv: GlobalOptions): Promise<void> {
  // The builder registers subcommands. We need to invoke the check handler directly.
  // Extract the handler from the builder's yargs chain.
  const handlers: Record<string, (args: GlobalOptions) => Promise<void>> = {};
  const fakeYargs = {
    command: (cmd: string, _desc: string, _opts: unknown, handler: (args: GlobalOptions) => Promise<void>) => {
      handlers[cmd] = handler;
      return fakeYargs;
    },
    demandCommand: () => fakeYargs,
  };

  // Call builder to register subcommands on our fake yargs
  (healthCommand.builder as (y: typeof fakeYargs) => typeof fakeYargs)(fakeYargs);

  // Execute the 'check' handler
  await handlers['check'](argv);
}

describe('CLI Health Command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Restore default mock behavior (clearAllMocks resets implementations too)
    vi.mocked(getPool).mockReturnValue({
      query: vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }),
    } as never);
    vi.mocked(getRedis).mockReturnValue({
      ping: vi.fn().mockResolvedValue('PONG'),
    } as never);
    // Restore outputResult to call tableRenderer when not JSON
    vi.mocked(outputResult).mockImplementation(
      (isJson: boolean, tableRenderer: () => void, jsonData: unknown) => {
        if (isJson) {
          (outputResult as unknown as { __jsonData: unknown }).__jsonData = jsonData;
        } else {
          tableRenderer();
        }
      },
    );
  });

  describe('health check — all services healthy', () => {
    it('should report both services as ok in table mode', async () => {
      await runHealthCheck(createArgv());

      expect(outputResult).toHaveBeenCalled();
      expect(printTable).toHaveBeenCalledWith(
        ['Service', 'Status'],
        expect.arrayContaining([
          ['database', '✅ ok'],
          ['redis', '✅ ok'],
        ]),
      );
      expect(success).toHaveBeenCalledWith('All services healthy');
    });

    it('should output JSON with ok statuses when --json is set', async () => {
      // Use a custom outputResult that captures JSON data
      vi.mocked(outputResult).mockImplementation(
        (_isJson: boolean, _tableRenderer: () => void, jsonData: unknown) => {
          (outputResult as unknown as { __jsonData: unknown }).__jsonData = jsonData;
        },
      );

      await runHealthCheck(createArgv({ json: true }));

      expect(outputResult).toHaveBeenCalled();
      const jsonData = (outputResult as unknown as { __jsonData: unknown }).__jsonData;
      expect(jsonData).toEqual({ database: 'ok', redis: 'ok' });
    });
  });

  describe('health check — database failure', () => {
    it('should report database as error when query fails', async () => {
      vi.mocked(getPool).mockReturnValue({
        query: vi.fn().mockRejectedValue(new Error('Connection refused')),
      } as never);

      await runHealthCheck(createArgv());

      expect(printTable).toHaveBeenCalledWith(
        ['Service', 'Status'],
        expect.arrayContaining([
          ['database', '❌ Connection refused'],
          ['redis', '✅ ok'],
        ]),
      );
      expect(errorFn).toHaveBeenCalledWith('Some services are unhealthy');
    });
  });

  describe('health check — redis failure', () => {
    it('should report redis as error when ping fails', async () => {
      vi.mocked(getRedis).mockReturnValue({
        ping: vi.fn().mockRejectedValue(new Error('Redis timeout')),
      } as never);

      await runHealthCheck(createArgv());

      expect(printTable).toHaveBeenCalledWith(
        ['Service', 'Status'],
        expect.arrayContaining([
          ['database', '✅ ok'],
          ['redis', '❌ Redis timeout'],
        ]),
      );
      expect(errorFn).toHaveBeenCalledWith('Some services are unhealthy');
    });
  });

  describe('health check — both services fail', () => {
    it('should report both as error when all fail', async () => {
      vi.mocked(getPool).mockReturnValue({
        query: vi.fn().mockRejectedValue(new Error('DB down')),
      } as never);
      vi.mocked(getRedis).mockReturnValue({
        ping: vi.fn().mockRejectedValue(new Error('Redis down')),
      } as never);

      await runHealthCheck(createArgv());

      expect(printTable).toHaveBeenCalledWith(
        ['Service', 'Status'],
        expect.arrayContaining([
          ['database', '❌ DB down'],
          ['redis', '❌ Redis down'],
        ]),
      );
      expect(errorFn).toHaveBeenCalledWith('Some services are unhealthy');
    });
  });

  describe('command metadata', () => {
    it('should have correct command name', () => {
      expect(healthCommand.command).toBe('health');
    });

    it('should have a description', () => {
      expect(healthCommand.describe).toBeTruthy();
    });
  });
});

/**
 * Tests for the health command.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../src/global-options.js', () => ({
  resolveServerUrl: vi.fn(() => 'https://porta.local:3443'),
  GlobalOptions: {},
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

import { handleError } from '../../src/error-handler.js';
import { printJson, success, error as printError } from '../../src/output.js';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('health command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function getCommand() {
    const { healthCommand } = await import('../../src/commands/health.js');
    return healthCommand;
  }

  async function invokeCommand(extraArgs: Record<string, unknown> = {}) {
    const yargs = (await import('yargs')).default;
    const cmd = await getCommand();

    const args = ['health'];
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

  it('shows healthy status when server is ok', async () => {
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({
        status: 'ok',
        server: 'running',
        database: 'connected',
        redis: 'connected',
        timestamp: '2024-01-01T00:00:00Z',
      }),
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

    await invokeCommand();

    expect(success).toHaveBeenCalledWith(expect.stringContaining('healthy'));
  });

  it('shows unhealthy status when server reports error', async () => {
    const mockResponse = {
      ok: false,
      json: vi.fn().mockResolvedValue({
        status: 'error',
        server: 'running',
        database: 'disconnected',
        redis: 'connected',
        timestamp: '2024-01-01T00:00:00Z',
      }),
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

    await invokeCommand();

    expect(printError).toHaveBeenCalledWith(expect.stringContaining('unhealthy'));
  });

  it('outputs JSON when --json', async () => {
    const body = {
      status: 'ok',
      server: 'running',
      database: 'connected',
      redis: 'connected',
      timestamp: '2024-01-01T00:00:00Z',
    };
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue(body),
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

    await invokeCommand({ json: true });

    expect(printJson).toHaveBeenCalledWith(body);
  });

  it('handles network errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    await invokeCommand();

    expect(handleError).toHaveBeenCalled();
  });
});

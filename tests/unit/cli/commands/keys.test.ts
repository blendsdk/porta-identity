import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock bootstrap
vi.mock('../../../../src/cli/bootstrap.js', () => ({
  withBootstrap: vi.fn().mockImplementation(async (_argv: unknown, fn: () => Promise<unknown>) => fn()),
}));

// Mock error handler — run fn directly
vi.mock('../../../../src/cli/error-handler.js', () => ({
  withErrorHandling: vi.fn().mockImplementation(async (fn: () => Promise<void>) => fn()),
}));

// Mock output helpers
vi.mock('../../../../src/cli/output.js', () => ({
  printTable: vi.fn(),
  printJson: vi.fn(),
  success: vi.fn(),
  warn: vi.fn(),
  outputResult: vi.fn(),
  truncateId: vi.fn().mockImplementation((s: string) => s.length > 8 ? s.substring(0, 8) + '...' : s),
  formatDate: vi.fn().mockImplementation((d: string | null) => d ? d.split('T')[0] : '—'),
  printTotal: vi.fn(),
}));

// Mock prompt
vi.mock('../../../../src/cli/prompt.js', () => ({
  confirm: vi.fn().mockResolvedValue(true),
}));

// Mock database
vi.mock('../../../../src/lib/database.js', () => ({
  getPool: vi.fn().mockReturnValue({
    query: vi.fn().mockResolvedValue({ rows: [] }),
  }),
}));

// Mock signing-keys
vi.mock('../../../../src/lib/signing-keys.js', () => ({
  generateES256KeyPair: vi.fn().mockReturnValue({
    kid: 'test-kid-123',
    publicKeyPem: '-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----',
    privateKeyPem: '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----',
  }),
}));

import { keysCommand } from '../../../../src/cli/commands/keys.js';
import { success, warn, outputResult } from '../../../../src/cli/output.js';
import { confirm } from '../../../../src/cli/prompt.js';
import { getPool } from '../../../../src/lib/database.js';
import { generateES256KeyPair } from '../../../../src/lib/signing-keys.js';
import type { GlobalOptions } from '../../../../src/cli/index.js';

function createArgv(overrides: Partial<GlobalOptions> = {}): GlobalOptions {
  return { json: false, verbose: false, force: false, 'dry-run': false, ...overrides };
}

function getHandlers() {
  const handlers: Record<string, (args: Record<string, unknown>) => Promise<void>> = {};
  const fakeYargs = {
    command: (cmd: string | object, _desc?: string, _builder?: unknown, handler?: unknown) => {
      if (typeof cmd === 'string') handlers[cmd] = handler as (args: Record<string, unknown>) => Promise<void>;
      return fakeYargs;
    },
    demandCommand: () => fakeYargs,
  };
  (keysCommand.builder as (y: typeof fakeYargs) => typeof fakeYargs)(fakeYargs);
  return handlers;
}

describe('CLI Keys Command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getPool).mockReturnValue({
      query: vi.fn().mockResolvedValue({ rows: [] }),
    } as never);
    vi.mocked(outputResult).mockImplementation(
      (_isJson: boolean, tableRenderer: () => void) => { tableRenderer(); },
    );
    vi.mocked(confirm).mockResolvedValue(true);
  });

  describe('keys list', () => {
    it('should warn when no keys found', async () => {
      const handlers = getHandlers();
      await handlers['list'](createArgv());
      expect(warn).toHaveBeenCalledWith('No signing keys found');
    });

    it('should display keys in table format', async () => {
      vi.mocked(getPool).mockReturnValue({
        query: vi.fn().mockResolvedValue({
          rows: [
            { id: 'abc-123', kid: 'kid1', status: 'active', created_at: '2026-04-09', retired_at: null },
          ],
        }),
      } as never);

      const handlers = getHandlers();
      await handlers['list'](createArgv());
      expect(outputResult).toHaveBeenCalled();
    });
  });

  describe('keys generate', () => {
    it('should generate and insert a new key pair', async () => {
      const mockQuery = vi.fn().mockResolvedValue({
        rows: [{ id: 'new-id-123', kid: 'test-kid-123' }],
      });
      vi.mocked(getPool).mockReturnValue({ query: mockQuery } as never);

      const handlers = getHandlers();
      await handlers['generate'](createArgv());

      expect(generateES256KeyPair).toHaveBeenCalledOnce();
      expect(mockQuery).toHaveBeenCalled();
      expect(success).toHaveBeenCalledWith(expect.stringContaining('test-kid-123'));
    });

    it('should skip in dry-run mode', async () => {
      const handlers = getHandlers();
      await handlers['generate'](createArgv({ 'dry-run': true }));
      expect(generateES256KeyPair).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('Dry run'));
    });
  });

  describe('keys rotate', () => {
    it('should retire active keys and generate new key', async () => {
      const mockQuery = vi.fn()
        .mockResolvedValueOnce({ rows: [] }) // retire query
        .mockResolvedValueOnce({ rows: [{ id: 'rotated-id', kid: 'new-kid' }] }); // insert
      vi.mocked(getPool).mockReturnValue({ query: mockQuery } as never);

      const handlers = getHandlers();
      await handlers['rotate'](createArgv({ force: true }));

      expect(mockQuery).toHaveBeenCalledTimes(2);
      expect(success).toHaveBeenCalledWith(expect.stringContaining('Rotated'));
    });

    it('should cancel when confirmation declined', async () => {
      vi.mocked(confirm).mockResolvedValue(false);

      const handlers = getHandlers();
      await handlers['rotate'](createArgv());

      expect(warn).toHaveBeenCalledWith('Key rotation cancelled');
    });

    it('should skip in dry-run mode', async () => {
      const handlers = getHandlers();
      await handlers['rotate'](createArgv({ 'dry-run': true }));
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('Dry run'));
    });
  });

  describe('command metadata', () => {
    it('should have correct command name', () => {
      expect(keysCommand.command).toBe('keys');
    });
  });
});

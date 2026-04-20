/**
 * Unit tests for the CLI keys command (HTTP mode).
 *
 * Tests list, generate, and rotate subcommands via mocked AdminHttpClient.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
  withHttpClient: vi.fn(),
}));

vi.mock('../../../../src/cli/bootstrap.js', () => ({
  withHttpClient: mocks.withHttpClient.mockImplementation(
    async (_argv: unknown, fn: (client: unknown) => Promise<unknown>) =>
      fn({ get: mocks.get, post: mocks.post, put: mocks.put, delete: mocks.del }),
  ),
}));

vi.mock('../../../../src/cli/error-handler.js', () => ({
  withErrorHandling: vi.fn().mockImplementation(async (fn: () => Promise<void>) => fn()),
}));

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

vi.mock('../../../../src/cli/prompt.js', () => ({
  confirm: vi.fn().mockResolvedValue(true),
}));

import { keysCommand } from '../../../../src/cli/commands/keys.js';
import { success, warn, outputResult } from '../../../../src/cli/output.js';
import { confirm } from '../../../../src/cli/prompt.js';
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
    vi.mocked(outputResult).mockImplementation(
      (_isJson: boolean, tableRenderer: () => void) => { tableRenderer(); },
    );
    vi.mocked(confirm).mockResolvedValue(true);
  });

  describe('keys list', () => {
    it('should warn when no keys found', async () => {
      mocks.get.mockResolvedValue({ data: { data: [] } });
      const handlers = getHandlers();
      await handlers['list'](createArgv());
      expect(warn).toHaveBeenCalledWith('No signing keys found');
    });

    it('should display keys in table format', async () => {
      mocks.get.mockResolvedValue({
        data: {
          data: [
            { id: 'abc-123', kid: 'kid1', algorithm: 'ES256', status: 'active', createdAt: '2026-04-09', retiredAt: null },
          ],
        },
      });
      const handlers = getHandlers();
      await handlers['list'](createArgv());
      expect(mocks.get).toHaveBeenCalledWith('/api/admin/keys');
      expect(outputResult).toHaveBeenCalled();
    });
  });

  describe('keys generate', () => {
    it('should generate and insert a new key pair', async () => {
      mocks.post.mockResolvedValue({
        data: { data: { id: 'new-id-123', kid: 'test-kid-123', message: 'New signing key generated' } },
      });
      const handlers = getHandlers();
      await handlers['generate'](createArgv());
      expect(mocks.post).toHaveBeenCalledWith('/api/admin/keys/generate');
      expect(success).toHaveBeenCalledWith(expect.stringContaining('test-kid-123'));
    });

    it('should skip in dry-run mode', async () => {
      const handlers = getHandlers();
      await handlers['generate'](createArgv({ 'dry-run': true }));
      expect(mocks.post).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('Dry run'));
    });
  });

  describe('keys rotate', () => {
    it('should retire active keys and generate new key', async () => {
      mocks.post.mockResolvedValue({
        data: { data: { id: 'rotated-id', kid: 'new-kid', retiredCount: 1, message: 'Keys rotated' } },
      });
      const handlers = getHandlers();
      await handlers['rotate'](createArgv({ force: true }));
      expect(mocks.post).toHaveBeenCalledWith('/api/admin/keys/rotate');
      expect(success).toHaveBeenCalledWith(expect.stringContaining('Rotated'));
    });

    it('should cancel when confirmation declined', async () => {
      vi.mocked(confirm).mockResolvedValue(false);
      const handlers = getHandlers();
      await handlers['rotate'](createArgv());
      expect(warn).toHaveBeenCalledWith('Key rotation cancelled');
      expect(mocks.post).not.toHaveBeenCalled();
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

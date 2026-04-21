/**
 * Unit tests for the CLI audit command (HTTP mode).
 *
 * Tests list subcommand with various filters via mocked AdminHttpClient.
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
  warn: vi.fn(),
  success: vi.fn(),
  outputResult: vi.fn(),
  truncateId: vi.fn().mockImplementation((s: string) => s.length > 8 ? s.substring(0, 8) + '...' : s),
  formatDate: vi.fn().mockImplementation((d: string | null) => d ? d.split('T')[0] : '—'),
  printTotal: vi.fn(),
}));

import { auditCommand } from '../../../../src/cli/commands/audit.js';
import { warn, success, outputResult } from '../../../../src/cli/output.js';
import type { GlobalOptions } from '../../../../src/cli/index.js';

interface AuditArgvOverrides extends Partial<GlobalOptions> {
  limit?: number;
  event?: string;
  org?: string;
  user?: string;
  since?: string;
}

function createArgv(overrides: AuditArgvOverrides = {}) {
  return { json: false, verbose: false, force: false, 'dry-run': false, limit: 50, ...overrides };
}

function getHandlers() {
  const handlers: Record<string, (args: Record<string, unknown>) => Promise<void>> = {};
  const fakeYargs = {
    command: (cmd: string | object, _desc?: string, _builder?: unknown, handler?: unknown) => {
      if (typeof cmd === 'string') handlers[cmd] = handler as (args: Record<string, unknown>) => Promise<void>;
      return fakeYargs;
    },
    demandCommand: () => fakeYargs,
    option: () => fakeYargs,
  };
  (auditCommand.builder as (y: typeof fakeYargs) => typeof fakeYargs)(fakeYargs);
  return handlers;
}

describe('CLI Audit Command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(outputResult).mockImplementation(
      (_isJson: boolean, tableRenderer: () => void) => { tableRenderer(); },
    );
  });

  describe('audit list', () => {
    it('should warn when no entries found', async () => {
      mocks.get.mockResolvedValue({ data: { data: [], total: 0 } });
      const handlers = getHandlers();
      await handlers['list'](createArgv());
      expect(warn).toHaveBeenCalledWith('No audit log entries found');
    });

    it('should display audit entries in table', async () => {
      mocks.get.mockResolvedValue({
        data: {
          data: [{
            id: 'log-1',
            eventType: 'org.created',
            eventCategory: 'organization',
            actorId: 'admin-1',
            organizationId: 'org-1',
            description: 'Created org',
            createdAt: '2026-04-09T10:00:00Z',
          }],
          total: 1,
        },
      });
      const handlers = getHandlers();
      await handlers['list'](createArgv());
      expect(mocks.get).toHaveBeenCalledWith('/api/admin/audit', { limit: '50' });
      expect(outputResult).toHaveBeenCalled();
    });

    it('should pass event filter as query param', async () => {
      mocks.get.mockResolvedValue({ data: { data: [], total: 0 } });
      const handlers = getHandlers();
      await handlers['list'](createArgv({ event: 'org.created' }));
      expect(mocks.get).toHaveBeenCalledWith(
        '/api/admin/audit',
        expect.objectContaining({ event: 'org.created' }),
      );
    });

    it('should pass multiple filters as query params', async () => {
      mocks.get.mockResolvedValue({ data: { data: [], total: 0 } });
      const handlers = getHandlers();
      await handlers['list'](createArgv({ event: 'org.created', org: 'org-123', limit: 10 }));
      expect(mocks.get).toHaveBeenCalledWith(
        '/api/admin/audit',
        expect.objectContaining({ event: 'org.created', org: 'org-123', limit: '10' }),
      );
    });

    it('should use default limit of 50', async () => {
      mocks.get.mockResolvedValue({ data: { data: [], total: 0 } });
      const handlers = getHandlers();
      await handlers['list'](createArgv());
      expect(mocks.get).toHaveBeenCalledWith(
        '/api/admin/audit',
        expect.objectContaining({ limit: '50' }),
      );
    });

    it('should pass since filter as query param', async () => {
      mocks.get.mockResolvedValue({ data: { data: [], total: 0 } });
      const handlers = getHandlers();
      await handlers['list'](createArgv({ since: '2026-04-01' }));
      expect(mocks.get).toHaveBeenCalledWith(
        '/api/admin/audit',
        expect.objectContaining({ since: '2026-04-01' }),
      );
    });
  });

  describe('audit cleanup', () => {
    it('should call POST /api/admin/audit/cleanup with default body (H2)', async () => {
      mocks.post.mockResolvedValue({
        data: { dryRun: false, retentionDays: 90, entriesFound: 42, deleted: 42 },
      });
      const handlers = getHandlers();
      await handlers['cleanup'](createArgv());
      expect(mocks.post).toHaveBeenCalledWith('/api/admin/audit/cleanup', {});
    });

    it('should display success message when entries are deleted (H2)', async () => {
      mocks.post.mockResolvedValue({
        data: { dryRun: false, retentionDays: 90, entriesFound: 42, deleted: 42 },
      });
      const handlers = getHandlers();
      await handlers['cleanup'](createArgv());
      expect(success).toHaveBeenCalledWith(
        'Deleted 42 audit log entries older than 90 days',
      );
    });

    it('should display success message when no old entries found', async () => {
      mocks.post.mockResolvedValue({
        data: { dryRun: false, retentionDays: 90, entriesFound: 0, deleted: 0 },
      });
      const handlers = getHandlers();
      await handlers['cleanup'](createArgv());
      expect(success).toHaveBeenCalledWith('No entries older than 90 days found');
    });

    it('should send dryRun=true when --dry-run flag is set (H3)', async () => {
      mocks.post.mockResolvedValue({
        data: { dryRun: true, retentionDays: 90, entriesFound: 15, deleted: 0 },
      });
      const handlers = getHandlers();
      await handlers['cleanup'](createArgv({ 'dry-run': true }));
      expect(mocks.post).toHaveBeenCalledWith(
        '/api/admin/audit/cleanup',
        { dryRun: true },
      );
    });

    it('should display dry-run warning with entry count (H3)', async () => {
      mocks.post.mockResolvedValue({
        data: { dryRun: true, retentionDays: 90, entriesFound: 15, deleted: 0 },
      });
      const handlers = getHandlers();
      await handlers['cleanup'](createArgv({ 'dry-run': true }));
      expect(warn).toHaveBeenCalledWith(
        'Dry run: 15 entries older than 90 days would be deleted',
      );
    });

    it('should send retentionDays when --retention-days flag is set (H4)', async () => {
      mocks.post.mockResolvedValue({
        data: { dryRun: false, retentionDays: 30, entriesFound: 100, deleted: 100 },
      });
      const handlers = getHandlers();
      await handlers['cleanup'](createArgv({ 'retention-days': 30 } as Record<string, unknown>));
      expect(mocks.post).toHaveBeenCalledWith(
        '/api/admin/audit/cleanup',
        { retentionDays: 30 },
      );
    });

    it('should send both dryRun and retentionDays when both flags set', async () => {
      mocks.post.mockResolvedValue({
        data: { dryRun: true, retentionDays: 7, entriesFound: 500, deleted: 0 },
      });
      const handlers = getHandlers();
      await handlers['cleanup'](createArgv({ 'dry-run': true, 'retention-days': 7 } as Record<string, unknown>));
      expect(mocks.post).toHaveBeenCalledWith(
        '/api/admin/audit/cleanup',
        { dryRun: true, retentionDays: 7 },
      );
    });

    it('should pass outputResult for JSON mode support', async () => {
      mocks.post.mockResolvedValue({
        data: { dryRun: false, retentionDays: 90, entriesFound: 5, deleted: 5 },
      });
      const handlers = getHandlers();
      await handlers['cleanup'](createArgv());
      expect(outputResult).toHaveBeenCalledWith(
        false,
        expect.any(Function),
        { dryRun: false, retentionDays: 90, entriesFound: 5, deleted: 5 },
      );
    });
  });

  describe('command metadata', () => {
    it('should have correct command name', () => {
      expect(auditCommand.command).toBe('audit');
    });
  });
});

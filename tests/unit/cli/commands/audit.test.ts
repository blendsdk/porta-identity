import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../src/cli/bootstrap.js', () => ({
  withBootstrap: vi.fn().mockImplementation(async (_argv: unknown, fn: () => Promise<unknown>) => fn()),
}));

vi.mock('../../../../src/cli/error-handler.js', () => ({
  withErrorHandling: vi.fn().mockImplementation(async (fn: () => Promise<void>) => fn()),
}));

vi.mock('../../../../src/cli/output.js', () => ({
  printTable: vi.fn(),
  printJson: vi.fn(),
  warn: vi.fn(),
  outputResult: vi.fn(),
  truncateId: vi.fn().mockImplementation((s: string) => s.length > 8 ? s.substring(0, 8) + '...' : s),
  formatDate: vi.fn().mockImplementation((d: string | null) => d ? d.split('T')[0] : '—'),
  printTotal: vi.fn(),
}));

vi.mock('../../../../src/lib/database.js', () => ({
  getPool: vi.fn().mockReturnValue({
    query: vi.fn().mockResolvedValue({ rows: [] }),
  }),
}));

import { auditCommand } from '../../../../src/cli/commands/audit.js';
import { warn, outputResult } from '../../../../src/cli/output.js';
import { getPool } from '../../../../src/lib/database.js';
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
    vi.mocked(getPool).mockReturnValue({
      query: vi.fn().mockResolvedValue({ rows: [] }),
    } as never);
    vi.mocked(outputResult).mockImplementation(
      (_isJson: boolean, tableRenderer: () => void) => { tableRenderer(); },
    );
  });

  describe('audit list', () => {
    it('should warn when no entries found', async () => {
      const handlers = getHandlers();
      await handlers['list'](createArgv());
      expect(warn).toHaveBeenCalledWith('No audit log entries found');
    });

    it('should display audit entries in table', async () => {
      vi.mocked(getPool).mockReturnValue({
        query: vi.fn().mockResolvedValue({
          rows: [{
            id: 'log-1',
            event_type: 'org.created',
            event_category: 'organization',
            actor_id: 'admin-1',
            organization_id: 'org-1',
            description: 'Created org',
            created_at: '2026-04-09T10:00:00Z',
          }],
        }),
      } as never);

      const handlers = getHandlers();
      await handlers['list'](createArgv());
      expect(outputResult).toHaveBeenCalled();
    });

    it('should pass event filter to query', async () => {
      const mockQuery = vi.fn().mockResolvedValue({ rows: [] });
      vi.mocked(getPool).mockReturnValue({ query: mockQuery } as never);

      const handlers = getHandlers();
      await handlers['list'](createArgv({ event: 'org.created' }));

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('event_type = $1'),
        expect.arrayContaining(['org.created']),
      );
    });

    it('should pass multiple filters to query', async () => {
      const mockQuery = vi.fn().mockResolvedValue({ rows: [] });
      vi.mocked(getPool).mockReturnValue({ query: mockQuery } as never);

      const handlers = getHandlers();
      await handlers['list'](createArgv({ event: 'org.created', org: 'org-123', limit: 10 }));

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('event_type = $1'),
        expect.arrayContaining(['org.created', 'org-123', 10]),
      );
    });

    it('should use default limit of 50', async () => {
      const mockQuery = vi.fn().mockResolvedValue({ rows: [] });
      vi.mocked(getPool).mockReturnValue({ query: mockQuery } as never);

      const handlers = getHandlers();
      await handlers['list'](createArgv());

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT'),
        expect.arrayContaining([50]),
      );
    });

    it('should pass since filter to query', async () => {
      const mockQuery = vi.fn().mockResolvedValue({ rows: [] });
      vi.mocked(getPool).mockReturnValue({ query: mockQuery } as never);

      const handlers = getHandlers();
      await handlers['list'](createArgv({ since: '2026-04-01' }));

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('created_at >= $1'),
        expect.arrayContaining(['2026-04-01']),
      );
    });
  });

  describe('command metadata', () => {
    it('should have correct command name', () => {
      expect(auditCommand.command).toBe('audit');
    });
  });
});

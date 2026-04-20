import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mock client + resolveApp
// ---------------------------------------------------------------------------

const { mockClient, mockResolveApp } = vi.hoisted(() => ({
  mockClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
  mockResolveApp: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('../../../../src/cli/bootstrap.js', () => ({
  withHttpClient: vi.fn().mockImplementation(
    async (_argv: unknown, fn: (c: typeof mockClient) => Promise<unknown>) => fn(mockClient),
  ),
}));

vi.mock('../../../../src/cli/error-handler.js', () => ({
  withErrorHandling: vi.fn().mockImplementation(
    async (fn: () => Promise<void>) => fn(),
  ),
}));

vi.mock('../../../../src/cli/output.js', () => ({
  printTable: vi.fn(),
  printJson: vi.fn(),
  success: vi.fn(),
  warn: vi.fn(),
  outputResult: vi.fn(),
  truncateId: vi.fn().mockImplementation((s: string) => s.length > 8 ? s.substring(0, 8) + '...' : s),
  formatDate: vi.fn().mockImplementation((d: string | Date | null) => d ? String(d).split('T')[0] : '—'),
  printTotal: vi.fn(),
}));

vi.mock('../../../../src/cli/prompt.js', () => ({
  confirm: vi.fn().mockResolvedValue(true),
}));

// Mock app.js to provide resolveApp without loading the full app command chain
vi.mock('../../../../src/cli/commands/app.js', () => ({
  resolveApp: mockResolveApp,
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { userClaimCommand } from '../../../../src/cli/commands/user-claim.js';
import { success, warn, outputResult, printTable } from '../../../../src/cli/output.js';
import { confirm } from '../../../../src/cli/prompt.js';
import type { GlobalOptions } from '../../../../src/cli/index.js';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const APP_UUID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const USER_UUID = 'u1u2u3u4-u5u6-7890-abcd-ef1234567890';
const CLAIM_UUID = 'ddd44444-4444-4444-4444-444444444444';

const fakeApp = { id: APP_UUID, name: 'BusinessSuite', slug: 'business-suite', status: 'active' };

const fakeClaimValue = {
  claimId: CLAIM_UUID,
  claimName: 'department',
  value: 'Engineering',
};

function createArgv(
  overrides: Partial<GlobalOptions & Record<string, unknown>> = {},
): GlobalOptions & Record<string, unknown> {
  return { json: false, verbose: false, force: false, 'dry-run': false, ...overrides };
}

function getHandlers() {
  const handlers: Record<string, (args: Record<string, unknown>) => Promise<void>> = {};
  const fakeYargs = {
    command: (cmd: string | object, _desc?: string, _builder?: unknown, handler?: unknown) => {
      if (typeof cmd === 'string') {
        const name = cmd.split(' ')[0];
        handlers[name] = handler as (args: Record<string, unknown>) => Promise<void>;
      }
      return fakeYargs;
    },
    option: () => fakeYargs,
    positional: () => fakeYargs,
    demandCommand: () => fakeYargs,
  };
  (userClaimCommand.builder as (y: typeof fakeYargs) => typeof fakeYargs)(fakeYargs);
  return handlers;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CLI User Claim Command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(outputResult).mockImplementation(
      (_isJson: boolean, tableRenderer: () => void) => { tableRenderer(); },
    );
    vi.mocked(confirm).mockResolvedValue(true);
    mockResolveApp.mockResolvedValue(fakeApp);
  });

  // ── claims set ────────────────────────────────────────────────────

  describe('claims set', () => {
    it('should resolve app and PUT claim value for user', async () => {
      mockClient.put.mockResolvedValue({ status: 200, data: {} });

      const handlers = getHandlers();
      await handlers['set'](createArgv({
        'user-id': USER_UUID,
        app: APP_UUID,
        'claim-id': CLAIM_UUID,
        value: 'Engineering',
      }));

      expect(mockResolveApp).toHaveBeenCalledWith(mockClient, APP_UUID);
      expect(mockClient.put).toHaveBeenCalledWith(
        `/api/admin/applications/${APP_UUID}/claims/${CLAIM_UUID}/users/${USER_UUID}`,
        { value: 'Engineering' },
      );
      expect(success).toHaveBeenCalledWith(expect.stringContaining(USER_UUID.substring(0, 8)));
    });

    it('should resolve app by slug', async () => {
      mockClient.put.mockResolvedValue({ status: 200, data: {} });

      const handlers = getHandlers();
      await handlers['set'](createArgv({
        'user-id': USER_UUID,
        app: 'business-suite',
        'claim-id': CLAIM_UUID,
        value: 'Engineering',
      }));

      expect(mockResolveApp).toHaveBeenCalledWith(mockClient, 'business-suite');
    });
  });

  // ── claims get ────────────────────────────────────────────────────

  describe('claims get', () => {
    it('should resolve app and GET user claim values', async () => {
      mockClient.get.mockResolvedValue({ status: 200, data: { data: [fakeClaimValue] } });

      const handlers = getHandlers();
      await handlers['get'](createArgv({ 'user-id': USER_UUID, app: APP_UUID }));

      expect(mockResolveApp).toHaveBeenCalledWith(mockClient, APP_UUID);
      expect(mockClient.get).toHaveBeenCalledWith(
        `/api/admin/applications/${APP_UUID}/claims/users/${USER_UUID}`,
      );
      expect(printTable).toHaveBeenCalled();
    });

    it('should warn when no claim values found', async () => {
      mockClient.get.mockResolvedValue({ status: 200, data: { data: [] } });

      const handlers = getHandlers();
      await handlers['get'](createArgv({ 'user-id': USER_UUID, app: APP_UUID }));

      expect(warn).toHaveBeenCalledWith('No claim values found');
    });
  });

  // ── claims delete ─────────────────────────────────────────────────

  describe('claims delete', () => {
    it('should cancel when confirm rejects', async () => {
      vi.mocked(confirm).mockResolvedValue(false);

      const handlers = getHandlers();
      await handlers['delete'](createArgv({
        'user-id': USER_UUID,
        app: APP_UUID,
        'claim-id': CLAIM_UUID,
      }));

      expect(warn).toHaveBeenCalledWith('Operation cancelled');
      expect(mockClient.delete).not.toHaveBeenCalled();
    });

    it('should resolve app and DELETE claim value on confirmation', async () => {
      mockClient.delete.mockResolvedValue({ status: 204, data: {} });

      const handlers = getHandlers();
      await handlers['delete'](createArgv({
        'user-id': USER_UUID,
        app: APP_UUID,
        'claim-id': CLAIM_UUID,
        force: true,
      }));

      expect(mockResolveApp).toHaveBeenCalledWith(mockClient, APP_UUID);
      expect(mockClient.delete).toHaveBeenCalledWith(
        `/api/admin/applications/${APP_UUID}/claims/${CLAIM_UUID}/users/${USER_UUID}`,
      );
      expect(success).toHaveBeenCalledWith(expect.stringContaining(USER_UUID.substring(0, 8)));
    });
  });

  // ── metadata ──────────────────────────────────────────────────────

  describe('metadata', () => {
    it('should export command name "claims"', () => {
      expect(userClaimCommand.command).toBe('claims');
    });

    it('should have a describe string', () => {
      expect(userClaimCommand.describe).toBeDefined();
    });
  });
});

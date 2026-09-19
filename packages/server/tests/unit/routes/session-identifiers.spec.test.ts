import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/middleware/admin-auth.js', () => ({
  requireAdminAuth: () => async (_ctx: unknown, next: () => Promise<void>) => next(),
}));

vi.mock('../../../src/middleware/require-permission.js', () => ({
  requirePermission: () => async (_ctx: unknown, next: () => Promise<void>) => next(),
}));

vi.mock('../../../src/lib/session-tracking.js', () => ({
  getSessionByPublicId: vi.fn(),
  listSessions: vi.fn(),
  revokeSessionByPublicId: vi.fn(),
}));

vi.mock('../../../src/lib/database.js', () => ({
  afterDatabaseCommit: vi.fn(),
}));

vi.mock('../../../src/lib/redis.js', () => ({
  getRedis: vi.fn(),
}));

import * as sessionTracking from '../../../src/lib/session-tracking.js';
import { createSessionRouter } from '../../../src/routes/sessions.js';

/** Execute the final handler for one session route. */
async function execute(method: 'GET' | 'DELETE', sessionId: string): Promise<void> {
  const layer = createSessionRouter().stack.find(
    (candidate) => candidate.methods.includes(method) && candidate.path.endsWith('/:sessionId'),
  );
  if (layer === undefined) throw new Error('session route is absent');
  const ctx = {
    params: { sessionId },
    throw(status: number, message: string): never {
      const error = new Error(message) as Error & { status: number };
      error.status = status;
      throw error;
    },
  };
  await layer.stack[layer.stack.length - 1](ctx as never, vi.fn());
}

describe('administrative session identifier validation', () => {
  beforeEach(() => vi.clearAllMocks());

  // Malformed identifiers are client errors and must not reach persistence or become server failures.
  it.each(['GET', 'DELETE'] as const)(
    'should return HTTP 400 for malformed %s identifiers',
    async (method) => {
      await expect(execute(method, 'not-a-uuid')).rejects.toMatchObject({
        status: 400,
        message: 'Session request is invalid',
      });
      expect(sessionTracking.getSessionByPublicId).not.toHaveBeenCalled();
      expect(sessionTracking.revokeSessionByPublicId).not.toHaveBeenCalled();
    },
  );
});

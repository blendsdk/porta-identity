import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const afterCommitEffects: Array<() => Promise<void>> = [];
const redis = {
  del: vi.fn().mockResolvedValue(0),
  eval: vi.fn().mockResolvedValue(0),
  mget: vi.fn().mockResolvedValue([]),
  scan: vi.fn().mockResolvedValue(['0', []]),
};

vi.mock('../../../src/lib/database.js', () => ({
  afterDatabaseCommit: vi.fn(async (effect: () => Promise<void>) => {
    afterCommitEffects.push(effect);
  }),
}));

vi.mock('../../../src/lib/redis.js', () => ({
  getRedis: vi.fn(() => redis),
}));

vi.mock('../../../src/lib/logger.js', () => ({
  logger: { warn: vi.fn() },
}));

import { logger } from '../../../src/lib/logger.js';
import {
  registerDeletionCleanup,
  type DeletionCleanupDescriptor,
} from '../../../src/lib/deletion-cleanup.js';

/** Create complete cleanup input with focused overrides. */
function descriptor(overrides: Partial<DeletionCleanupDescriptor> = {}): DeletionCleanupDescriptor {
  return {
    resource: 'user',
    targetId: 'user-1',
    userIds: [],
    clientIds: [],
    publicClientIds: [],
    grantIds: [],
    roleIds: [],
    permissionIds: [],
    claimIds: [],
    applicationIds: [],
    ...overrides,
  };
}

/** Run the registered post-commit hook and its one detached callback. */
async function runDetached(callbacks: Array<() => void>): Promise<void> {
  expect(afterCommitEffects).toHaveLength(1);
  await afterCommitEffects[0]!();
  expect(callbacks).toHaveLength(1);
  callbacks[0]!();
  await vi.waitFor(() => expect(redis.scan).toHaveBeenCalled());
}

describe('deletion cleanup implementation', () => {
  let immediateCallbacks: Array<() => void>;

  beforeEach(() => {
    vi.clearAllMocks();
    afterCommitEffects.length = 0;
    immediateCallbacks = [];
    vi.spyOn(globalThis, 'setImmediate').mockImplementation(((callback: () => void) => {
      immediateCallbacks.push(callback);
      return {} as NodeJS.Immediate;
    }) as typeof setImmediate);
    redis.scan.mockResolvedValue(['0', []]);
    redis.mget.mockResolvedValue([]);
    redis.del.mockResolvedValue(0);
    redis.eval.mockResolvedValue(0);
  });

  afterEach(() => vi.restoreAllMocks());

  it('copies and freezes descriptor collections before post-commit scheduling', async () => {
    const userIds = ['user-1'];
    await registerDeletionCleanup(descriptor({ userIds }));
    userIds.push('user-late');

    await runDetached(immediateCallbacks);

    const exactDelete = redis.del.mock.calls[0]?.map(String) ?? [];
    expect(exactDelete).toContain('user:id:user-1');
    expect(exactDelete).not.toContain('user:id:user-late');
  });

  it('terminates the cursor pass and inspects only namespaced OIDC main keys', async () => {
    redis.scan
      .mockResolvedValueOnce([
        '7',
        [
          'oidc:Session:session-1',
          'oidc:Session:uid:index-only',
          'oidc:Unknown:unknown-1',
          'other:Session:foreign-1',
        ],
      ])
      .mockResolvedValueOnce(['0', []]);
    redis.mget.mockResolvedValueOnce([
      JSON.stringify({ accountId: 'user-1', uid: 'uid-1', userCode: 'code-1' }),
    ]);

    await registerDeletionCleanup(descriptor({ userIds: ['user-1'] }));
    await runDetached(immediateCallbacks);

    expect(redis.scan).toHaveBeenCalledTimes(2);
    expect(redis.scan.mock.calls[0]?.[0]).toBe('0');
    expect(redis.scan.mock.calls[1]?.[0]).toBe('7');
    expect(redis.mget).toHaveBeenCalledWith('oidc:Session:session-1');
    expect(redis.del).toHaveBeenCalledWith(
      'oidc:Session:session-1',
      'oidc:Session:uid:uid-1',
      'oidc:Session:user_code:code-1',
    );
  });

  it('uses compare-before-delete for reusable organization slug keys', async () => {
    await registerDeletionCleanup(
      descriptor({ resource: 'organization', targetId: 'org-1', targetSlug: 'acme' }),
    );
    await runDetached(immediateCallbacks);

    expect(redis.eval).toHaveBeenCalledOnce();
    const [script, keyCount, key, id] = redis.eval.mock.calls[0]!;
    expect(String(script)).toMatch(/GET[\s\S]*decoded\['id'\][\s\S]*DEL/);
    expect([keyCount, key, id]).toEqual([1, 'org:slug:acme', 'org-1']);
  });

  it('absorbs Redis failure with one fixed identifier-free warning', async () => {
    redis.del.mockRejectedValueOnce(new Error('redis failed for user-1'));
    await registerDeletionCleanup(descriptor({ userIds: ['user-1'] }));
    await afterCommitEffects[0]!();
    immediateCallbacks[0]!();

    await vi.waitFor(() => expect(logger.warn).toHaveBeenCalledOnce());
    expect(logger.warn).toHaveBeenCalledWith(
      { event: 'deletion-redis-cleanup-failed' },
      'Deletion Redis cleanup failed',
    );
    expect(JSON.stringify(vi.mocked(logger.warn).mock.calls)).not.toContain('user-1');
    expect(JSON.stringify(vi.mocked(logger.warn).mock.calls)).not.toContain('redis failed');
  });
});

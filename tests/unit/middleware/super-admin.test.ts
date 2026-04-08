import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requireSuperAdmin } from '../../../src/middleware/super-admin.js';

function createMockCtx(org?: { isSuperAdmin: boolean }) {
  return {
    state: org ? { organization: org } : {},
    throw: vi.fn((status: number, message: string) => {
      const err = new Error(message) as Error & { status: number };
      err.status = status;
      throw err;
    }),
  };
}

describe('super-admin middleware', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should call next() when organization is super-admin', async () => {
    const middleware = requireSuperAdmin();
    const ctx = createMockCtx({ isSuperAdmin: true });
    const next = vi.fn();

    await middleware(ctx as never, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('should throw 403 when organization is not super-admin', async () => {
    const middleware = requireSuperAdmin();
    const ctx = createMockCtx({ isSuperAdmin: false });
    const next = vi.fn();

    await expect(middleware(ctx as never, next)).rejects.toThrow('Super-admin access required');
    expect(ctx.throw).toHaveBeenCalledWith(403, 'Super-admin access required');
    expect(next).not.toHaveBeenCalled();
  });

  it('should throw 403 when no organization on ctx.state', async () => {
    const middleware = requireSuperAdmin();
    const ctx = createMockCtx(); // no org
    const next = vi.fn();

    await expect(middleware(ctx as never, next)).rejects.toThrow('Super-admin access required');
    expect(next).not.toHaveBeenCalled();
  });

  it('should throw 403 when organization is null', async () => {
    const middleware = requireSuperAdmin();
    const ctx = {
      state: { organization: null },
      throw: vi.fn((status: number, message: string) => {
        const err = new Error(message) as Error & { status: number };
        err.status = status;
        throw err;
      }),
    };
    const next = vi.fn();

    await expect(middleware(ctx as never, next)).rejects.toThrow('Super-admin access required');
  });

  it('should not modify ctx.state', async () => {
    const middleware = requireSuperAdmin();
    const org = { isSuperAdmin: true, id: 'test-id' };
    const ctx = createMockCtx(org);
    const next = vi.fn();

    await middleware(ctx as never, next);

    // Organization should remain unchanged
    expect(ctx.state.organization).toEqual(org);
  });
});

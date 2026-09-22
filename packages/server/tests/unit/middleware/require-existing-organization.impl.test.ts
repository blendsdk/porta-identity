import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/organizations/service.js', () => ({ getOrganizationById: vi.fn() }));

import { requireExistingOrganization } from '../../../src/middleware/require-existing-organization.js';
import { getOrganizationById } from '../../../src/organizations/service.js';

const organizationId = '10000000-0000-4000-8000-000000000001';

/** Creates a minimal Koa-compatible context without exposing response internals. */
function context(params: Record<string, string>) {
  return { params, status: 200, body: undefined as unknown };
}

describe('requireExistingOrganization', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should continue when the path names an existing organization', async () => {
    vi.mocked(getOrganizationById).mockResolvedValue({ id: organizationId } as never);
    const next = vi.fn();
    const ctx = context({ orgId: organizationId });

    await requireExistingOrganization()(ctx as never, next);

    expect(next).toHaveBeenCalledOnce();
    expect(ctx.status).toBe(200);
  });

  it('should return one non-enumerating 404 for a malformed identifier', async () => {
    const next = vi.fn();
    const ctx = context({ orgId: 'not-a-uuid' });

    await requireExistingOrganization()(ctx as never, next);

    expect(getOrganizationById).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
    expect(ctx.status).toBe(404);
    expect(ctx.body).toEqual({ error: 'Organization not found' });
  });

  it('should return 404 when the organization does not exist', async () => {
    vi.mocked(getOrganizationById).mockResolvedValue(null);
    const next = vi.fn();
    const ctx = context({ orgId: organizationId });

    await requireExistingOrganization()(ctx as never, next);

    expect(next).not.toHaveBeenCalled();
    expect(ctx.status).toBe(404);
  });

  it('should propagate storage failures without converting them to a not-found response', async () => {
    vi.mocked(getOrganizationById).mockRejectedValue(new Error('storage unavailable'));
    const next = vi.fn();
    const ctx = context({ orgId: organizationId });

    await expect(requireExistingOrganization()(ctx as never, next)).rejects.toThrow(
      'storage unavailable',
    );
    expect(next).not.toHaveBeenCalled();
  });
});

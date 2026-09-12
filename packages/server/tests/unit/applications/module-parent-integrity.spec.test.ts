import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApplicationModule } from '../../../src/applications/types.js';

vi.mock('../../../src/applications/repository.js', () => ({
  insertApplication: vi.fn(),
  findApplicationById: vi.fn(),
  findApplicationBySlug: vi.fn(),
  updateApplication: vi.fn(),
  listApplications: vi.fn(),
  slugExists: vi.fn(),
  insertModule: vi.fn(),
  findModuleById: vi.fn(),
  updateModule: vi.fn(),
  listModules: vi.fn(),
  moduleSlugExists: vi.fn(),
}));

vi.mock('../../../src/applications/cache.js', () => ({
  getCachedApplicationById: vi.fn(),
  getCachedApplicationBySlug: vi.fn(),
  cacheApplication: vi.fn(),
  invalidateApplicationCache: vi.fn(),
}));

vi.mock('../../../src/lib/audit-log.js', () => ({ writeAuditLog: vi.fn() }));

import {
  findModuleById,
  updateModule as updateModuleRow,
} from '../../../src/applications/repository.js';
import { deactivateModule, updateModule } from '../../../src/applications/service.js';
import { ApplicationNotFoundError } from '../../../src/applications/errors.js';

const APPLICATION_A = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const APPLICATION_B = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';
const MODULE_ID = 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33';

/** Return a module owned by application B. */
function foreignModule(): ApplicationModule {
  return {
    id: MODULE_ID,
    applicationId: APPLICATION_B,
    name: 'Foreign module',
    slug: 'foreign-module',
    description: null,
    status: 'active',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };
}

describe('application module parent-integrity specification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(findModuleById).mockResolvedValue(foreignModule());
    vi.mocked(updateModuleRow).mockResolvedValue(foreignModule());
  });

  it('ST-06 rejects updating a module through a different application without mutation', async () => {
    const operation = Reflect.apply(updateModule, undefined, [
      APPLICATION_A,
      MODULE_ID,
      { name: 'Must not be applied' },
    ]);

    await expect(operation).rejects.toBeInstanceOf(ApplicationNotFoundError);
    expect(updateModuleRow).not.toHaveBeenCalled();
  });

  it('ST-06 rejects deactivating a module through a different application without mutation', async () => {
    const operation = Reflect.apply(deactivateModule, undefined, [APPLICATION_A, MODULE_ID]);

    await expect(operation).rejects.toBeInstanceOf(ApplicationNotFoundError);
    expect(updateModuleRow).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies — vi.mock factories are hoisted, use inline objects
vi.mock('../../../src/custom-claims/repository.js', () => ({
  insertDefinition: vi.fn(),
  findDefinitionById: vi.fn(),
  findDefinitionByName: vi.fn(),
  updateDefinition: vi.fn(),
  deleteDefinition: vi.fn(),
  listDefinitionsByApplication: vi.fn(),
  claimNameExists: vi.fn(),
  upsertValue: vi.fn(),
  findValue: vi.fn(),
  deleteValue: vi.fn(),
  getValuesForUser: vi.fn(),
  getValuesForUserByApp: vi.fn(),
}));

vi.mock('../../../src/custom-claims/cache.js', () => ({
  getCachedDefinitions: vi.fn(),
  setCachedDefinitions: vi.fn(),
  invalidateDefinitionsCache: vi.fn(),
}));

vi.mock('../../../src/lib/audit-log.js', () => ({
  writeAuditLog: vi.fn(),
}));

import {
  insertDefinition as repoInsert,
  findDefinitionById as repoFindById,
  updateDefinition as repoUpdate,
  deleteDefinition as repoDelete,
  listDefinitionsByApplication as repoList,
  claimNameExists,
  upsertValue as repoUpsert,
  findValue as repoFind,
  deleteValue as repoDeleteVal,
  getValuesForUser as repoGetValues,
  getValuesForUserByApp as repoGetByApp,
} from '../../../src/custom-claims/repository.js';
import {
  getCachedDefinitions,
  setCachedDefinitions,
  invalidateDefinitionsCache,
} from '../../../src/custom-claims/cache.js';
import { writeAuditLog } from '../../../src/lib/audit-log.js';
import {
  createDefinition,
  updateDefinition,
  deleteDefinition,
  findDefinitionById,
  listDefinitions,
  setValue,
  getValue,
  deleteValue,
  getValuesForUser,
  buildCustomClaims,
} from '../../../src/custom-claims/service.js';
import { ClaimNotFoundError, ClaimValidationError } from '../../../src/custom-claims/errors.js';
import type { CustomClaimDefinition, CustomClaimValue, CustomClaimWithValue } from '../../../src/custom-claims/types.js';

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

const now = new Date('2025-06-01T10:00:00Z');

const sampleDef: CustomClaimDefinition = {
  id: 'def-uuid-1',
  applicationId: 'app-uuid-1',
  claimName: 'department',
  claimType: 'string',
  description: 'User department',
  includeInIdToken: false,
  includeInAccessToken: true,
  includeInUserinfo: true,
  createdAt: now,
  updatedAt: now,
};

const sampleVal: CustomClaimValue = {
  id: 'val-uuid-1',
  userId: 'user-uuid-1',
  claimId: 'def-uuid-1',
  value: 'Engineering',
  createdAt: now,
  updatedAt: now,
};

beforeEach(() => {
  vi.clearAllMocks();
  // Reset default mock return values that tests depend on
  vi.mocked(claimNameExists).mockResolvedValue(false);
  vi.mocked(repoFindById).mockResolvedValue(null);
  vi.mocked(getCachedDefinitions).mockResolvedValue(null);
  vi.mocked(repoDeleteVal).mockResolvedValue(true);
});

// ===========================================================================
// Definition Management
// ===========================================================================

describe('createDefinition', () => {
  it('should create a definition with valid name', async () => {
    vi.mocked(repoInsert).mockResolvedValue(sampleDef);

    const result = await createDefinition({
      applicationId: 'app-uuid-1',
      claimName: 'department',
      claimType: 'string',
    });

    expect(result.claimName).toBe('department');
    expect(repoInsert).toHaveBeenCalledOnce();
    expect(invalidateDefinitionsCache).toHaveBeenCalledWith('app-uuid-1');
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'claim.defined' }),
    );
  });

  it('should throw ClaimValidationError for reserved claim name', async () => {
    await expect(
      createDefinition({
        applicationId: 'app-uuid-1',
        claimName: 'sub',
        claimType: 'string',
      }),
    ).rejects.toThrow(ClaimValidationError);
    expect(repoInsert).not.toHaveBeenCalled();
  });

  it('should throw ClaimValidationError for invalid name format', async () => {
    await expect(
      createDefinition({
        applicationId: 'app-uuid-1',
        claimName: 'Invalid-Name',
        claimType: 'string',
      }),
    ).rejects.toThrow(ClaimValidationError);
  });

  it('should throw ClaimValidationError for duplicate name', async () => {
    vi.mocked(claimNameExists).mockResolvedValue(true);

    await expect(
      createDefinition({
        applicationId: 'app-uuid-1',
        claimName: 'department',
        claimType: 'string',
      }),
    ).rejects.toThrow(ClaimValidationError);
    expect(repoInsert).not.toHaveBeenCalled();
  });
});

describe('updateDefinition', () => {
  it('should update an existing definition', async () => {
    vi.mocked(repoFindById).mockResolvedValue(sampleDef);
    const updated = { ...sampleDef, description: 'Updated' };
    vi.mocked(repoUpdate).mockResolvedValue(updated);

    const result = await updateDefinition('def-uuid-1', { description: 'Updated' });

    expect(result.description).toBe('Updated');
    expect(invalidateDefinitionsCache).toHaveBeenCalledWith('app-uuid-1');
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'claim.updated' }),
    );
  });

  it('should throw ClaimNotFoundError when definition not found', async () => {
    vi.mocked(repoFindById).mockResolvedValue(null);

    await expect(
      updateDefinition('nonexistent', { description: 'test' }),
    ).rejects.toThrow(ClaimNotFoundError);
  });
});

describe('deleteDefinition', () => {
  it('should delete an existing definition', async () => {
    vi.mocked(repoFindById).mockResolvedValue(sampleDef);
    vi.mocked(repoDelete).mockResolvedValue(true);

    await deleteDefinition('def-uuid-1');

    expect(repoDelete).toHaveBeenCalledWith('def-uuid-1');
    expect(invalidateDefinitionsCache).toHaveBeenCalledWith('app-uuid-1');
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'claim.deleted' }),
    );
  });

  it('should throw ClaimNotFoundError when definition not found', async () => {
    vi.mocked(repoFindById).mockResolvedValue(null);

    await expect(deleteDefinition('nonexistent')).rejects.toThrow(ClaimNotFoundError);
    expect(repoDelete).not.toHaveBeenCalled();
  });
});

describe('findDefinitionById', () => {
  it('should delegate to repository', async () => {
    vi.mocked(repoFindById).mockResolvedValue(sampleDef);

    const result = await findDefinitionById('def-uuid-1');
    expect(result).toBe(sampleDef);
  });

  it('should return null when not found', async () => {
    vi.mocked(repoFindById).mockResolvedValue(null);

    const result = await findDefinitionById('nonexistent');
    expect(result).toBeNull();
  });
});

describe('listDefinitions', () => {
  it('should return cached definitions on cache hit', async () => {
    vi.mocked(getCachedDefinitions).mockResolvedValue([sampleDef]);

    const result = await listDefinitions('app-uuid-1');

    expect(result).toHaveLength(1);
    expect(result[0].claimName).toBe('department');
    expect(repoList).not.toHaveBeenCalled(); // DB not queried
    expect(setCachedDefinitions).not.toHaveBeenCalled(); // Cache not re-set
  });

  it('should query DB and cache on cache miss', async () => {
    vi.mocked(getCachedDefinitions).mockResolvedValue(null);
    vi.mocked(repoList).mockResolvedValue([sampleDef]);

    const result = await listDefinitions('app-uuid-1');

    expect(result).toHaveLength(1);
    expect(repoList).toHaveBeenCalledWith('app-uuid-1');
    expect(setCachedDefinitions).toHaveBeenCalledWith('app-uuid-1', [sampleDef]);
  });

  it('should return empty array on cache miss with no definitions', async () => {
    vi.mocked(getCachedDefinitions).mockResolvedValue(null);
    vi.mocked(repoList).mockResolvedValue([]);

    const result = await listDefinitions('app-uuid-1');
    expect(result).toEqual([]);
  });
});

// ===========================================================================
// Value Management
// ===========================================================================

describe('setValue', () => {
  it('should set a valid string value', async () => {
    vi.mocked(repoFindById).mockResolvedValue(sampleDef);
    vi.mocked(repoUpsert).mockResolvedValue(sampleVal);

    const result = await setValue('user-uuid-1', 'def-uuid-1', 'Engineering');

    expect(result.value).toBe('Engineering');
    expect(repoUpsert).toHaveBeenCalledWith('user-uuid-1', 'def-uuid-1', 'Engineering');
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'claim.value.set' }),
    );
  });

  it('should throw ClaimNotFoundError when definition not found', async () => {
    vi.mocked(repoFindById).mockResolvedValue(null);

    await expect(
      setValue('user-uuid-1', 'nonexistent', 'value'),
    ).rejects.toThrow(ClaimNotFoundError);
    expect(repoUpsert).not.toHaveBeenCalled();
  });

  it('should throw ClaimValidationError on type mismatch', async () => {
    vi.mocked(repoFindById).mockResolvedValue(sampleDef); // string type

    await expect(
      setValue('user-uuid-1', 'def-uuid-1', 42), // number, not string
    ).rejects.toThrow(ClaimValidationError);
    expect(repoUpsert).not.toHaveBeenCalled();
  });

  it('should accept correct number value for number type', async () => {
    const numberDef = { ...sampleDef, claimType: 'number' as const };
    vi.mocked(repoFindById).mockResolvedValue(numberDef);
    vi.mocked(repoUpsert).mockResolvedValue({ ...sampleVal, value: 42 });

    const result = await setValue('user-uuid-1', 'def-uuid-1', 42);
    expect(result.value).toBe(42);
  });

  it('should accept correct boolean value for boolean type', async () => {
    const boolDef = { ...sampleDef, claimType: 'boolean' as const };
    vi.mocked(repoFindById).mockResolvedValue(boolDef);
    vi.mocked(repoUpsert).mockResolvedValue({ ...sampleVal, value: true });

    const result = await setValue('user-uuid-1', 'def-uuid-1', true);
    expect(result.value).toBe(true);
  });
});

describe('getValue', () => {
  it('should delegate to repository', async () => {
    vi.mocked(repoFind).mockResolvedValue(sampleVal);

    const result = await getValue('user-uuid-1', 'def-uuid-1');
    expect(result).toBe(sampleVal);
  });

  it('should return null when not found', async () => {
    vi.mocked(repoFind).mockResolvedValue(null);

    const result = await getValue('user-uuid-1', 'nonexistent');
    expect(result).toBeNull();
  });
});

describe('deleteValue', () => {
  it('should delete an existing value', async () => {
    vi.mocked(repoDeleteVal).mockResolvedValue(true);

    await deleteValue('user-uuid-1', 'def-uuid-1');

    expect(repoDeleteVal).toHaveBeenCalledWith('user-uuid-1', 'def-uuid-1');
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'claim.value.deleted' }),
    );
  });

  it('should throw ClaimNotFoundError when value not found', async () => {
    vi.mocked(repoDeleteVal).mockResolvedValue(false);

    await expect(
      deleteValue('user-uuid-1', 'nonexistent'),
    ).rejects.toThrow(ClaimNotFoundError);
  });
});

describe('getValuesForUser', () => {
  it('should delegate to repository', async () => {
    const pairs: CustomClaimWithValue[] = [{ definition: sampleDef, value: sampleVal }];
    vi.mocked(repoGetValues).mockResolvedValue(pairs);

    const result = await getValuesForUser('user-uuid-1');
    expect(result).toEqual(pairs);
  });
});

// ===========================================================================
// Token Claims Building
// ===========================================================================

describe('buildCustomClaims', () => {
  const deptDef: CustomClaimDefinition = {
    ...sampleDef,
    includeInIdToken: false,
    includeInAccessToken: true,
    includeInUserinfo: true,
  };

  const levelDef: CustomClaimDefinition = {
    ...sampleDef,
    id: 'def-uuid-2',
    claimName: 'level',
    claimType: 'number',
    includeInIdToken: true,
    includeInAccessToken: true,
    includeInUserinfo: false,
  };

  const claimsWithValues: CustomClaimWithValue[] = [
    { definition: deptDef, value: { ...sampleVal, value: 'Engineering' } },
    { definition: levelDef, value: { ...sampleVal, id: 'val-uuid-2', claimId: 'def-uuid-2', value: 5 } },
  ];

  it('should filter claims by access_token inclusion', async () => {
    vi.mocked(repoGetByApp).mockResolvedValue(claimsWithValues);

    const result = await buildCustomClaims('user-uuid-1', 'app-uuid-1', 'access_token');

    // Both included in access_token
    expect(result).toEqual({ department: 'Engineering', level: 5 });
  });

  it('should filter claims by id_token inclusion', async () => {
    vi.mocked(repoGetByApp).mockResolvedValue(claimsWithValues);

    const result = await buildCustomClaims('user-uuid-1', 'app-uuid-1', 'id_token');

    // Only level has includeInIdToken=true
    expect(result).toEqual({ level: 5 });
    expect(result).not.toHaveProperty('department');
  });

  it('should filter claims by userinfo inclusion', async () => {
    vi.mocked(repoGetByApp).mockResolvedValue(claimsWithValues);

    const result = await buildCustomClaims('user-uuid-1', 'app-uuid-1', 'userinfo');

    // Only department has includeInUserinfo=true
    expect(result).toEqual({ department: 'Engineering' });
    expect(result).not.toHaveProperty('level');
  });

  it('should return empty object when no values exist', async () => {
    vi.mocked(repoGetByApp).mockResolvedValue([]);

    const result = await buildCustomClaims('user-uuid-1', 'app-uuid-1', 'access_token');
    expect(result).toEqual({});
  });

  it('should return empty object when all claims excluded for token type', async () => {
    const excludedDef: CustomClaimDefinition = {
      ...sampleDef,
      includeInIdToken: false,
      includeInAccessToken: false,
      includeInUserinfo: false,
    };
    vi.mocked(repoGetByApp).mockResolvedValue([
      { definition: excludedDef, value: sampleVal },
    ]);

    const result = await buildCustomClaims('user-uuid-1', 'app-uuid-1', 'id_token');
    expect(result).toEqual({});
  });

  it('should preserve JSON object values', async () => {
    const jsonDef: CustomClaimDefinition = {
      ...sampleDef,
      claimName: 'metadata',
      claimType: 'json',
      includeInAccessToken: true,
    };
    const jsonVal = { ...sampleVal, value: { team: 'Platform', org: 'Engineering' } };
    vi.mocked(repoGetByApp).mockResolvedValue([{ definition: jsonDef, value: jsonVal }]);

    const result = await buildCustomClaims('user-uuid-1', 'app-uuid-1', 'access_token');
    expect(result.metadata).toEqual({ team: 'Platform', org: 'Engineering' });
  });
});

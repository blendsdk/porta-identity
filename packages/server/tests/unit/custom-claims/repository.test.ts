import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the database module — vi.mock factories are hoisted, use inline objects
vi.mock('../../../src/lib/database.js', () => ({
  getPool: vi.fn(),
}));

import { getPool } from '../../../src/lib/database.js';
import {
  insertDefinition,
  findDefinitionById,
  findDefinitionByName,
  updateDefinition,
  deleteDefinition,
  listDefinitionsByApplication,
  claimNameExists,
  upsertValue,
  findValue,
  deleteValue,
  getValuesForUser,
  getValuesForUserByApp,
} from '../../../src/custom-claims/repository.js';

// ---------------------------------------------------------------------------
// Mock setup
// ---------------------------------------------------------------------------

/** Helper to create a mock pool with a query function */
function createMockPool() {
  return { query: vi.fn() };
}

const now = new Date('2025-06-01T10:00:00Z');
const later = new Date('2025-06-02T12:00:00Z');

/** Sample definition row returned by pool.query */
const sampleDefRow = {
  id: 'def-uuid-1',
  application_id: 'app-uuid-1',
  claim_name: 'department',
  claim_type: 'string',
  description: 'User department',
  include_in_id_token: false,
  include_in_access_token: true,
  include_in_userinfo: true,
  created_at: now,
  updated_at: later,
};

/** Sample value row returned by pool.query */
const sampleValRow = {
  id: 'val-uuid-1',
  user_id: 'user-uuid-1',
  claim_id: 'def-uuid-1',
  value: 'Engineering',
  created_at: now,
  updated_at: later,
};

/** Sample joined row (definition + value) */
const sampleJoinedRow = {
  def_id: 'def-uuid-1',
  application_id: 'app-uuid-1',
  claim_name: 'department',
  claim_type: 'string',
  description: 'User department',
  include_in_id_token: false,
  include_in_access_token: true,
  include_in_userinfo: true,
  def_created_at: now,
  def_updated_at: later,
  val_id: 'val-uuid-1',
  user_id: 'user-uuid-1',
  claim_id: 'def-uuid-1',
  value: 'Engineering',
  val_created_at: now,
  val_updated_at: later,
};

let mockPool: ReturnType<typeof createMockPool>;

beforeEach(() => {
  vi.clearAllMocks();
  mockPool = createMockPool();
  vi.mocked(getPool).mockReturnValue(mockPool as never);
});

// ===========================================================================
// Claim Definitions
// ===========================================================================

describe('insertDefinition', () => {
  it('should insert a definition with all fields', async () => {
    mockPool.query.mockResolvedValue({ rows: [sampleDefRow] });

    const result = await insertDefinition({
      applicationId: 'app-uuid-1',
      claimName: 'department',
      claimType: 'string',
      description: 'User department',
      includeInIdToken: false,
      includeInAccessToken: true,
      includeInUserinfo: true,
    });

    expect(result.id).toBe('def-uuid-1');
    expect(result.claimName).toBe('department');
    expect(result.claimType).toBe('string');
    expect(mockPool.query).toHaveBeenCalledOnce();
    // Verify parameters include the input values
    const callArgs = mockPool.query.mock.calls[0][1];
    expect(callArgs[0]).toBe('app-uuid-1');
    expect(callArgs[1]).toBe('department');
    expect(callArgs[2]).toBe('string');
  });

  it('should use default inclusion flags when not provided', async () => {
    mockPool.query.mockResolvedValue({ rows: [sampleDefRow] });

    await insertDefinition({
      applicationId: 'app-uuid-1',
      claimName: 'department',
      claimType: 'string',
    });

    const callArgs = mockPool.query.mock.calls[0][1];
    // Defaults: id_token=false, access_token=true, userinfo=true
    expect(callArgs[4]).toBe(false);   // includeInIdToken
    expect(callArgs[5]).toBe(true);    // includeInAccessToken
    expect(callArgs[6]).toBe(true);    // includeInUserinfo
  });

  it('should pass null for optional description when not provided', async () => {
    mockPool.query.mockResolvedValue({ rows: [sampleDefRow] });

    await insertDefinition({
      applicationId: 'app-uuid-1',
      claimName: 'department',
      claimType: 'string',
    });

    const callArgs = mockPool.query.mock.calls[0][1];
    expect(callArgs[3]).toBeNull(); // description
  });
});

describe('findDefinitionById', () => {
  it('should return definition when found', async () => {
    mockPool.query.mockResolvedValue({ rows: [sampleDefRow] });

    const result = await findDefinitionById('def-uuid-1');

    expect(result).not.toBeNull();
    expect(result!.id).toBe('def-uuid-1');
    expect(result!.claimName).toBe('department');
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE id = $1'),
      ['def-uuid-1'],
    );
  });

  it('should return null when not found', async () => {
    mockPool.query.mockResolvedValue({ rows: [] });

    const result = await findDefinitionById('nonexistent');
    expect(result).toBeNull();
  });
});

describe('findDefinitionByName', () => {
  it('should return definition when found by application and name', async () => {
    mockPool.query.mockResolvedValue({ rows: [sampleDefRow] });

    const result = await findDefinitionByName('app-uuid-1', 'department');

    expect(result).not.toBeNull();
    expect(result!.claimName).toBe('department');
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('application_id = $1 AND claim_name = $2'),
      ['app-uuid-1', 'department'],
    );
  });

  it('should return null when not found', async () => {
    mockPool.query.mockResolvedValue({ rows: [] });

    const result = await findDefinitionByName('app-uuid-1', 'nonexistent');
    expect(result).toBeNull();
  });
});

describe('updateDefinition', () => {
  it('should update description field', async () => {
    const updatedRow = { ...sampleDefRow, description: 'Updated desc' };
    mockPool.query.mockResolvedValue({ rows: [updatedRow] });

    const result = await updateDefinition('def-uuid-1', { description: 'Updated desc' });

    expect(result.description).toBe('Updated desc');
    const sql = mockPool.query.mock.calls[0][0];
    expect(sql).toContain('description = $2');
  });

  it('should update multiple fields at once', async () => {
    const updatedRow = {
      ...sampleDefRow,
      include_in_id_token: true,
      include_in_access_token: false,
    };
    mockPool.query.mockResolvedValue({ rows: [updatedRow] });

    await updateDefinition('def-uuid-1', {
      includeInIdToken: true,
      includeInAccessToken: false,
    });

    const sql = mockPool.query.mock.calls[0][0];
    expect(sql).toContain('include_in_id_token');
    expect(sql).toContain('include_in_access_token');
  });

  it('should support setting description to null', async () => {
    const updatedRow = { ...sampleDefRow, description: null };
    mockPool.query.mockResolvedValue({ rows: [updatedRow] });

    const result = await updateDefinition('def-uuid-1', { description: null });

    expect(result.description).toBeNull();
    const callArgs = mockPool.query.mock.calls[0][1];
    expect(callArgs).toContain(null);
  });

  it('should throw when no fields provided', async () => {
    await expect(updateDefinition('def-uuid-1', {})).rejects.toThrow('No fields to update');
  });

  it('should throw when definition not found', async () => {
    mockPool.query.mockResolvedValue({ rows: [] });

    await expect(
      updateDefinition('nonexistent', { description: 'test' }),
    ).rejects.toThrow('Claim definition not found');
  });
});

describe('deleteDefinition', () => {
  it('should return true when definition is deleted', async () => {
    mockPool.query.mockResolvedValue({ rowCount: 1 });

    const result = await deleteDefinition('def-uuid-1');
    expect(result).toBe(true);
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM custom_claim_definitions'),
      ['def-uuid-1'],
    );
  });

  it('should return false when definition not found', async () => {
    mockPool.query.mockResolvedValue({ rowCount: 0 });

    const result = await deleteDefinition('nonexistent');
    expect(result).toBe(false);
  });

  it('should handle null rowCount gracefully', async () => {
    mockPool.query.mockResolvedValue({ rowCount: null });

    const result = await deleteDefinition('def-uuid-1');
    expect(result).toBe(false);
  });
});

describe('listDefinitionsByApplication', () => {
  it('should return all definitions for an application', async () => {
    const secondRow = { ...sampleDefRow, id: 'def-uuid-2', claim_name: 'team' };
    mockPool.query.mockResolvedValue({ rows: [sampleDefRow, secondRow] });

    const result = await listDefinitionsByApplication('app-uuid-1');

    expect(result).toHaveLength(2);
    expect(result[0].claimName).toBe('department');
    expect(result[1].claimName).toBe('team');
  });

  it('should return empty array when no definitions exist', async () => {
    mockPool.query.mockResolvedValue({ rows: [] });

    const result = await listDefinitionsByApplication('app-uuid-1');
    expect(result).toEqual([]);
  });

  it('should query with application ID and order by claim_name', async () => {
    mockPool.query.mockResolvedValue({ rows: [] });

    await listDefinitionsByApplication('app-uuid-1');

    const sql = mockPool.query.mock.calls[0][0];
    expect(sql).toContain('application_id = $1');
    expect(sql).toContain('ORDER BY claim_name ASC');
  });
});

describe('claimNameExists', () => {
  it('should return true when claim name exists', async () => {
    mockPool.query.mockResolvedValue({ rows: [{ exists: true }] });

    const result = await claimNameExists('app-uuid-1', 'department');
    expect(result).toBe(true);
  });

  it('should return false when claim name does not exist', async () => {
    mockPool.query.mockResolvedValue({ rows: [{ exists: false }] });

    const result = await claimNameExists('app-uuid-1', 'nonexistent');
    expect(result).toBe(false);
  });

  it('should exclude specific ID when provided', async () => {
    mockPool.query.mockResolvedValue({ rows: [{ exists: false }] });

    await claimNameExists('app-uuid-1', 'department', 'def-uuid-1');

    const sql = mockPool.query.mock.calls[0][0];
    expect(sql).toContain('id != $3');
    const args = mockPool.query.mock.calls[0][1];
    expect(args).toEqual(['app-uuid-1', 'department', 'def-uuid-1']);
  });

  it('should not include excludeId clause when not provided', async () => {
    mockPool.query.mockResolvedValue({ rows: [{ exists: true }] });

    await claimNameExists('app-uuid-1', 'department');

    const sql = mockPool.query.mock.calls[0][0];
    expect(sql).not.toContain('id !=');
    const args = mockPool.query.mock.calls[0][1];
    expect(args).toEqual(['app-uuid-1', 'department']);
  });
});

// ===========================================================================
// Claim Values
// ===========================================================================

describe('upsertValue', () => {
  it('should upsert a value and return mapped result', async () => {
    mockPool.query.mockResolvedValue({ rows: [sampleValRow] });

    const result = await upsertValue('user-uuid-1', 'def-uuid-1', 'Engineering');

    expect(result.id).toBe('val-uuid-1');
    expect(result.userId).toBe('user-uuid-1');
    expect(result.claimId).toBe('def-uuid-1');
    expect(result.value).toBe('Engineering');
  });

  it('should use ON CONFLICT for upsert semantics', async () => {
    mockPool.query.mockResolvedValue({ rows: [sampleValRow] });

    await upsertValue('user-uuid-1', 'def-uuid-1', 'value');

    const sql = mockPool.query.mock.calls[0][0];
    expect(sql).toContain('ON CONFLICT');
    expect(sql).toContain('DO UPDATE');
  });

  it('should JSON.stringify the value for JSONB storage', async () => {
    mockPool.query.mockResolvedValue({ rows: [sampleValRow] });

    await upsertValue('user-uuid-1', 'def-uuid-1', { key: 'val' });

    const args = mockPool.query.mock.calls[0][1];
    expect(args[2]).toBe('{"key":"val"}');
  });

  it('should stringify string values for JSONB', async () => {
    mockPool.query.mockResolvedValue({ rows: [sampleValRow] });

    await upsertValue('user-uuid-1', 'def-uuid-1', 'hello');

    const args = mockPool.query.mock.calls[0][1];
    expect(args[2]).toBe('"hello"');
  });

  it('should stringify number values for JSONB', async () => {
    mockPool.query.mockResolvedValue({ rows: [{ ...sampleValRow, value: 42 }] });

    await upsertValue('user-uuid-1', 'def-uuid-1', 42);

    const args = mockPool.query.mock.calls[0][1];
    expect(args[2]).toBe('42');
  });

  it('should stringify boolean values for JSONB', async () => {
    mockPool.query.mockResolvedValue({ rows: [{ ...sampleValRow, value: true }] });

    await upsertValue('user-uuid-1', 'def-uuid-1', true);

    const args = mockPool.query.mock.calls[0][1];
    expect(args[2]).toBe('true');
  });
});

describe('findValue', () => {
  it('should return value when found', async () => {
    mockPool.query.mockResolvedValue({ rows: [sampleValRow] });

    const result = await findValue('user-uuid-1', 'def-uuid-1');

    expect(result).not.toBeNull();
    expect(result!.value).toBe('Engineering');
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('user_id = $1 AND claim_id = $2'),
      ['user-uuid-1', 'def-uuid-1'],
    );
  });

  it('should return null when not found', async () => {
    mockPool.query.mockResolvedValue({ rows: [] });

    const result = await findValue('user-uuid-1', 'nonexistent');
    expect(result).toBeNull();
  });
});

describe('deleteValue', () => {
  it('should return true when value is deleted', async () => {
    mockPool.query.mockResolvedValue({ rowCount: 1 });

    const result = await deleteValue('user-uuid-1', 'def-uuid-1');
    expect(result).toBe(true);
  });

  it('should return false when value not found', async () => {
    mockPool.query.mockResolvedValue({ rowCount: 0 });

    const result = await deleteValue('user-uuid-1', 'nonexistent');
    expect(result).toBe(false);
  });

  it('should handle null rowCount gracefully', async () => {
    mockPool.query.mockResolvedValue({ rowCount: null });

    const result = await deleteValue('user-uuid-1', 'def-uuid-1');
    expect(result).toBe(false);
  });
});

// ===========================================================================
// Joined queries
// ===========================================================================

describe('getValuesForUser', () => {
  it('should return joined definition+value pairs', async () => {
    mockPool.query.mockResolvedValue({ rows: [sampleJoinedRow] });

    const result = await getValuesForUser('user-uuid-1');

    expect(result).toHaveLength(1);
    expect(result[0].definition.claimName).toBe('department');
    expect(result[0].definition.claimType).toBe('string');
    expect(result[0].value.value).toBe('Engineering');
    expect(result[0].value.userId).toBe('user-uuid-1');
  });

  it('should return empty array when no values exist', async () => {
    mockPool.query.mockResolvedValue({ rows: [] });

    const result = await getValuesForUser('user-uuid-1');
    expect(result).toEqual([]);
  });

  it('should query with user ID only (all apps)', async () => {
    mockPool.query.mockResolvedValue({ rows: [] });

    await getValuesForUser('user-uuid-1');

    const sql = mockPool.query.mock.calls[0][0];
    expect(sql).toContain('v.user_id = $1');
    expect(sql).not.toContain('d.application_id = $2');
    expect(mockPool.query.mock.calls[0][1]).toEqual(['user-uuid-1']);
  });

  it('should map joined rows with correct structure', async () => {
    mockPool.query.mockResolvedValue({ rows: [sampleJoinedRow] });

    const result = await getValuesForUser('user-uuid-1');

    // Verify definition fields
    const def = result[0].definition;
    expect(def.id).toBe('def-uuid-1');
    expect(def.applicationId).toBe('app-uuid-1');
    expect(def.includeInIdToken).toBe(false);
    expect(def.includeInAccessToken).toBe(true);
    expect(def.includeInUserinfo).toBe(true);
    expect(def.createdAt).toBe(now);
    expect(def.updatedAt).toBe(later);

    // Verify value fields
    const val = result[0].value;
    expect(val.id).toBe('val-uuid-1');
    expect(val.claimId).toBe('def-uuid-1');
    expect(val.createdAt).toBe(now);
    expect(val.updatedAt).toBe(later);
  });
});

describe('getValuesForUserByApp', () => {
  it('should return joined values filtered by application', async () => {
    mockPool.query.mockResolvedValue({ rows: [sampleJoinedRow] });

    const result = await getValuesForUserByApp('user-uuid-1', 'app-uuid-1');

    expect(result).toHaveLength(1);
    expect(result[0].definition.applicationId).toBe('app-uuid-1');
  });

  it('should return empty array when no values exist for the app', async () => {
    mockPool.query.mockResolvedValue({ rows: [] });

    const result = await getValuesForUserByApp('user-uuid-1', 'app-uuid-other');
    expect(result).toEqual([]);
  });

  it('should query with both user ID and application ID', async () => {
    mockPool.query.mockResolvedValue({ rows: [] });

    await getValuesForUserByApp('user-uuid-1', 'app-uuid-1');

    const sql = mockPool.query.mock.calls[0][0];
    expect(sql).toContain('v.user_id = $1');
    expect(sql).toContain('d.application_id = $2');
    expect(mockPool.query.mock.calls[0][1]).toEqual(['user-uuid-1', 'app-uuid-1']);
  });

  it('should handle multiple joined rows', async () => {
    const secondJoined = {
      ...sampleJoinedRow,
      def_id: 'def-uuid-2',
      claim_name: 'team',
      val_id: 'val-uuid-2',
      value: 'Platform',
    };
    mockPool.query.mockResolvedValue({ rows: [sampleJoinedRow, secondJoined] });

    const result = await getValuesForUserByApp('user-uuid-1', 'app-uuid-1');

    expect(result).toHaveLength(2);
    expect(result[0].definition.claimName).toBe('department');
    expect(result[1].definition.claimName).toBe('team');
    expect(result[1].value.value).toBe('Platform');
  });
});

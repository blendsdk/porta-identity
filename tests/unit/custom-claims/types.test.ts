import { describe, it, expect } from 'vitest';

import {
  mapRowToDefinition,
  mapRowToValue,
} from '../../../src/custom-claims/types.js';
import type {
  CustomClaimDefinitionRow,
  CustomClaimValueRow,
} from '../../../src/custom-claims/types.js';

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

const now = new Date('2025-06-01T10:00:00Z');
const later = new Date('2025-06-02T12:00:00Z');

const sampleDefinitionRow: CustomClaimDefinitionRow = {
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

const sampleValueRow: CustomClaimValueRow = {
  id: 'val-uuid-1',
  user_id: 'user-uuid-1',
  claim_id: 'def-uuid-1',
  value: 'Engineering',
  created_at: now,
  updated_at: later,
};

// ---------------------------------------------------------------------------
// mapRowToDefinition
// ---------------------------------------------------------------------------

describe('mapRowToDefinition', () => {
  it('should map all snake_case columns to camelCase properties', () => {
    const def = mapRowToDefinition(sampleDefinitionRow);

    expect(def.id).toBe('def-uuid-1');
    expect(def.applicationId).toBe('app-uuid-1');
    expect(def.claimName).toBe('department');
    expect(def.claimType).toBe('string');
    expect(def.description).toBe('User department');
    expect(def.includeInIdToken).toBe(false);
    expect(def.includeInAccessToken).toBe(true);
    expect(def.includeInUserinfo).toBe(true);
    expect(def.createdAt).toBe(now);
    expect(def.updatedAt).toBe(later);
  });

  it('should handle null description', () => {
    const row: CustomClaimDefinitionRow = { ...sampleDefinitionRow, description: null };
    const def = mapRowToDefinition(row);
    expect(def.description).toBeNull();
  });

  it('should handle different claim types', () => {
    const types = ['string', 'number', 'boolean', 'json'] as const;
    for (const claimType of types) {
      const row: CustomClaimDefinitionRow = { ...sampleDefinitionRow, claim_type: claimType };
      const def = mapRowToDefinition(row);
      expect(def.claimType).toBe(claimType);
    }
  });

  it('should preserve Date objects for timestamps', () => {
    const def = mapRowToDefinition(sampleDefinitionRow);
    expect(def.createdAt).toBeInstanceOf(Date);
    expect(def.updatedAt).toBeInstanceOf(Date);
  });

  it('should map all boolean inclusion flags correctly', () => {
    const row: CustomClaimDefinitionRow = {
      ...sampleDefinitionRow,
      include_in_id_token: true,
      include_in_access_token: false,
      include_in_userinfo: false,
    };
    const def = mapRowToDefinition(row);
    expect(def.includeInIdToken).toBe(true);
    expect(def.includeInAccessToken).toBe(false);
    expect(def.includeInUserinfo).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// mapRowToValue
// ---------------------------------------------------------------------------

describe('mapRowToValue', () => {
  it('should map all snake_case columns to camelCase properties', () => {
    const val = mapRowToValue(sampleValueRow);

    expect(val.id).toBe('val-uuid-1');
    expect(val.userId).toBe('user-uuid-1');
    expect(val.claimId).toBe('def-uuid-1');
    expect(val.value).toBe('Engineering');
    expect(val.createdAt).toBe(now);
    expect(val.updatedAt).toBe(later);
  });

  it('should preserve string values', () => {
    const row: CustomClaimValueRow = { ...sampleValueRow, value: 'Sales' };
    const val = mapRowToValue(row);
    expect(val.value).toBe('Sales');
  });

  it('should preserve number values', () => {
    const row: CustomClaimValueRow = { ...sampleValueRow, value: 42 };
    const val = mapRowToValue(row);
    expect(val.value).toBe(42);
  });

  it('should preserve boolean values', () => {
    const row: CustomClaimValueRow = { ...sampleValueRow, value: true };
    const val = mapRowToValue(row);
    expect(val.value).toBe(true);
  });

  it('should preserve JSON object values', () => {
    const jsonValue = { key: 'value', nested: { a: 1 } };
    const row: CustomClaimValueRow = { ...sampleValueRow, value: jsonValue };
    const val = mapRowToValue(row);
    expect(val.value).toEqual(jsonValue);
  });

  it('should preserve JSON array values', () => {
    const arrayValue = [1, 2, 'three'];
    const row: CustomClaimValueRow = { ...sampleValueRow, value: arrayValue };
    const val = mapRowToValue(row);
    expect(val.value).toEqual(arrayValue);
  });

  it('should preserve Date objects for timestamps', () => {
    const val = mapRowToValue(sampleValueRow);
    expect(val.createdAt).toBeInstanceOf(Date);
    expect(val.updatedAt).toBeInstanceOf(Date);
  });
});

import { describe, it, expect } from 'vitest';

import {
  RESERVED_CLAIM_NAMES,
  isReservedClaimName,
  validateClaimName,
  validateClaimValue,
} from '../../../src/custom-claims/validators.js';

// ---------------------------------------------------------------------------
// RESERVED_CLAIM_NAMES
// ---------------------------------------------------------------------------

describe('RESERVED_CLAIM_NAMES', () => {
  it('should contain OIDC Core JWT standard claims', () => {
    const jwtClaims = ['sub', 'iss', 'aud', 'exp', 'iat', 'nbf', 'jti', 'nonce', 'at_hash', 'c_hash'];
    for (const name of jwtClaims) {
      expect(RESERVED_CLAIM_NAMES.has(name)).toBe(true);
    }
  });

  it('should contain OpenID Connect Standard Claims', () => {
    const oidcClaims = [
      'name', 'given_name', 'family_name', 'middle_name', 'nickname',
      'preferred_username', 'profile', 'picture', 'website',
      'email', 'email_verified', 'gender', 'birthdate', 'zoneinfo', 'locale',
      'phone_number', 'phone_number_verified', 'address', 'updated_at',
    ];
    for (const name of oidcClaims) {
      expect(RESERVED_CLAIM_NAMES.has(name)).toBe(true);
    }
  });

  it('should contain Porta internal claims', () => {
    const portaClaims = ['roles', 'permissions', 'org_id', 'org_slug'];
    for (const name of portaClaims) {
      expect(RESERVED_CLAIM_NAMES.has(name)).toBe(true);
    }
  });

  it('should not contain non-reserved names', () => {
    expect(RESERVED_CLAIM_NAMES.has('department')).toBe(false);
    expect(RESERVED_CLAIM_NAMES.has('cost_center')).toBe(false);
    expect(RESERVED_CLAIM_NAMES.has('team_id')).toBe(false);
  });

  it('should be a ReadonlySet (frozen)', () => {
    // The set itself is readonly via TypeScript — verify it is a Set
    expect(RESERVED_CLAIM_NAMES).toBeInstanceOf(Set);
  });
});

// ---------------------------------------------------------------------------
// isReservedClaimName
// ---------------------------------------------------------------------------

describe('isReservedClaimName', () => {
  it('should return true for standard OIDC claims', () => {
    expect(isReservedClaimName('sub')).toBe(true);
    expect(isReservedClaimName('email')).toBe(true);
    expect(isReservedClaimName('name')).toBe(true);
  });

  it('should return true for Porta internal claims', () => {
    expect(isReservedClaimName('roles')).toBe(true);
    expect(isReservedClaimName('permissions')).toBe(true);
    expect(isReservedClaimName('org_id')).toBe(true);
    expect(isReservedClaimName('org_slug')).toBe(true);
  });

  it('should return false for custom claim names', () => {
    expect(isReservedClaimName('department')).toBe(false);
    expect(isReservedClaimName('cost_center')).toBe(false);
    expect(isReservedClaimName('custom_field')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateClaimName
// ---------------------------------------------------------------------------

describe('validateClaimName', () => {
  // Valid names
  it('should accept valid lowercase names', () => {
    expect(validateClaimName('department')).toEqual({ valid: true });
    expect(validateClaimName('team')).toEqual({ valid: true });
    expect(validateClaimName('a')).toEqual({ valid: true });
  });

  it('should accept names with underscores', () => {
    expect(validateClaimName('cost_center')).toEqual({ valid: true });
    expect(validateClaimName('team_id')).toEqual({ valid: true });
    expect(validateClaimName('my_custom_field')).toEqual({ valid: true });
  });

  it('should accept names with digits', () => {
    expect(validateClaimName('field1')).toEqual({ valid: true });
    expect(validateClaimName('level2_access')).toEqual({ valid: true });
  });

  it('should accept exactly 100 character name', () => {
    const name = 'a' + 'b'.repeat(99);
    expect(validateClaimName(name)).toEqual({ valid: true });
  });

  // Invalid: empty
  it('should reject empty string', () => {
    const result = validateClaimName('');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('empty');
  });

  // Invalid: length
  it('should reject names exceeding 100 characters', () => {
    const name = 'a' + 'b'.repeat(100); // 101 chars
    const result = validateClaimName(name);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('100');
  });

  // Invalid: format
  it('should reject names starting with a digit', () => {
    const result = validateClaimName('1field');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('lowercase letter');
  });

  it('should reject names starting with an underscore', () => {
    const result = validateClaimName('_field');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('lowercase letter');
  });

  it('should reject uppercase characters', () => {
    const result = validateClaimName('Department');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('lowercase');
  });

  it('should reject names with hyphens', () => {
    const result = validateClaimName('cost-center');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('lowercase');
  });

  it('should reject names with spaces', () => {
    const result = validateClaimName('my field');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('lowercase');
  });

  it('should reject names with special characters', () => {
    const names = ['field@name', 'field.name', 'field:name', 'field/name', 'field$name'];
    for (const name of names) {
      const result = validateClaimName(name);
      expect(result.valid).toBe(false);
    }
  });

  // Invalid: reserved
  it('should reject reserved OIDC claim names', () => {
    const result = validateClaimName('sub');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('reserved');
  });

  it('should reject reserved Porta claim names', () => {
    const result = validateClaimName('roles');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('reserved');

    const result2 = validateClaimName('permissions');
    expect(result2.valid).toBe(false);
    expect(result2.reason).toContain('reserved');
  });

  it('should reject email (reserved standard claim)', () => {
    const result = validateClaimName('email');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('reserved');
  });
});

// ---------------------------------------------------------------------------
// validateClaimValue
// ---------------------------------------------------------------------------

describe('validateClaimValue', () => {
  // String type
  describe('string type', () => {
    it('should accept string values', () => {
      expect(validateClaimValue('string', 'hello')).toEqual({ valid: true });
      expect(validateClaimValue('string', '')).toEqual({ valid: true });
      expect(validateClaimValue('string', 'a long string value')).toEqual({ valid: true });
    });

    it('should reject non-string values', () => {
      expect(validateClaimValue('string', 42).valid).toBe(false);
      expect(validateClaimValue('string', true).valid).toBe(false);
      expect(validateClaimValue('string', {}).valid).toBe(false);
      expect(validateClaimValue('string', []).valid).toBe(false);
    });
  });

  // Number type
  describe('number type', () => {
    it('should accept valid numbers', () => {
      expect(validateClaimValue('number', 42)).toEqual({ valid: true });
      expect(validateClaimValue('number', 0)).toEqual({ valid: true });
      expect(validateClaimValue('number', -1)).toEqual({ valid: true });
      expect(validateClaimValue('number', 3.14)).toEqual({ valid: true });
    });

    it('should reject NaN', () => {
      const result = validateClaimValue('number', NaN);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('finite');
    });

    it('should reject Infinity', () => {
      const result = validateClaimValue('number', Infinity);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('finite');

      const result2 = validateClaimValue('number', -Infinity);
      expect(result2.valid).toBe(false);
    });

    it('should reject non-number values', () => {
      expect(validateClaimValue('number', '42').valid).toBe(false);
      expect(validateClaimValue('number', true).valid).toBe(false);
      expect(validateClaimValue('number', {}).valid).toBe(false);
    });
  });

  // Boolean type
  describe('boolean type', () => {
    it('should accept boolean values', () => {
      expect(validateClaimValue('boolean', true)).toEqual({ valid: true });
      expect(validateClaimValue('boolean', false)).toEqual({ valid: true });
    });

    it('should reject non-boolean values', () => {
      expect(validateClaimValue('boolean', 'true').valid).toBe(false);
      expect(validateClaimValue('boolean', 1).valid).toBe(false);
      expect(validateClaimValue('boolean', 0).valid).toBe(false);
      expect(validateClaimValue('boolean', {}).valid).toBe(false);
    });
  });

  // JSON type
  describe('json type', () => {
    it('should accept plain objects', () => {
      expect(validateClaimValue('json', { key: 'value' })).toEqual({ valid: true });
      expect(validateClaimValue('json', {})).toEqual({ valid: true });
      expect(validateClaimValue('json', { nested: { a: 1 } })).toEqual({ valid: true });
    });

    it('should accept arrays', () => {
      expect(validateClaimValue('json', [1, 2, 3])).toEqual({ valid: true });
      expect(validateClaimValue('json', [])).toEqual({ valid: true });
      expect(validateClaimValue('json', [{ a: 1 }])).toEqual({ valid: true });
    });

    it('should reject primitive values for json type', () => {
      expect(validateClaimValue('json', 'string').valid).toBe(false);
      expect(validateClaimValue('json', 42).valid).toBe(false);
      expect(validateClaimValue('json', true).valid).toBe(false);
    });
  });

  // Null and undefined
  describe('null and undefined handling', () => {
    it('should reject null for all types', () => {
      expect(validateClaimValue('string', null).valid).toBe(false);
      expect(validateClaimValue('number', null).valid).toBe(false);
      expect(validateClaimValue('boolean', null).valid).toBe(false);
      expect(validateClaimValue('json', null).valid).toBe(false);
    });

    it('should reject undefined for all types', () => {
      expect(validateClaimValue('string', undefined).valid).toBe(false);
      expect(validateClaimValue('number', undefined).valid).toBe(false);
      expect(validateClaimValue('boolean', undefined).valid).toBe(false);
      expect(validateClaimValue('json', undefined).valid).toBe(false);
    });

    it('should include type info in null/undefined reason', () => {
      const result = validateClaimValue('string', null);
      expect(result.reason).toContain('string');
      expect(result.reason).toContain('null');
    });
  });

  // Unknown type
  describe('unknown claim type', () => {
    it('should reject unknown claim types', () => {
      // Force an unknown type via cast for edge case coverage
      const result = validateClaimValue('unknown' as 'string', 'value');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Unknown claim type');
    });
  });
});

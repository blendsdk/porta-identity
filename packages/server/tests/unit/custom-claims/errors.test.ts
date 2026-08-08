import { describe, it, expect } from 'vitest';

import {
  ClaimNotFoundError,
  ClaimValidationError,
} from '../../../src/custom-claims/errors.js';

// ---------------------------------------------------------------------------
// ClaimNotFoundError
// ---------------------------------------------------------------------------

describe('ClaimNotFoundError', () => {
  it('should set message with identifier', () => {
    const err = new ClaimNotFoundError('def-uuid-123');
    expect(err.message).toBe('Custom claim not found: def-uuid-123');
  });

  it('should set name to ClaimNotFoundError', () => {
    const err = new ClaimNotFoundError('test');
    expect(err.name).toBe('ClaimNotFoundError');
  });

  it('should be an instance of Error', () => {
    const err = new ClaimNotFoundError('test');
    expect(err).toBeInstanceOf(Error);
  });

  it('should include the identifier in the message for different inputs', () => {
    const err1 = new ClaimNotFoundError('department');
    expect(err1.message).toContain('department');

    const err2 = new ClaimNotFoundError('abc-def-ghi');
    expect(err2.message).toContain('abc-def-ghi');
  });
});

// ---------------------------------------------------------------------------
// ClaimValidationError
// ---------------------------------------------------------------------------

describe('ClaimValidationError', () => {
  it('should set the provided message', () => {
    const err = new ClaimValidationError('Claim name is reserved');
    expect(err.message).toBe('Claim name is reserved');
  });

  it('should set name to ClaimValidationError', () => {
    const err = new ClaimValidationError('test');
    expect(err.name).toBe('ClaimValidationError');
  });

  it('should be an instance of Error', () => {
    const err = new ClaimValidationError('test');
    expect(err).toBeInstanceOf(Error);
  });

  it('should preserve various error messages', () => {
    const messages = [
      'Claim name is reserved',
      'Value type mismatch: expected string, got number',
      'Duplicate claim name in application',
      'Invalid claim name format',
    ];

    for (const msg of messages) {
      const err = new ClaimValidationError(msg);
      expect(err.message).toBe(msg);
    }
  });
});

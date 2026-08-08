import { describe, it, expect } from 'vitest';
import { UserNotFoundError, UserValidationError } from '../../../src/users/errors.js';

describe('UserNotFoundError', () => {
  it('should have correct name', () => {
    const err = new UserNotFoundError('user-123');
    expect(err.name).toBe('UserNotFoundError');
  });

  it('should include identifier in message', () => {
    const err = new UserNotFoundError('user-uuid-abc');
    expect(err.message).toBe('User not found: user-uuid-abc');
    expect(err).toBeInstanceOf(Error);
  });
});

describe('UserValidationError', () => {
  it('should have correct name', () => {
    const err = new UserValidationError('Email already exists');
    expect(err.name).toBe('UserValidationError');
  });

  it('should include message', () => {
    const err = new UserValidationError('Invalid status transition');
    expect(err.message).toBe('Invalid status transition');
    expect(err).toBeInstanceOf(Error);
  });
});

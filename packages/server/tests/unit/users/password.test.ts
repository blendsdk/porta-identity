import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock argon2 to avoid slow hashing in tests
vi.mock('argon2', () => ({
  hash: vi.fn().mockResolvedValue('$argon2id$v=19$m=65536,t=3,p=4$mock_hash'),
  verify: vi.fn(),
  argon2id: 2,
}));

import * as argon2 from 'argon2';
import {
  validatePassword,
  hashPassword,
  verifyPassword,
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
} from '../../../src/users/password.js';

describe('validatePassword', () => {
  it('should accept valid password at minimum length', () => {
    const result = validatePassword('a'.repeat(MIN_PASSWORD_LENGTH));
    expect(result.isValid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should accept valid password at maximum length', () => {
    const result = validatePassword('a'.repeat(MAX_PASSWORD_LENGTH));
    expect(result.isValid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should reject password shorter than minimum', () => {
    const result = validatePassword('a'.repeat(MIN_PASSWORD_LENGTH - 1));
    expect(result.isValid).toBe(false);
    expect(result.error).toContain(`at least ${MIN_PASSWORD_LENGTH}`);
  });

  it('should reject password longer than maximum', () => {
    const result = validatePassword('a'.repeat(MAX_PASSWORD_LENGTH + 1));
    expect(result.isValid).toBe(false);
    expect(result.error).toContain(`at most ${MAX_PASSWORD_LENGTH}`);
  });

  it('should reject empty string', () => {
    const result = validatePassword('');
    expect(result.isValid).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe('hashPassword', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should return argon2id hash string', async () => {
    const hash = await hashPassword('test_password');
    expect(hash).toContain('$argon2id$');
    expect(argon2.hash).toHaveBeenCalledWith('test_password', { type: argon2.argon2id });
  });

  it('should produce different hashes for same input (random salt)', async () => {
    (argon2.hash as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce('$argon2id$hash_1')
      .mockResolvedValueOnce('$argon2id$hash_2');

    const hash1 = await hashPassword('same_password');
    const hash2 = await hashPassword('same_password');
    expect(hash1).not.toBe(hash2);
  });
});

describe('verifyPassword', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should return true for matching password', async () => {
    (argon2.verify as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    const result = await verifyPassword('$argon2id$hash', 'correct_password');
    expect(result).toBe(true);
    expect(argon2.verify).toHaveBeenCalledWith('$argon2id$hash', 'correct_password');
  });

  it('should return false for wrong password', async () => {
    (argon2.verify as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    const result = await verifyPassword('$argon2id$hash', 'wrong_password');
    expect(result).toBe(false);
  });

  it('should return false for invalid hash format', async () => {
    (argon2.verify as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('invalid hash'));
    const result = await verifyPassword('not_a_hash', 'password');
    expect(result).toBe(false);
  });
});

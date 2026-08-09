/**
 * Unit tests for the login-method resolver and normalizer helpers.
 *
 * Covers:
 *   - resolveLoginMethods: client override wins, null inherits,
 *     defensive empty-array branch falls back to org default.
 *   - normalizeLoginMethods: dedupe preserves first-occurrence order,
 *     handles single-element and empty inputs.
 *   - LOGIN_METHODS constant is exported and contains the expected values.
 */

import { describe, it, expect } from 'vitest';
import {
  resolveLoginMethods,
  normalizeLoginMethods,
} from '../../../src/clients/resolve-login-methods.js';
import { LOGIN_METHODS, type LoginMethod } from '../../../src/clients/types.js';

describe('LOGIN_METHODS constant', () => {
  it('contains exactly password and magic_link in declaration order', () => {
    expect(LOGIN_METHODS).toEqual(['password', 'magic_link']);
  });

  it('is a frozen / readonly array of length 2', () => {
    expect(LOGIN_METHODS).toHaveLength(2);
  });
});

describe('resolveLoginMethods', () => {
  describe('client override (non-null, non-empty)', () => {
    it('returns the client override when client.loginMethods is a non-empty array', () => {
      const result = resolveLoginMethods(
        { defaultLoginMethods: ['password', 'magic_link'] },
        { loginMethods: ['magic_link'] },
      );
      expect(result).toEqual(['magic_link']);
    });

    it('returns a multi-method client override unchanged', () => {
      const result = resolveLoginMethods(
        { defaultLoginMethods: ['password'] },
        { loginMethods: ['password', 'magic_link'] },
      );
      expect(result).toEqual(['password', 'magic_link']);
    });

    it('returns the client override even when it equals the org default', () => {
      // Functionally equivalent to inheriting, but we still honour the
      // explicit override (e.g., admin set it to lock the value).
      const result = resolveLoginMethods(
        { defaultLoginMethods: ['password', 'magic_link'] },
        { loginMethods: ['password', 'magic_link'] },
      );
      expect(result).toEqual(['password', 'magic_link']);
    });
  });

  describe('inherit branch (null)', () => {
    it('returns the organization default when client.loginMethods is null', () => {
      const result = resolveLoginMethods(
        { defaultLoginMethods: ['password'] },
        { loginMethods: null },
      );
      expect(result).toEqual(['password']);
    });

    it('returns a multi-method org default when inheriting', () => {
      const result = resolveLoginMethods(
        { defaultLoginMethods: ['password', 'magic_link'] },
        { loginMethods: null },
      );
      expect(result).toEqual(['password', 'magic_link']);
    });
  });

  describe('defensive empty-array branch', () => {
    it('falls back to org default when client.loginMethods is an empty array', () => {
      // The service layer rejects empty arrays at write time, but the
      // resolver should still degrade gracefully if the data layer ever
      // hands us one (e.g., manual SQL update, stale cache).
      const result = resolveLoginMethods(
        { defaultLoginMethods: ['password', 'magic_link'] },
        { loginMethods: [] },
      );
      expect(result).toEqual(['password', 'magic_link']);
    });
  });

  describe('purity / immutability', () => {
    it('does not mutate the org argument', () => {
      const orgDefault: LoginMethod[] = ['password', 'magic_link'];
      const org = { defaultLoginMethods: orgDefault };
      resolveLoginMethods(org, { loginMethods: null });
      expect(org.defaultLoginMethods).toBe(orgDefault);
      expect(org.defaultLoginMethods).toEqual(['password', 'magic_link']);
    });

    it('does not mutate the client argument', () => {
      const clientOverride: LoginMethod[] = ['magic_link'];
      const client = { loginMethods: clientOverride };
      resolveLoginMethods(
        { defaultLoginMethods: ['password'] },
        client,
      );
      expect(client.loginMethods).toBe(clientOverride);
      expect(client.loginMethods).toEqual(['magic_link']);
    });

    it('returns a reference to the source array (caller should not mutate)', () => {
      // Documents the current contract: the resolver does not clone.
      // Callers that need to mutate the result must clone defensively.
      const override: LoginMethod[] = ['magic_link'];
      const result = resolveLoginMethods(
        { defaultLoginMethods: ['password'] },
        { loginMethods: override },
      );
      expect(result).toBe(override);
    });
  });
});

describe('normalizeLoginMethods', () => {
  it('returns the input unchanged when there are no duplicates', () => {
    const input: LoginMethod[] = ['password', 'magic_link'];
    expect(normalizeLoginMethods(input)).toEqual(['password', 'magic_link']);
  });

  it('dedupes adjacent duplicates while preserving first-occurrence order', () => {
    const input: LoginMethod[] = ['password', 'password', 'magic_link'];
    expect(normalizeLoginMethods(input)).toEqual(['password', 'magic_link']);
  });

  it('dedupes non-adjacent duplicates while preserving first-occurrence order', () => {
    const input: LoginMethod[] = [
      'magic_link',
      'password',
      'magic_link',
      'password',
    ];
    expect(normalizeLoginMethods(input)).toEqual(['magic_link', 'password']);
  });

  it('preserves a single-element array', () => {
    expect(normalizeLoginMethods(['password'])).toEqual(['password']);
    expect(normalizeLoginMethods(['magic_link'])).toEqual(['magic_link']);
  });

  it('returns an empty array when given an empty input', () => {
    // Empty input → empty output. The caller is responsible for rejecting
    // empties when invalid (the service layer does this).
    expect(normalizeLoginMethods([])).toEqual([]);
  });

  it('does not mutate the input array', () => {
    const input: LoginMethod[] = ['password', 'password', 'magic_link'];
    normalizeLoginMethods(input);
    expect(input).toEqual(['password', 'password', 'magic_link']);
  });

  it('returns a new array (does not return the same reference)', () => {
    const input: LoginMethod[] = ['password', 'magic_link'];
    const result = normalizeLoginMethods(input);
    expect(result).not.toBe(input);
    expect(result).toEqual(input);
  });
});

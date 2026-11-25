/**
 * Implementation tests for the device page form and scope helpers.
 *
 * The provider form is trusted markup, not a template. The XSRF extraction is
 * therefore deliberately narrow, and the scope list is bounded before it is
 * rendered so provider state cannot grow the page without limit.
 */

import { describe, expect, it } from 'vitest';
import {
  extractProviderXsrf,
  readProviderScopes,
} from '../../../src/oidc/device-pages.js';

describe('extractProviderXsrf', () => {
  it('extracts the hidden provider value', () => {
    const form = '<form><input type="hidden" name="xsrf" value="abc123_-"/></form>';
    expect(extractProviderXsrf(form)).toBe('abc123_-');
  });

  it('returns an empty value for missing or malformed markup', () => {
    expect(extractProviderXsrf(undefined)).toBe('');
    expect(extractProviderXsrf('')).toBe('');
    expect(extractProviderXsrf('<form><input name="user_code"></form>')).toBe('');
    expect(extractProviderXsrf({ xsrf: 'not-markup' })).toBe('');
  });
});

describe('readProviderScopes', () => {
  it('splits and deduplicates scopes while preserving order', () => {
    expect(readProviderScopes('openid profile openid email')).toEqual([
      'openid',
      'profile',
      'email',
    ]);
  });

  it('rejects non-string and empty values', () => {
    expect(readProviderScopes(undefined)).toEqual([]);
    expect(readProviderScopes(['openid'])).toEqual([]);
    expect(readProviderScopes('   ')).toEqual([]);
  });

  it('bounds the scope count and each token length', () => {
    const long = 'a'.repeat(300);
    const scopes = readProviderScopes(
      Array.from({ length: 80 }, (_, index) => `${index}-${long}`).join(' '),
    );
    expect(scopes).toHaveLength(64);
    expect(scopes.every((scope) => scope.length <= 255)).toBe(true);
  });
});

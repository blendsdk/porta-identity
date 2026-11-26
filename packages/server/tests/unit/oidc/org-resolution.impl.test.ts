/**
 * Implementation tests for the shared organization/path helpers.
 *
 * These cases pin edge behavior that the HTTP layer is awkward to exercise:
 * tenant-prefix boundaries, encoded segments, overlong normalized codes and
 * character classes whose normalization is easy to get subtly wrong.
 */

import { describe, expect, it } from 'vitest';
import {
  boundedNormalizedUserCode,
  MAX_NORMALIZED_USER_CODE_LENGTH,
  normalizeUserCode,
  relativeOidcRoute,
  resolveOrganizationSlug,
} from '../../../src/oidc/org-resolution.js';

/** Build the minimal route context consumed by the helper. */
function route(
  path: string,
  method = 'GET',
  slug: string | undefined = 'acme',
): {
  path: string;
  method: string;
  params: Record<string, string | undefined>;
  state: { organization?: { slug?: string } };
} {
  return {
    path,
    method,
    params: {},
    state: slug === undefined ? {} : { organization: { slug } },
  };
}

describe('relativeOidcRoute boundaries', () => {
  it('does not strip a slug that is only a textual prefix of another segment', () => {
    expect(relativeOidcRoute(route('/acme-evil/device'))).toBe('/acme-evil/device');
    expect(relativeOidcRoute(route('/acme/device'))).toBe('/device');
  });

  it('returns a stable label for the organization root', () => {
    expect(relativeOidcRoute(route('/acme'))).toBe('/');
    expect(relativeOidcRoute(route('/acme/'))).toBe('/');
  });

  it('does not decode percent-encoded segments that the router does not match', () => {
    expect(relativeOidcRoute(route('/acme/%64evice'))).toBe('/%64evice');
    // A two-segment device route is a resume shape; the raw encoded UID is deliberately not decoded.
    expect(relativeOidcRoute(route('/acme/DEVICE/%41uth', 'POST'))).toBe('/device/:uid');
  });

  it('classifies a POST device authorization only at the exact shape', () => {
    expect(relativeOidcRoute(route('/acme/device/auth', 'POST'))).toBe('/device/auth');
    expect(relativeOidcRoute(route('/acme/device/auth/extra', 'POST'))).toBe('/device/auth/extra');
    expect(relativeOidcRoute(route('/acme/device/auth', 'GET'))).toBe('/device/:uid');
  });

  it('preserves the resume shape for mixed case and trailing slashes', () => {
    expect(relativeOidcRoute(route('/acme/DEVICE/AbC-123_x/'))).toBe('/device/:uid');
    expect(relativeOidcRoute(route('/acme/Device/AbC-123_x'))).toBe('/device/:uid');
  });
});

describe('normalizeUserCode character classes', () => {
  it('removes non-ASCII letters and symbols exactly like the provider', () => {
    expect(normalizeUserCode('ß')).toBe('');
    expect(normalizeUserCode('İ')).toBe('');
    expect(normalizeUserCode('ＢＣＤＦ－ＧＨＪＫ')).toBe('');
    expect(normalizeUserCode('BCDF-GHJK')).toBe('BCDFGHJK');
  });

  it('keeps underscores because they are word characters', () => {
    expect(normalizeUserCode('BCDF_GHJK')).toBe('BCDF_GHJK');
  });

  it('uppercases only ASCII lowercase letters', () => {
    expect(normalizeUserCode('bcdfghjk')).toBe('BCDFGHJK');
    expect(normalizeUserCode('ébcdf')).toBe('BCDF');
  });
});

describe('boundedNormalizedUserCode limits', () => {
  it('measures the normalized length, not the raw length', () => {
    const raw = Array.from({ length: MAX_NORMALIZED_USER_CODE_LENGTH }, () => 'A-').join('');
    expect(raw.length).toBeGreaterThan(MAX_NORMALIZED_USER_CODE_LENGTH);
    expect(boundedNormalizedUserCode(raw)).toBe(
      'A'.repeat(MAX_NORMALIZED_USER_CODE_LENGTH),
    );
  });

  it('rejects a normalized code above the limit', () => {
    expect(
      boundedNormalizedUserCode('A'.repeat(MAX_NORMALIZED_USER_CODE_LENGTH + 1)),
    ).toBeUndefined();
  });

  it('rejects values that normalize to nothing', () => {
    expect(boundedNormalizedUserCode('---')).toBeUndefined();
    expect(boundedNormalizedUserCode('ß ß')).toBeUndefined();
    expect(boundedNormalizedUserCode('   ')).toBeUndefined();
  });
});

describe('resolveOrganizationSlug', () => {
  it('accepts a non-empty slug and rejects malformed values', () => {
    expect(resolveOrganizationSlug({ slug: 'acme' })).toBe('acme');
    expect(resolveOrganizationSlug({ slug: '' })).toBeUndefined();
    expect(resolveOrganizationSlug({ slug: 42 })).toBeUndefined();
    expect(resolveOrganizationSlug(null)).toBeUndefined();
    expect(resolveOrganizationSlug(['acme'])).toBeUndefined();
  });
});

/**
 * Specification tests for the shared OIDC path and organization helpers.
 *
 * The same helpers drive device tenant binding and every device rate limiter.
 * Their contract is therefore part of the security boundary: tenant slugs are
 * stripped exactly, route matching is case-insensitive, resume UIDs keep their
 * case, and user-code normalization matches the provider byte for byte.
 */

import { describe, expect, it } from 'vitest';
import { normalize as providerNormalize } from 'oidc-provider/lib/helpers/user_codes.js';
import {
  boundedNormalizedUserCode,
  MAX_NORMALIZED_USER_CODE_LENGTH,
  normalizeUserCode,
  relativeOidcRoute,
  resolveOrganizationId,
} from '../../../src/oidc/org-resolution.js';

/** Build the minimal context shape consumed by `relativeOidcRoute`. */
function routeContext(
  path: string,
  method = 'GET',
  options: { slug?: string; uid?: string } = {},
): {
  path: string;
  method: string;
  params: Record<string, string | undefined>;
  state: { organization?: { slug?: string } };
} {
  return {
    path,
    method,
    params: { orgSlug: options.slug, uid: options.uid },
    state: options.slug === undefined ? {} : { organization: { slug: options.slug } },
  };
}

describe('relativeOidcRoute', () => {
  it('strips exactly the resolved organization slug', () => {
    expect(relativeOidcRoute(routeContext('/acme/device', 'GET', { slug: 'acme' }))).toBe('/device');
    expect(relativeOidcRoute(routeContext('/acme/token', 'POST', { slug: 'acme' }))).toBe('/token');
  });

  it('matches device routes case-insensitively and removes trailing slashes', () => {
    expect(relativeOidcRoute(routeContext('/acme/DEVICE', 'GET', { slug: 'acme' }))).toBe('/device');
    expect(relativeOidcRoute(routeContext('/acme/Device/Auth', 'POST', { slug: 'acme' }))).toBe(
      '/device/auth',
    );
    expect(relativeOidcRoute(routeContext('/acme/TOKEN', 'POST', { slug: 'acme' }))).toBe('/token');
    expect(relativeOidcRoute(routeContext('/acme/token/', 'POST', { slug: 'acme' }))).toBe('/token');
    expect(relativeOidcRoute(routeContext('/acme/device/', 'GET', { slug: 'acme' }))).toBe('/device');
  });

  it('returns the resume route without lowercasing the UID value', () => {
    expect(relativeOidcRoute(routeContext('/acme/device/AbC-123_x', 'GET', { slug: 'acme' }))).toBe(
      '/device/:uid',
    );
    expect(relativeOidcRoute(routeContext('/acme/DEVICE/AbC-123_x', 'GET', { slug: 'acme' }))).toBe(
      '/device/:uid',
    );
  });

  it('uses the tenant-resolved slug when router params are not populated yet', () => {
    expect(relativeOidcRoute(routeContext('/acme/device/auth', 'POST', { slug: 'acme' }))).toBe(
      '/device/auth',
    );
    expect(relativeOidcRoute(routeContext('/acme/device', 'GET', { slug: 'acme' }))).toBe('/device');
  });

  it('does not strip a different organization prefix', () => {
    expect(relativeOidcRoute(routeContext('/other/device', 'GET', { slug: 'acme' }))).toBe(
      '/other/device',
    );
  });
});

describe('resolveOrganizationId', () => {
  it('returns a non-empty string identifier', () => {
    expect(resolveOrganizationId({ id: 'organization-1' })).toBe('organization-1');
  });

  it('rejects malformed, empty and array values', () => {
    expect(resolveOrganizationId(undefined)).toBeUndefined();
    expect(resolveOrganizationId(null)).toBeUndefined();
    expect(resolveOrganizationId({})).toBeUndefined();
    expect(resolveOrganizationId({ id: '' })).toBeUndefined();
    expect(resolveOrganizationId({ id: 42 })).toBeUndefined();
    expect(resolveOrganizationId(['organization-1'])).toBeUndefined();
  });
});

describe('normalizeUserCode', () => {
  const samples = [
    'bcdf-ghjk',
    'BCDF GHJK',
    'BCDF_GHJK',
    'ßbcdf-ghjk',
    'İBCDF-GHJK',
    'ＢＣＤＦ－ＧＨＪＫ',
    'bCdF-gHjK',
  ];

  it('matches the provider normalization for every supported character class', () => {
    for (const sample of samples) {
      expect(normalizeUserCode(sample)).toBe(providerNormalize(sample));
    }
  });

  it('removes non-word characters but keeps underscores, like the provider', () => {
    expect(normalizeUserCode('BCDF_GHJK')).toBe('BCDF_GHJK');
    expect(normalizeUserCode('BCDF--GHJK')).toBe('BCDFGHJK');
    expect(normalizeUserCode('ßBCDFGHJK')).toBe('BCDFGHJK');
  });
});

describe('boundedNormalizedUserCode', () => {
  it('accepts a normalized value at the maximum length', () => {
    const atLimit = 'B'.repeat(MAX_NORMALIZED_USER_CODE_LENGTH);
    expect(boundedNormalizedUserCode(atLimit)).toBe(atLimit);
  });

  it('rejects malformed, overlong and non-string values before any lookup', () => {
    expect(boundedNormalizedUserCode('B'.repeat(MAX_NORMALIZED_USER_CODE_LENGTH + 1))).toBeUndefined();
    expect(boundedNormalizedUserCode(undefined)).toBeUndefined();
    expect(boundedNormalizedUserCode(['BCDF-GHJK'])).toBeUndefined();
    expect(boundedNormalizedUserCode({ user_code: 'BCDF-GHJK' })).toBeUndefined();
    expect(boundedNormalizedUserCode('')).toBeUndefined();
  });
});

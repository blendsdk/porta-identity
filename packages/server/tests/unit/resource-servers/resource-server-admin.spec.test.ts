/** Specification tests for resource-server Admin request validation. */

import { describe, expect, it } from 'vitest';

import { ResourceServerValidationError } from '../../../src/resource-servers/errors.js';
import {
  applicationPathSchema,
  createResourceServerSchema,
  normalizeScopes,
  resourceServerPathSchema,
  updateResourceServerSchema,
} from '../../../src/resource-servers/validators.js';

const IDENTIFIER = 'https://billing.example.test';
const AUDIENCE = 'https://api.billing.example.test';

describe('resource-server request validation', () => {
  it('accepts a minimal create body and defaults an omitted audience to undefined', () => {
    const parsed = createResourceServerSchema.parse({
      name: 'Billing API',
      identifier: IDENTIFIER,
    });

    expect(parsed.audience).toBeUndefined();
    expect(parsed.scopes).toEqual([]);
  });

  it.each([
    ['relative', 'billing'],
    ['fragment', `${IDENTIFIER}#fragment`],
    ['too long', `https://billing.example.test/${'a'.repeat(2049)}`],
  ])('rejects a %s identifier', (_label, identifier) => {
    expect(createResourceServerSchema.safeParse({ name: 'Billing API', identifier }).success).toBe(false);
  });

  it.each(['openid', 'profile', 'email', 'address', 'phone', 'offline_access'])(
    'rejects the standard OIDC scope %s',
    (scope) => {
      expect(
        createResourceServerSchema.safeParse({
          name: 'Billing API',
          identifier: IDENTIFIER,
          scopes: [scope],
        }).success,
      ).toBe(false);
    },
  );

  it('rejects duplicate custom scopes', () => {
    expect(
      createResourceServerSchema.safeParse({
        name: 'Billing API',
        identifier: IDENTIFIER,
        scopes: ['billing:read', 'billing:read'],
      }).success,
    ).toBe(false);
  });

  it('accepts a distinct audience and custom scopes', () => {
    const parsed = createResourceServerSchema.parse({
      name: 'Billing API',
      identifier: IDENTIFIER,
      audience: AUDIENCE,
      scopes: ['billing:read', 'billing:write'],
    });

    expect(parsed.audience).toBe(AUDIENCE);
    expect(parsed.scopes).toEqual(['billing:read', 'billing:write']);
  });

  it('requires name, slug, and identifier on update', () => {
    expect(updateResourceServerSchema.safeParse({ name: 'Billing API' }).success).toBe(false);
    expect(
      updateResourceServerSchema.safeParse({
        name: 'Billing API',
        slug: 'billing-api',
        identifier: IDENTIFIER,
      }).success,
    ).toBe(true);
  });

  it('rejects an invalid slug', () => {
    expect(
      createResourceServerSchema.safeParse({
        name: 'Billing API',
        slug: 'Not A Slug',
        identifier: IDENTIFIER,
      }).success,
    ).toBe(false);
  });

  it.each([
    'HTTPS://billing.example.test',
    ' https://billing.example.test',
    'https://billing.example.test ',
    'https://billing.example.test/\n',
    'https://billing.example.test/\u0000',
  ])('rejects the non-canonical URI %j', (identifier) => {
    expect(createResourceServerSchema.safeParse({ name: 'Billing API', identifier }).success).toBe(false);
  });

  it.each(['Billing\nAPI', 'Billing\u001bAPI', 'Billing\u0000API'])(
    'rejects control characters in the name %j',
    (name) => {
      expect(createResourceServerSchema.safeParse({ name, identifier: IDENTIFIER }).success).toBe(false);
    },
  );

  it('rejects a UUID-shaped resource-server slug', () => {
    expect(
      createResourceServerSchema.safeParse({
        name: 'Billing API',
        slug: '11111111-1111-4111-8111-111111111111',
        identifier: IDENTIFIER,
      }).success,
    ).toBe(false);
  });

  it('rejects malformed application and resource-server path identifiers', () => {
    expect(applicationPathSchema.safeParse({ appId: '!' }).success).toBe(false);
    expect(resourceServerPathSchema.safeParse({ appId: 'acme', resourceServerId: '!' }).success).toBe(false);
    expect(applicationPathSchema.safeParse({ appId: 'acme' }).success).toBe(true);
    expect(resourceServerPathSchema.safeParse({
      appId: 'acme',
      resourceServerId: 'billing-api',
    }).success).toBe(true);
  });

  it('rejects standard and duplicate scopes at the service boundary', () => {
    expect(() => normalizeScopes(['openid'])).toThrow(ResourceServerValidationError);
    expect(() => normalizeScopes(['billing:read', 'billing:read'])).toThrow(ResourceServerValidationError);
    expect(normalizeScopes(['billing:write', 'billing:read'])).toEqual(['billing:read', 'billing:write']);
  });
});

/**
 * Specification tests for the shared server client contract.
 *
 * The full device grant, the zero-redirect device-only client and the empty
 * response-type collection are one contract shared by the Admin API, the
 * service layer and portability. These cases are written before the
 * implementation and define the oracle.
 */

import { describe, expect, it } from 'vitest';
import {
  DEVICE_CODE_GRANT,
  clientGrantTypesSchema,
  clientResponseTypesSchema,
  redirectUrisSchema,
  validateClientProtocolCompatibility,
} from '../../../src/clients/validators.js';

/** Build a valid device-only public protocol configuration. */
function deviceOnly(overrides: Partial<Parameters<typeof validateClientProtocolCompatibility>[0]> = {}) {
  return {
    clientType: 'public' as const,
    redirectUris: [] as string[],
    grantTypes: [DEVICE_CODE_GRANT],
    responseTypes: [] as string[],
    tokenEndpointAuthMethod: 'none' as const,
    requirePkce: true,
    allowedOrigins: [] as string[],
    ...overrides,
  };
}

describe('client grant and response-type schemas', () => {
  it('accepts the full device URN and rejects unknown grants', () => {
    expect(clientGrantTypesSchema.safeParse([DEVICE_CODE_GRANT]).success).toBe(true);
    expect(clientGrantTypesSchema.safeParse(['urn:example:unknown']).success).toBe(false);
    expect(clientGrantTypesSchema.safeParse([]).success).toBe(false);
  });

  it('accepts an empty redirect collection for a device-only create', () => {
    expect(redirectUrisSchema.safeParse([]).success).toBe(true);
    expect(redirectUrisSchema.safeParse(['https://client.example/callback']).success).toBe(true);
    expect(redirectUrisSchema.safeParse(['not-a-url']).success).toBe(false);
  });

  it('accepts either zero or one code response type', () => {
    expect(clientResponseTypesSchema.safeParse([]).success).toBe(true);
    expect(clientResponseTypesSchema.safeParse(['code']).success).toBe(true);
    expect(clientResponseTypesSchema.safeParse(['code', 'code']).success).toBe(false);
    expect(clientResponseTypesSchema.safeParse(['token']).success).toBe(false);
  });
});

describe('validateClientProtocolCompatibility device contract', () => {
  it('accepts a public device-only client with empty redirects and response types', () => {
    const result = validateClientProtocolCompatibility(deviceOnly());
    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('accepts a confidential device-only client with a token endpoint method', () => {
    const result = validateClientProtocolCompatibility(
      deviceOnly({ clientType: 'confidential', tokenEndpointAuthMethod: 'client_secret_basic' }),
    );
    expect(result.isValid).toBe(true);
  });

  it('rejects a device-only client with a non-empty response type', () => {
    const result = validateClientProtocolCompatibility(deviceOnly({ responseTypes: ['code'] }));
    expect(result.isValid).toBe(false);
    expect(result.errors.join(' ')).toContain('response types');
  });

  it('rejects an authorization-code client with no redirect URI', () => {
    const result = validateClientProtocolCompatibility(
      deviceOnly({ grantTypes: ['authorization_code'], responseTypes: ['code'] }),
    );
    expect(result.isValid).toBe(false);
    expect(result.errors.join(' ')).toContain('redirectUris');
  });

  it('rejects a mixed device and authorization-code client with no redirect URI', () => {
    const result = validateClientProtocolCompatibility(
      deviceOnly({
        grantTypes: [DEVICE_CODE_GRANT, 'authorization_code'],
        responseTypes: ['code'],
      }),
    );
    expect(result.isValid).toBe(false);
    expect(result.errors.join(' ')).toContain('redirectUris');
  });

  it('keeps the public PKCE and confidential authentication invariants', () => {
    expect(validateClientProtocolCompatibility(deviceOnly({ requirePkce: false })).isValid).toBe(
      false,
    );
    expect(
      validateClientProtocolCompatibility(
        deviceOnly({ clientType: 'confidential', tokenEndpointAuthMethod: 'none' }),
      ).isValid,
    ).toBe(false);
  });

  it('rejects an unknown grant value', () => {
    const result = validateClientProtocolCompatibility(
      deviceOnly({ grantTypes: ['urn:example:unknown'] }),
    );
    expect(result.isValid).toBe(false);
    expect(result.errors.join(' ')).toContain('grantTypes');
  });
});

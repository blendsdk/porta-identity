/**
 * Specification tests for provider configuration, interval advertisement and
 * the DeviceCode collision error.
 *
 * These assertions are derived from the approved device authorization
 * contract: the native feature is enabled with empty device metadata, the
 * provider advertises a fixed five-second interval, DeviceCode lifetime is
 * 600 seconds, and a user-code collision is a generic retryable 503.
 */

import { describe, expect, it, vi } from 'vitest';
import { errors } from 'oidc-provider';

vi.mock('../../../src/config/index.js', () => ({
  config: {
    nodeEnv: 'test',
    issuerBaseUrl: 'https://porta.example.com',
    cookieKeys: ['test-cookie-key-0123456789'],
  },
}));

import {
  buildProviderConfiguration,
  type BuildProviderConfigParams,
} from '../../../src/oidc/configuration.js';
import { DeviceCodeCollisionError } from '../../../src/oidc/postgres-adapter.js';
import { applyDeviceAuthorizationInterval } from '../../../src/oidc/provider.js';

/** Minimal valid configuration parameters. */
function createTestParams(): BuildProviderConfigParams {
  return {
    ttl: {
      accessToken: 3600,
      authorizationCode: 600,
      idToken: 3600,
      refreshToken: 86400,
      interaction: 3600,
      session: 1209600,
      grant: 1209600,
    },
    jwks: { keys: [] },
    cookieKeys: ['test-key-for-cookie-signing-12345'],
    findAccount: async () => undefined,
    adapterFactory: class MockAdapter {},
    interactionUrl: (_ctx, interaction) => `/interaction/${interaction.uid}`,
  };
}

/** Return true only for a non-array object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Narrow one nested configuration record. */
function readRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error('Expected a configuration record');
  return value;
}

describe('device flow provider configuration', () => {
  it('enables the native device flow with empty device metadata', () => {
    const configuration = buildProviderConfiguration(createTestParams());
    const features = readRecord(configuration.features);
    const deviceFlow = readRecord(features.deviceFlow);

    expect(deviceFlow.enabled).toBe(true);
    const deviceInfo = deviceFlow.deviceInfo;
    expect(deviceInfo).toBeTypeOf('function');
    if (typeof deviceInfo !== 'function') throw new Error('deviceInfo must be callable');
    expect(deviceInfo({ ip: '203.0.113.9', get: () => 'test-agent' })).toEqual({});

    const ttl = readRecord(configuration.ttl);
    expect(ttl.DeviceCode).toBe(600);
  });

  it('advertises a fixed five-second interval without changing provider fields', () => {
    const body = {
      device_code: 'opaque',
      user_code: 'BCDF-GHJK',
      expires_in: 600,
      interval: 1,
    };
    applyDeviceAuthorizationInterval({}, body);

    expect(body).toEqual({
      device_code: 'opaque',
      user_code: 'BCDF-GHJK',
      expires_in: 600,
      interval: 5,
    });
  });

  it('maps a user-code collision to an exposed generic 503', () => {
    const error = new DeviceCodeCollisionError();

    expect(error).toBeInstanceOf(errors.OIDCProviderError);
    expect(error.statusCode).toBe(503);
    expect(error.expose).toBe(true);
    expect(error.message).toBe('temporarily_unavailable');
  });
});

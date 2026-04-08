import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock config module to control nodeEnv
vi.mock('../../../src/config/index.js', () => ({
  config: {
    nodeEnv: 'production',
    port: 3000,
    host: '0.0.0.0',
    databaseUrl: 'postgresql://localhost/porta',
    redisUrl: 'redis://localhost:6379',
    issuerBaseUrl: 'http://localhost:3000',
    cookieKeys: ['test-cookie-key-0123456789'],
    smtp: { host: 'localhost', port: 587, user: '', pass: '', from: 'test@test.com' },
    logLevel: 'info',
  },
}));

import { config } from '../../../src/config/index.js';
import { oidcCors } from '../../../src/middleware/oidc-cors.js';

describe('oidc-cors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to production mode
    (config as { nodeEnv: string }).nodeEnv = 'production';
  });

  it('returns true in development mode', () => {
    (config as { nodeEnv: string }).nodeEnv = 'development';
    const result = oidcCors(null, 'http://evil.com', undefined);
    expect(result).toBe(true);
  });

  it('returns false when no client context', () => {
    const result = oidcCors(null, 'http://example.com', undefined);
    expect(result).toBe(false);
  });

  it('returns true for allowed origin', () => {
    const client = { allowed_origins: ['http://app.example.com', 'https://spa.example.com'] };
    const result = oidcCors(null, 'http://app.example.com', client);
    expect(result).toBe(true);
  });

  it('returns false for disallowed origin', () => {
    const client = { allowed_origins: ['http://app.example.com'] };
    const result = oidcCors(null, 'http://evil.com', client);
    expect(result).toBe(false);
  });

  it('returns false when client has no allowed_origins', () => {
    const client = {};
    const result = oidcCors(null, 'http://example.com', client);
    expect(result).toBe(false);
  });
});

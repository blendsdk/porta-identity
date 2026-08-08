import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock config module to control nodeEnv
vi.mock('../../../src/config/index.js', () => ({
  config: {
    nodeEnv: 'production',
    port: 3000,
    host: '0.0.0.0',
    databaseUrl: 'postgresql://localhost/porta',
    redisUrl: 'redis://localhost:6379',
    issuerBaseUrl: 'https://porta.local:3443',
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

  // ---------------------------------------------------------------------------
  // Development mode
  // ---------------------------------------------------------------------------

  it('returns true in development mode', () => {
    (config as { nodeEnv: string }).nodeEnv = 'development';
    const result = oidcCors(null, 'http://evil.com', undefined);
    expect(result).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // No client context
  // ---------------------------------------------------------------------------

  it('returns false when no client context', () => {
    const result = oidcCors(null, 'http://example.com', undefined);
    expect(result).toBe(false);
  });

  it('returns false when client is null', () => {
    const result = oidcCors(null, 'http://example.com', null);
    expect(result).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Explicit allowed_origins (urn:porta:allowed_origins)
  // ---------------------------------------------------------------------------

  it('returns true for origin in explicit allowed_origins', () => {
    const client = {
      'urn:porta:allowed_origins': ['http://app.example.com', 'https://spa.example.com'],
    };
    const result = oidcCors(null, 'http://app.example.com', client);
    expect(result).toBe(true);
  });

  it('returns true for second origin in explicit allowed_origins', () => {
    const client = {
      'urn:porta:allowed_origins': ['http://app.example.com', 'https://spa.example.com'],
    };
    const result = oidcCors(null, 'https://spa.example.com', client);
    expect(result).toBe(true);
  });

  it('returns false for origin not in explicit allowed_origins', () => {
    const client = {
      'urn:porta:allowed_origins': ['http://app.example.com'],
    };
    const result = oidcCors(null, 'http://evil.com', client);
    expect(result).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Redirect URI origin derivation
  // ---------------------------------------------------------------------------

  it('returns true when origin matches a redirect_uri origin', () => {
    const client = {
      redirect_uris: ['https://psteniusubi.github.io/oidc-tester/callback.html'],
    };
    const result = oidcCors(null, 'https://psteniusubi.github.io', client);
    expect(result).toBe(true);
  });

  it('returns true when origin matches redirect_uri with different path', () => {
    const client = {
      redirect_uris: ['http://localhost:8080/auth/callback?foo=bar'],
    };
    const result = oidcCors(null, 'http://localhost:8080', client);
    expect(result).toBe(true);
  });

  it('returns true when origin matches one of multiple redirect_uris', () => {
    const client = {
      redirect_uris: [
        'https://app1.example.com/callback',
        'https://app2.example.com/callback',
      ],
    };
    const result = oidcCors(null, 'https://app2.example.com', client);
    expect(result).toBe(true);
  });

  it('returns false when origin does not match any redirect_uri', () => {
    const client = {
      redirect_uris: ['https://app.example.com/callback'],
    };
    const result = oidcCors(null, 'https://evil.com', client);
    expect(result).toBe(false);
  });

  it('skips native app schemes (custom URI schemes produce null origin)', () => {
    const client = {
      redirect_uris: ['myapp://callback'],
    };
    const result = oidcCors(null, 'null', client);
    expect(result).toBe(false);
  });

  it('handles redirect_uris with port numbers correctly', () => {
    const client = {
      redirect_uris: ['https://porta.local:3443/callback'],
    };
    // Different port = different origin
    expect(oidcCors(null, 'https://porta.local:3443', client)).toBe(true);
    expect(oidcCors(null, 'http://localhost:4000', client)).toBe(false);
  });

  it('handles redirect_uris with https correctly', () => {
    const client = {
      redirect_uris: ['https://app.example.com/callback'],
    };
    // Different scheme = different origin
    expect(oidcCors(null, 'https://app.example.com', client)).toBe(true);
    expect(oidcCors(null, 'http://app.example.com', client)).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Combined: explicit + redirect URI fallback
  // ---------------------------------------------------------------------------

  it('explicit allowed_origins takes priority over redirect_uris', () => {
    const client = {
      'urn:porta:allowed_origins': ['https://explicit.example.com'],
      redirect_uris: ['https://redirect.example.com/callback'],
    };
    expect(oidcCors(null, 'https://explicit.example.com', client)).toBe(true);
    expect(oidcCors(null, 'https://redirect.example.com', client)).toBe(true);
    expect(oidcCors(null, 'https://evil.com', client)).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------

  it('returns false when client has no allowed_origins and no redirect_uris', () => {
    const client = {};
    const result = oidcCors(null, 'http://example.com', client);
    expect(result).toBe(false);
  });

  it('handles malformed redirect_uris gracefully', () => {
    const client = {
      redirect_uris: ['not-a-valid-url', 'https://valid.example.com/callback'],
    };
    // Should skip the malformed URI and still match the valid one
    expect(oidcCors(null, 'https://valid.example.com', client)).toBe(true);
  });
});

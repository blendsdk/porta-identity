import { describe, it, expect } from 'vitest';
import {
  validateRedirectUri,
  validateRedirectUris,
  getDefaultGrantTypes,
  getDefaultTokenEndpointAuthMethod,
  getDefaultResponseTypes,
  getDefaultScope,
} from '../../../src/clients/validators.js';

describe('client validators', () => {
  // -------------------------------------------------------------------------
  // validateRedirectUri
  // -------------------------------------------------------------------------

  describe('validateRedirectUri', () => {
    it('should accept a valid HTTPS URI', () => {
      const result = validateRedirectUri('https://example.com/callback', true);
      expect(result.isValid).toBe(true);
    });

    it('should accept HTTP in non-production', () => {
      const result = validateRedirectUri('http://example.com/callback', false);
      expect(result.isValid).toBe(true);
    });

    it('should reject HTTP in production (non-localhost)', () => {
      const result = validateRedirectUri('http://example.com/callback', true);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('HTTPS');
    });

    it('should allow HTTP localhost in production', () => {
      const result = validateRedirectUri('http://localhost:3000/callback', true);
      expect(result.isValid).toBe(true);
    });

    it('should allow HTTP 127.0.0.1 in production', () => {
      const result = validateRedirectUri('http://127.0.0.1:3000/callback', true);
      expect(result.isValid).toBe(true);
    });

    it('should reject URIs with fragments', () => {
      const result = validateRedirectUri('https://example.com/callback#section', false);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('fragment');
    });

    it('should reject URIs with wildcards in path', () => {
      const result = validateRedirectUri('https://example.com/*/callback', false);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('wildcards');
    });

    it('should reject URIs with wildcards in query', () => {
      const result = validateRedirectUri('https://example.com/callback?param=*', false);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('wildcards');
    });

    it('should reject empty URIs', () => {
      const result = validateRedirectUri('', false);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('empty');
    });

    it('should reject whitespace-only URIs', () => {
      const result = validateRedirectUri('   ', false);
      expect(result.isValid).toBe(false);
    });

    it('should accept custom URI schemes for native apps', () => {
      const result = validateRedirectUri('com.example.app:/callback', false);
      expect(result.isValid).toBe(true);
    });

    it('should reject custom URI schemes with fragments', () => {
      const result = validateRedirectUri('com.example.app:/callback#section', false);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('fragment');
    });

    it('should reject completely invalid URIs', () => {
      const result = validateRedirectUri('not a url at all', false);
      expect(result.isValid).toBe(false);
    });

    it('should accept URIs with paths and query parameters', () => {
      const result = validateRedirectUri(
        'https://example.com/auth/callback?state=abc',
        true,
      );
      expect(result.isValid).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // validateRedirectUris (array)
  // -------------------------------------------------------------------------

  describe('validateRedirectUris', () => {
    it('should accept valid array of URIs', () => {
      const result = validateRedirectUris(
        ['https://example.com/callback', 'https://example.com/callback2'],
        true,
      );
      expect(result.isValid).toBe(true);
    });

    it('should reject empty array', () => {
      const result = validateRedirectUris([], true);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('At least one redirect URI is required');
    });

    it('should reject when exceeding max URIs', () => {
      const uris = Array.from({ length: 11 }, (_, i) => `https://example.com/cb${i}`);
      const result = validateRedirectUris(uris, false);
      expect(result.isValid).toBe(false);
      expect(result.errors![0]).toContain('Maximum 10');
    });

    it('should accept custom max URIs', () => {
      const uris = ['https://a.com/cb', 'https://b.com/cb', 'https://c.com/cb'];
      const result = validateRedirectUris(uris, false, 2);
      expect(result.isValid).toBe(false);
      expect(result.errors![0]).toContain('Maximum 2');
    });

    it('should collect errors from multiple invalid URIs', () => {
      const result = validateRedirectUris(
        ['', 'http://example.com/callback#bad'],
        false,
      );
      expect(result.isValid).toBe(false);
      expect(result.errors!.length).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // getDefaultGrantTypes
  // -------------------------------------------------------------------------

  describe('getDefaultGrantTypes', () => {
    it('should return auth_code + refresh + client_creds for confidential web', () => {
      const grants = getDefaultGrantTypes('confidential', 'web');
      expect(grants).toEqual([
        'authorization_code',
        'refresh_token',
        'client_credentials',
      ]);
    });

    it('should return auth_code + refresh for confidential native', () => {
      const grants = getDefaultGrantTypes('confidential', 'native');
      expect(grants).toEqual(['authorization_code', 'refresh_token']);
    });

    it('should return auth_code + refresh for public spa', () => {
      const grants = getDefaultGrantTypes('public', 'spa');
      expect(grants).toEqual(['authorization_code', 'refresh_token']);
    });

    it('should return auth_code + refresh for public native', () => {
      const grants = getDefaultGrantTypes('public', 'native');
      expect(grants).toEqual(['authorization_code', 'refresh_token']);
    });
  });

  // -------------------------------------------------------------------------
  // getDefaultTokenEndpointAuthMethod
  // -------------------------------------------------------------------------

  describe('getDefaultTokenEndpointAuthMethod', () => {
    it('should return client_secret_basic for confidential', () => {
      expect(getDefaultTokenEndpointAuthMethod('confidential')).toBe(
        'client_secret_basic',
      );
    });

    it('should return none for public', () => {
      expect(getDefaultTokenEndpointAuthMethod('public')).toBe('none');
    });
  });

  // -------------------------------------------------------------------------
  // getDefaultResponseTypes / getDefaultScope
  // -------------------------------------------------------------------------

  describe('getDefaultResponseTypes', () => {
    it('should return ["code"]', () => {
      expect(getDefaultResponseTypes()).toEqual(['code']);
    });
  });

  describe('getDefaultScope', () => {
    it('should return "openid profile email"', () => {
      expect(getDefaultScope()).toBe('openid profile email');
    });
  });
});

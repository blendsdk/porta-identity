/**
 * Tests for OAuth callback server and manual URL parsing.
 */

import { describe, it, expect, afterEach } from 'vitest';
import {
  startCallbackServer,
  parseCallbackUrl,
  isContainerized,
  MANUAL_REDIRECT_URI,
} from '../../src/auth/callback-server.js';

describe('callback-server', () => {
  describe('MANUAL_REDIRECT_URI', () => {
    it('uses loopback address on port 11111', () => {
      expect(MANUAL_REDIRECT_URI).toBe('http://127.0.0.1:11111/callback');
    });
  });

  describe('parseCallbackUrl', () => {
    const state = 'test-state-123';

    it('extracts authorization code from valid callback URL', () => {
      const url = `http://127.0.0.1:11111/callback?code=auth-code-xyz&state=${state}`;
      expect(parseCallbackUrl(url, state)).toBe('auth-code-xyz');
    });

    it('throws on invalid URL', () => {
      expect(() => parseCallbackUrl('not-a-url', state)).toThrow(
        'Invalid URL',
      );
    });

    it('throws on OIDC error response', () => {
      const url = `http://127.0.0.1:11111/callback?error=access_denied&error_description=User+cancelled&state=${state}`;
      expect(() => parseCallbackUrl(url, state)).toThrow(
        'Authentication failed: User cancelled',
      );
    });

    it('throws on OIDC error without description', () => {
      const url = `http://127.0.0.1:11111/callback?error=server_error&state=${state}`;
      expect(() => parseCallbackUrl(url, state)).toThrow(
        'Authentication failed: server_error',
      );
    });

    it('throws on state mismatch', () => {
      const url = 'http://127.0.0.1:11111/callback?code=code&state=wrong-state';
      expect(() => parseCallbackUrl(url, state)).toThrow(
        'Security error: state mismatch',
      );
    });

    it('throws when no code in URL', () => {
      const url = `http://127.0.0.1:11111/callback?state=${state}`;
      expect(() => parseCallbackUrl(url, state)).toThrow(
        'No authorization code found',
      );
    });

    it('handles URL with whitespace', () => {
      const url = `  http://127.0.0.1:11111/callback?code=code123&state=${state}  `;
      expect(parseCallbackUrl(url, state)).toBe('code123');
    });
  });

  describe('startCallbackServer', () => {
    it('starts a server on a random port', async () => {
      const result = await startCallbackServer('test-state');
      expect(result.port).toBeGreaterThan(0);
      expect(result.authCode).toBeInstanceOf(Promise);
      expect(typeof result.close).toBe('function');

      // Cleanup
      result.close();
    });

    it('resolves auth code on valid callback', async () => {
      const state = 'valid-state-abc';
      const result = await startCallbackServer(state);

      // Simulate the browser callback
      const callbackUrl = `http://127.0.0.1:${result.port}/callback?code=test-code&state=${state}`;
      const response = await fetch(callbackUrl);
      expect(response.ok).toBe(true);

      const code = await result.authCode;
      expect(code).toBe('test-code');
    });

    it('rejects on state mismatch', async () => {
      const result = await startCallbackServer('expected-state');
      // Attach a no-op handler to prevent unhandled rejection
      result.authCode.catch(() => {});

      const callbackUrl = `http://127.0.0.1:${result.port}/callback?code=code&state=wrong-state`;
      await fetch(callbackUrl);

      await expect(result.authCode).rejects.toThrow('state mismatch');
    });

    it('rejects on OIDC error', async () => {
      const result = await startCallbackServer('test-state');
      result.authCode.catch(() => {});

      const callbackUrl = `http://127.0.0.1:${result.port}/callback?error=access_denied`;
      await fetch(callbackUrl);

      await expect(result.authCode).rejects.toThrow('Authentication failed');
    });

    it('rejects when no code in callback', async () => {
      const state = 'no-code-state';
      const result = await startCallbackServer(state);
      result.authCode.catch(() => {});

      const callbackUrl = `http://127.0.0.1:${result.port}/callback?state=${state}`;
      await fetch(callbackUrl);

      await expect(result.authCode).rejects.toThrow('No authorization code');
    });

    it('returns 404 for non-callback paths', async () => {
      const result = await startCallbackServer('test-state');

      const response = await fetch(`http://127.0.0.1:${result.port}/other`);
      expect(response.status).toBe(404);

      result.close();
    });
  });

  describe('isContainerized', () => {
    const originalEnv = process.env.PORTA_CONTAINER;

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env.PORTA_CONTAINER;
      } else {
        process.env.PORTA_CONTAINER = originalEnv;
      }
    });

    it('returns true when PORTA_CONTAINER=1', () => {
      process.env.PORTA_CONTAINER = '1';
      expect(isContainerized()).toBe(true);
    });

    it('returns false when PORTA_CONTAINER is not set', () => {
      delete process.env.PORTA_CONTAINER;
      // In test environment, /.dockerenv typically doesn't exist
      expect(isContainerized()).toBe(false);
    });

    it('returns false when PORTA_CONTAINER is set to other value', () => {
      process.env.PORTA_CONTAINER = '0';
      // Only '1' is treated as containerized
      expect(isContainerized()).toBe(false);
    });
  });
});

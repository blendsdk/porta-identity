/**
 * Unit tests for the config module.
 *
 * Tests the priority chain for server URL resolution:
 *   1. Programmatic options (--server flag)
 *   2. PORTA_SERVER environment variable
 *   3. ~/.porta/credentials.json file
 *
 * Also tests port resolution, boolean flags, and error handling.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resolveConfig } from '../../src/config.js';

// Mock fs.readFileSync for credentials file testing
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    readFileSync: vi.fn(() => {
      throw new Error('ENOENT');
    }),
  };
});

import { readFileSync } from 'node:fs';
const mockReadFileSync = vi.mocked(readFileSync);

describe('resolveConfig', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clean env vars before each test
    delete process.env.PORTA_SERVER;
    delete process.env.PORTA_GUI_PORT;
    // Reset mock to default (file not found)
    mockReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  // ---------- Server URL resolution ----------

  describe('server URL resolution', () => {
    it('throws when no server URL is available from any source', () => {
      expect(() => resolveConfig()).toThrow('No Porta server URL configured');
    });

    it('uses options.server when provided (highest priority)', () => {
      process.env.PORTA_SERVER = 'https://env-server.example.com';
      const config = resolveConfig({ server: 'https://flag-server.example.com' });
      expect(config.serverUrl).toBe('https://flag-server.example.com');
    });

    it('uses PORTA_SERVER env var when options.server is not provided', () => {
      process.env.PORTA_SERVER = 'https://env-server.example.com';
      const config = resolveConfig();
      expect(config.serverUrl).toBe('https://env-server.example.com');
    });

    it('reads server from credentials file when no flag or env', () => {
      mockReadFileSync.mockReturnValue(
        JSON.stringify({ server: 'https://creds-server.example.com' }),
      );
      const config = resolveConfig();
      expect(config.serverUrl).toBe('https://creds-server.example.com');
    });

    it('strips trailing slashes from server URL', () => {
      const config = resolveConfig({ server: 'https://example.com///' });
      expect(config.serverUrl).toBe('https://example.com');
    });

    it('prioritizes flag over env over credentials', () => {
      process.env.PORTA_SERVER = 'https://env.com';
      mockReadFileSync.mockReturnValue(JSON.stringify({ server: 'https://creds.com' }));

      // Flag > env
      expect(resolveConfig({ server: 'https://flag.com' }).serverUrl).toBe('https://flag.com');

      // Env > credentials (no flag)
      expect(resolveConfig().serverUrl).toBe('https://env.com');

      // Credentials fallback (no flag, no env)
      delete process.env.PORTA_SERVER;
      expect(resolveConfig().serverUrl).toBe('https://creds.com');
    });

    it('handles malformed credentials JSON gracefully', () => {
      mockReadFileSync.mockReturnValue('not valid json');
      expect(() => resolveConfig()).toThrow('No Porta server URL configured');
    });

    it('handles credentials with missing server field', () => {
      mockReadFileSync.mockReturnValue(JSON.stringify({ token: 'abc' }));
      expect(() => resolveConfig()).toThrow('No Porta server URL configured');
    });

    it('handles credentials with empty server field', () => {
      mockReadFileSync.mockReturnValue(JSON.stringify({ server: '' }));
      expect(() => resolveConfig()).toThrow('No Porta server URL configured');
    });
  });

  // ---------- Port resolution ----------

  describe('port resolution', () => {
    it('defaults to 4002', () => {
      const config = resolveConfig({ server: 'https://s.com' });
      expect(config.port).toBe(4002);
    });

    it('uses options.port when provided', () => {
      const config = resolveConfig({ server: 'https://s.com', port: 5000 });
      expect(config.port).toBe(5000);
    });

    it('uses PORTA_GUI_PORT env var when options.port not provided', () => {
      process.env.PORTA_GUI_PORT = '6000';
      const config = resolveConfig({ server: 'https://s.com' });
      expect(config.port).toBe(6000);
    });

    it('options.port takes priority over env var', () => {
      process.env.PORTA_GUI_PORT = '6000';
      const config = resolveConfig({ server: 'https://s.com', port: 7000 });
      expect(config.port).toBe(7000);
    });

    it('publicPort defaults to same as port', () => {
      const config = resolveConfig({ server: 'https://s.com' });
      expect(config.publicPort).toBe(config.port);
    });

    it('publicPort defaults to same as custom port', () => {
      const config = resolveConfig({ server: 'https://s.com', port: 5000 });
      expect(config.publicPort).toBe(5000);
    });

    it('publicPort can differ from port (dev mode: Vite on publicPort, BFF on port)', () => {
      const config = resolveConfig({ server: 'https://s.com', port: 4003, publicPort: 4002 });
      expect(config.port).toBe(4003);
      expect(config.publicPort).toBe(4002);
    });
  });

  // ---------- Boolean flags ----------

  describe('boolean flags', () => {
    it('defaults open to true', () => {
      const config = resolveConfig({ server: 'https://s.com' });
      expect(config.open).toBe(true);
    });

    it('respects open: false', () => {
      const config = resolveConfig({ server: 'https://s.com', open: false });
      expect(config.open).toBe(false);
    });

    it('defaults insecure to false', () => {
      const config = resolveConfig({ server: 'https://s.com' });
      expect(config.insecure).toBe(false);
    });

    it('respects insecure: true', () => {
      const config = resolveConfig({ server: 'https://s.com', insecure: true });
      expect(config.insecure).toBe(true);
    });
  });
});

/**
 * Tests for the global options and server URL resolution module.
 *
 * Verifies the priority chain: --server > PORTA_SERVER env > credentials file > error.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';

// Mock homedir for credential store tests
const TEST_HOME = join(tmpdir(), `porta-cli-opts-test-${Date.now()}`);

vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof import('node:os')>('node:os');
  return { ...actual, homedir: () => TEST_HOME };
});

const { resolveServerUrl } = await import('../src/global-options.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function baseOptions() {
  return { json: false, verbose: false, insecure: false, force: false };
}

function writeCredentials(server: string) {
  const dir = join(TEST_HOME, '.porta');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'credentials.json'),
    JSON.stringify({
      server,
      orgSlug: 'admin',
      clientId: 'cli',
      accessToken: 'tok',
      refreshToken: 'ref',
      idToken: 'id',
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      userInfo: { sub: 'u1', email: 'a@b.com' },
    }),
    'utf-8',
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('resolveServerUrl', () => {
  const originalEnv = process.env.PORTA_SERVER;

  beforeEach(() => {
    mkdirSync(TEST_HOME, { recursive: true });
    delete process.env.PORTA_SERVER;
  });

  afterEach(() => {
    rmSync(TEST_HOME, { recursive: true, force: true });
    if (originalEnv !== undefined) {
      process.env.PORTA_SERVER = originalEnv;
    } else {
      delete process.env.PORTA_SERVER;
    }
  });

  it('uses --server flag as highest priority', () => {
    process.env.PORTA_SERVER = 'https://env.example.com';
    writeCredentials('https://creds.example.com');
    const url = resolveServerUrl({ ...baseOptions(), server: 'https://flag.example.com/' });
    expect(url).toBe('https://flag.example.com');
  });

  it('uses PORTA_SERVER env when no --server flag', () => {
    process.env.PORTA_SERVER = 'https://env.example.com/';
    writeCredentials('https://creds.example.com');
    const url = resolveServerUrl(baseOptions());
    expect(url).toBe('https://env.example.com');
  });

  it('uses credentials file when no flag or env var', () => {
    writeCredentials('https://creds.example.com/');
    const url = resolveServerUrl(baseOptions());
    expect(url).toBe('https://creds.example.com');
  });

  it('throws when no server URL is configured', () => {
    expect(() => resolveServerUrl(baseOptions())).toThrow(
      'No Porta server configured',
    );
  });

  it('normalizes URLs by removing trailing slashes', () => {
    const url = resolveServerUrl({ ...baseOptions(), server: 'https://example.com///' });
    expect(url).toBe('https://example.com');
  });
});

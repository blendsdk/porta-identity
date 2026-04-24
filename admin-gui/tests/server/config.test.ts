import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadConfig } from '../../src/server/config.js';

/**
 * Tests for BFF configuration validation.
 * Verifies that loadConfig() correctly validates environment variables,
 * applies defaults, and fails fast on missing/invalid values.
 */

/** Minimal valid environment for BFF config */
function validEnv(): Record<string, string> {
  return {
    PORTA_ADMIN_PORTA_URL: 'http://localhost:4000',
    PORTA_ADMIN_CLIENT_ID: 'admin-gui-client',
    PORTA_ADMIN_CLIENT_SECRET: 'super-secret-value-here',
    PORTA_ADMIN_SESSION_SECRET: 'a'.repeat(32),
    REDIS_URL: 'redis://localhost:6379',
  };
}

describe('BFF Config', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    originalEnv = { ...process.env };
    // Prevent process.exit from actually exiting
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('should load valid configuration from environment', () => {
    const env = validEnv();
    Object.assign(process.env, env);

    const config = loadConfig();

    expect(config.portaUrl).toBe('http://localhost:4000');
    expect(config.clientId).toBe('admin-gui-client');
    expect(config.clientSecret).toBe('super-secret-value-here');
    expect(config.sessionSecret).toBe('a'.repeat(32));
    expect(config.redisUrl).toBe('redis://localhost:6379');
  });

  it('should apply default values for optional fields', () => {
    Object.assign(process.env, validEnv());
    // Vitest sets NODE_ENV=test — clear it to verify the production default
    delete process.env.NODE_ENV;

    const config = loadConfig();

    expect(config.port).toBe(4002);
    expect(config.publicUrl).toBe('http://localhost:4002');
    expect(config.nodeEnv).toBe('production');
    expect(config.logLevel).toBe('info');
    expect(config.orgSlug).toBeUndefined();
  });

  it('should fail on missing PORTA_ADMIN_PORTA_URL', () => {
    const env = validEnv();
    delete env.PORTA_ADMIN_PORTA_URL;
    Object.assign(process.env, env);
    // Clear the var from process.env
    delete process.env.PORTA_ADMIN_PORTA_URL;

    loadConfig();

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errorSpy).toHaveBeenCalled();
  });

  it('should fail on missing PORTA_ADMIN_CLIENT_ID', () => {
    const env = validEnv();
    delete env.PORTA_ADMIN_CLIENT_ID;
    Object.assign(process.env, env);
    delete process.env.PORTA_ADMIN_CLIENT_ID;

    loadConfig();

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('should fail on missing PORTA_ADMIN_CLIENT_SECRET', () => {
    const env = validEnv();
    delete env.PORTA_ADMIN_CLIENT_SECRET;
    Object.assign(process.env, env);
    delete process.env.PORTA_ADMIN_CLIENT_SECRET;

    loadConfig();

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('should fail on session secret shorter than 32 characters', () => {
    Object.assign(process.env, validEnv());
    process.env.PORTA_ADMIN_SESSION_SECRET = 'too-short';

    loadConfig();

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('should fail on invalid PORTA_ADMIN_PORTA_URL (not a URL)', () => {
    Object.assign(process.env, validEnv());
    process.env.PORTA_ADMIN_PORTA_URL = 'not-a-url';

    loadConfig();

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('should coerce PORTA_ADMIN_PORT to number', () => {
    Object.assign(process.env, validEnv());
    process.env.PORTA_ADMIN_PORT = '9090';

    const config = loadConfig();

    expect(config.port).toBe(9090);
  });

  it('should default nodeEnv to production', () => {
    Object.assign(process.env, validEnv());
    delete process.env.NODE_ENV;

    const config = loadConfig();

    expect(config.nodeEnv).toBe('production');
  });

  it('should accept staging as a valid nodeEnv', () => {
    Object.assign(process.env, validEnv());
    process.env.NODE_ENV = 'staging';

    const config = loadConfig();

    expect(config.nodeEnv).toBe('staging');
  });
});

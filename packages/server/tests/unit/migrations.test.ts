import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const MIGRATIONS_DIR = join(process.cwd(), 'migrations');

/** Read all .sql files from the migrations directory */
function getMigrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

describe('Migration File Validation', () => {
  const files = getMigrationFiles();

  it('should have migration files', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  describe('Naming Convention', () => {
    it.each(files)('%s matches NNN_description.sql pattern', (filename) => {
      expect(filename).toMatch(/^\d{3}_[a-z][a-z0-9_]*\.sql$/);
    });
  });

  describe('File Structure', () => {
    it.each(files)('%s contains Up Migration marker', (filename) => {
      const content = readFileSync(join(MIGRATIONS_DIR, filename), 'utf-8');
      expect(content).toContain('-- Up Migration');
    });

    it.each(files)('%s contains Down Migration marker', (filename) => {
      const content = readFileSync(join(MIGRATIONS_DIR, filename), 'utf-8');
      expect(content).toContain('-- Down Migration');
    });

    it.each(files)('%s has non-empty Up section', (filename) => {
      const content = readFileSync(join(MIGRATIONS_DIR, filename), 'utf-8');
      const upStart = content.indexOf('-- Up Migration');
      const downStart = content.indexOf('-- Down Migration');
      const upSection = content.slice(upStart, downStart).trim();
      // Up section should contain SQL beyond just the marker
      expect(upSection.length).toBeGreaterThan('-- Up Migration'.length + 10);
    });

    it.each(files)('%s has non-empty Down section', (filename) => {
      const content = readFileSync(join(MIGRATIONS_DIR, filename), 'utf-8');
      const downStart = content.indexOf('-- Down Migration');
      const downSection = content.slice(downStart).trim();
      expect(downSection.length).toBeGreaterThan('-- Down Migration'.length + 10);
    });
  });

  describe('Ordering', () => {
    it('should have sequential numbering starting from 001', () => {
      const numbers = files.map((f) => parseInt(f.split('_')[0], 10));
      for (let i = 0; i < numbers.length; i++) {
        expect(numbers[i]).toBe(i + 1);
      }
    });

    it('should have no duplicate numbers', () => {
      const numbers = files.map((f) => parseInt(f.split('_')[0], 10));
      const unique = new Set(numbers);
      expect(unique.size).toBe(numbers.length);
    });
  });

  describe('SQL Content', () => {
    it('001_extensions.sql creates pgcrypto and citext extensions', () => {
      const content = readFileSync(join(MIGRATIONS_DIR, '001_extensions.sql'), 'utf-8');
      expect(content).toContain('pgcrypto');
      expect(content).toContain('citext');
    });

    it('001_extensions.sql creates trigger_set_updated_at function', () => {
      const content = readFileSync(join(MIGRATIONS_DIR, '001_extensions.sql'), 'utf-8');
      expect(content).toContain('trigger_set_updated_at');
    });

    it('011_seed.sql inserts super-admin organization', () => {
      const content = readFileSync(join(MIGRATIONS_DIR, '011_seed.sql'), 'utf-8');
      expect(content).toContain('porta-admin');
      expect(content).toContain('is_super_admin');
    });

    it('011_seed.sql inserts system config defaults', () => {
      const content = readFileSync(join(MIGRATIONS_DIR, '011_seed.sql'), 'utf-8');
      expect(content).toContain('system_config');
      expect(content).toContain('access_token_ttl');
      expect(content).toContain('refresh_token_ttl');
    });

    it('012_two_factor.sql adds two_factor_policy to organizations', () => {
      const content = readFileSync(join(MIGRATIONS_DIR, '012_two_factor.sql'), 'utf-8');
      expect(content).toContain('ALTER TABLE organizations');
      expect(content).toContain('two_factor_policy');
      expect(content).toContain("'optional'");
      expect(content).toContain("'required_email'");
      expect(content).toContain("'required_totp'");
      expect(content).toContain("'required_any'");
    });

    it('012_two_factor.sql adds 2FA columns to users', () => {
      const content = readFileSync(join(MIGRATIONS_DIR, '012_two_factor.sql'), 'utf-8');
      expect(content).toContain('ALTER TABLE users');
      expect(content).toContain('two_factor_enabled');
      expect(content).toContain('two_factor_method');
    });

    it('012_two_factor.sql creates user_totp table with encryption fields', () => {
      const content = readFileSync(join(MIGRATIONS_DIR, '012_two_factor.sql'), 'utf-8');
      expect(content).toContain('CREATE TABLE user_totp');
      expect(content).toContain('encrypted_secret');
      expect(content).toContain('encryption_iv');
      expect(content).toContain('encryption_tag');
      expect(content).toContain('UNIQUE (user_id)');
    });

    it('012_two_factor.sql creates two_factor_otp_codes table', () => {
      const content = readFileSync(join(MIGRATIONS_DIR, '012_two_factor.sql'), 'utf-8');
      expect(content).toContain('CREATE TABLE two_factor_otp_codes');
      expect(content).toContain('code_hash');
      expect(content).toContain('expires_at');
      expect(content).toContain('idx_otp_codes_user_active');
    });

    it('012_two_factor.sql creates two_factor_recovery_codes table', () => {
      const content = readFileSync(join(MIGRATIONS_DIR, '012_two_factor.sql'), 'utf-8');
      expect(content).toContain('CREATE TABLE two_factor_recovery_codes');
      expect(content).toContain('code_hash');
      expect(content).toContain('Argon2id');
      expect(content).toContain('idx_recovery_codes_user');
    });

    it('012_two_factor.sql creates updated_at trigger for user_totp', () => {
      const content = readFileSync(join(MIGRATIONS_DIR, '012_two_factor.sql'), 'utf-8');
      expect(content).toContain('set_user_totp_updated_at');
      expect(content).toContain('trigger_set_updated_at');
    });

    it('012_two_factor.sql has proper down migration', () => {
      const content = readFileSync(join(MIGRATIONS_DIR, '012_two_factor.sql'), 'utf-8');
      const downSection = content.slice(content.indexOf('-- Down Migration'));
      expect(downSection).toContain('DROP TABLE IF EXISTS two_factor_recovery_codes');
      expect(downSection).toContain('DROP TABLE IF EXISTS two_factor_otp_codes');
      expect(downSection).toContain('DROP TABLE IF EXISTS user_totp');
      expect(downSection).toContain('DROP COLUMN IF EXISTS two_factor_enabled');
      expect(downSection).toContain('DROP COLUMN IF EXISTS two_factor_policy');
    });

    it('014_login_methods.sql adds default_login_methods to organizations', () => {
      const content = readFileSync(join(MIGRATIONS_DIR, '014_login_methods.sql'), 'utf-8');
      expect(content).toContain('ALTER TABLE organizations');
      expect(content).toContain('default_login_methods');
      expect(content).toContain('TEXT[]');
      // Default value uses explicit ARRAY[...]::TEXT[] form
      expect(content).toContain("ARRAY['password', 'magic_link']::TEXT[]");
      // NOT NULL default — see plans/client-login-methods/03-database-schema.md
      expect(content).toContain('NOT NULL');
    });

    it('014_login_methods.sql adds login_methods to clients (nullable)', () => {
      const content = readFileSync(join(MIGRATIONS_DIR, '014_login_methods.sql'), 'utf-8');
      expect(content).toContain('ALTER TABLE clients');
      expect(content).toContain('login_methods TEXT[]');
      // NULL default — NULL means "inherit from org default"
      expect(content).toContain('DEFAULT NULL');
    });

    it('014_login_methods.sql includes COMMENT ON COLUMN for both columns', () => {
      const content = readFileSync(join(MIGRATIONS_DIR, '014_login_methods.sql'), 'utf-8');
      // Self-documenting columns help operators understand the inheritance model
      expect(content).toContain('COMMENT ON COLUMN organizations.default_login_methods');
      expect(content).toContain('COMMENT ON COLUMN clients.login_methods');
    });

    it('014_login_methods.sql has proper down migration', () => {
      const content = readFileSync(join(MIGRATIONS_DIR, '014_login_methods.sql'), 'utf-8');
      const downSection = content.slice(content.indexOf('-- Down Migration'));
      expect(downSection).toContain('DROP COLUMN IF EXISTS login_methods');
      expect(downSection).toContain('DROP COLUMN IF EXISTS default_login_methods');
    });

    it('014_login_methods.sql does NOT add a value CHECK constraint (future-proof)', () => {
      const content = readFileSync(join(MIGRATIONS_DIR, '014_login_methods.sql'), 'utf-8');
      const upSection = content.slice(
        content.indexOf('-- Up Migration'),
        content.indexOf('-- Down Migration'),
      );
      // No CHECK on login_methods values — adding sso/passkey later requires zero migration.
      // Validation happens at the service layer against the LoginMethod TypeScript union.
      expect(upSection).not.toMatch(/CHECK\s*\([^)]*login_methods/i);
      expect(upSection).not.toMatch(/CHECK\s*\([^)]*default_login_methods/i);
    });
  });
});

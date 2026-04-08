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
  });
});

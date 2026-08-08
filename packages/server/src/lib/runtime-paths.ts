import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

// Both src/lib and dist/lib are two levels below the server package root.
const serverPackageRoot = fileURLToPath(new URL('../..', import.meta.url));

/**
 * Returns the absolute directory containing the server's SQL migrations.
 * The path is derived from this module rather than the caller's working directory.
 *
 * @example
 * ```ts
 * const migrationsDirectory = getMigrationsDirectory();
 * ```
 */
export function getMigrationsDirectory(): string {
  return join(serverPackageRoot, 'migrations');
}

/**
 * Returns the absolute path to the bundled seed migration.
 *
 * @example
 * ```ts
 * const seedSqlPath = getSeedSqlPath();
 * ```
 */
export function getSeedSqlPath(): string {
  return join(getMigrationsDirectory(), '011_seed.sql');
}

/**
 * Returns the absolute directory containing page and email templates.
 *
 * @example
 * ```ts
 * const templatesDirectory = getTemplatesDirectory();
 * ```
 */
export function getTemplatesDirectory(): string {
  return join(serverPackageRoot, 'templates');
}

/**
 * Returns the absolute directory containing bundled translations.
 *
 * @example
 * ```ts
 * const localesDirectory = getLocalesDirectory();
 * ```
 */
export function getLocalesDirectory(): string {
  return join(serverPackageRoot, 'locales');
}

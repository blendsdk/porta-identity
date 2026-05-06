/**
 * CLI argument parsers for complex flag values.
 *
 * Provides parsing functions for CLI flags that accept structured
 * input, such as comma-separated lists. Used by command modules
 * to validate and transform raw yargs argument strings.
 *
 * @module parsers
 */

// ---------------------------------------------------------------------------
// Login Methods Parser
// ---------------------------------------------------------------------------

/** Valid login method values */
const VALID_LOGIN_METHODS = ['password', 'magic_link'] as const;
export type LoginMethod = (typeof VALID_LOGIN_METHODS)[number];

/**
 * Parses a comma-separated list of login methods.
 *
 * Validates that each method is one of the allowed values.
 * Used by `porta client login-methods set` and related commands.
 *
 * @param input - Comma-separated string (e.g., "password,magic_link")
 * @returns Array of validated login methods
 * @throws Error if any method is invalid
 *
 * @example
 * ```typescript
 * parseLoginMethods('password,magic_link');
 * // Returns: ['password', 'magic_link']
 *
 * parseLoginMethods('password');
 * // Returns: ['password']
 *
 * parseLoginMethods('invalid');
 * // Throws: Error('Invalid login method: "invalid"...')
 * ```
 */
export function parseLoginMethods(input: string): LoginMethod[] {
  const methods = input.split(',').map((m) => m.trim().toLowerCase());

  for (const method of methods) {
    if (!VALID_LOGIN_METHODS.includes(method as LoginMethod)) {
      throw new Error(
        `Invalid login method: "${method}". Valid values: ${VALID_LOGIN_METHODS.join(', ')}`,
      );
    }
  }

  return methods as LoginMethod[];
}

// ---------------------------------------------------------------------------
// Generic Parsers
// ---------------------------------------------------------------------------

/**
 * Parses a comma-separated string into an array of trimmed strings.
 *
 * @param input - Comma-separated string
 * @returns Array of trimmed, non-empty strings
 */
export function parseCommaSeparated(input: string): string[] {
  return input
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Parses a key=value string into a [key, value] tuple.
 *
 * @param input - String in "key=value" format
 * @returns Tuple of [key, value]
 * @throws Error if input doesn't contain '='
 */
export function parseKeyValue(input: string): [string, string] {
  const idx = input.indexOf('=');
  if (idx === -1) {
    throw new Error(`Invalid key=value format: "${input}". Expected "key=value".`);
  }
  return [input.slice(0, idx).trim(), input.slice(idx + 1).trim()];
}

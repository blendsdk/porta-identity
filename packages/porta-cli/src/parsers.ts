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
// Login Methods Flag Parser (tri-state for client commands)
// ---------------------------------------------------------------------------

/**
 * Parses the `--login-methods` flag with tri-state semantics.
 *
 * Three-state return semantics mirror the service-layer contract:
 *
 * | CLI input                             | Return value                  | Meaning                                      |
 * | ------------------------------------- | ----------------------------- | -------------------------------------------- |
 * | flag omitted                          | `undefined`                   | Leave the field unchanged                    |
 * | `--login-methods inherit` (client)    | `null`                        | Reset client override → inherit org default  |
 * | `--login-methods password`            | `['password']`                | Explicit override                            |
 * | `--login-methods password,magic_link` | `['password', 'magic_link']`  | Explicit override (multiple)                 |
 *
 * The `inherit` sentinel is only accepted when `allowInherit` is `true`
 * (i.e. on client commands). Organization commands pass `false` because
 * `null` is not a valid value for `defaultLoginMethods` at the DB level.
 *
 * @param value - Raw CLI string; `undefined` if the flag was not provided
 * @param allowInherit - Whether to accept the `inherit` sentinel → `null` mapping
 * @returns `undefined` (omit), `null` (inherit), or a non-empty `LoginMethod[]`
 * @throws Error when value is empty, contains unknown methods, or is `inherit` on an org command
 */
export function parseLoginMethodsFlag(
  value: string | undefined,
  allowInherit: boolean,
): LoginMethod[] | null | undefined {
  if (value === undefined) return undefined;

  const trimmed = value.trim();

  if (trimmed.toLowerCase() === 'inherit') {
    if (!allowInherit) {
      throw new Error(
        '--login-methods: "inherit" is only valid on client commands (orgs require explicit methods)',
      );
    }
    return null;
  }

  const parts = trimmed
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    throw new Error(
      allowInherit
        ? '--login-methods must not be empty (use "inherit" to reset to org default)'
        : '--login-methods must not be empty',
    );
  }

  for (const p of parts) {
    if (!VALID_LOGIN_METHODS.includes(p as LoginMethod)) {
      throw new Error(
        `--login-methods: unknown method "${p}" (valid: ${VALID_LOGIN_METHODS.join(', ')})`,
      );
    }
  }

  return parts as LoginMethod[];
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

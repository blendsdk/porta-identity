/**
 * CLI argument parsing helpers shared across command modules.
 *
 * These helpers handle the common CLI-string → domain-value conversions
 * (e.g. comma-separated lists, tri-state flags) and produce the exact shape
 * the underlying service layer expects.
 *
 * @module cli/parsers
 */

import { LOGIN_METHODS, type LoginMethod } from '../clients/types.js';

/**
 * Parse the value of `--login-methods` for `porta org` / `porta client` commands.
 *
 * Three-state return semantics mirror the service-layer contract:
 *
 * | CLI input                           | Return value         | Meaning                                   |
 * | ----------------------------------- | -------------------- | ----------------------------------------- |
 * | flag omitted                        | `undefined`          | Leave the field unchanged                 |
 * | `--login-methods inherit` (client)  | `null`               | Reset client override → inherit org default |
 * | `--login-methods password`          | `['password']`       | Explicit override                         |
 * | `--login-methods password,magic_link` | `['password', 'magic_link']` | Explicit override (multiple)      |
 *
 * The `inherit` sentinel is only accepted when `allowInherit` is `true`
 * (i.e. on client commands). Organization commands pass `false` because
 * `null` is not a valid value for `defaultLoginMethods` at the DB level.
 *
 * @param value - Raw CLI string (`argv['login-methods']`); `undefined` if the flag was not provided
 * @param allowInherit - Whether to accept the `inherit` sentinel → `null` mapping
 * @returns `undefined` (omit), `null` (inherit), or a non-empty `LoginMethod[]`
 * @throws {Error} When the value is empty, contains unknown methods, or is `inherit` on an org command
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
    if (!LOGIN_METHODS.includes(p as LoginMethod)) {
      throw new Error(
        `--login-methods: unknown method "${p}" (valid: ${LOGIN_METHODS.join(', ')})`,
      );
    }
  }

  return parts as LoginMethod[];
}

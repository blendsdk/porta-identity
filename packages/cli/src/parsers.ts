/**
 * CLI argument parsers for complex flag values.
 *
 * Provides parsing functions for CLI flags that accept structured
 * input, such as comma-separated lists. Used by command modules
 * to validate and transform raw yargs argument strings.
 *
 * @module parsers
 */

import type { InviteUserInput } from '@portaidentity/sdk';
import { LocalInputError } from './error-format.js';

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
// Role Pre-Assignment Parser
// ---------------------------------------------------------------------------

/** Canonical UUID shape accepted by the Admin API for role references. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One role pre-assignment accepted by `users.invite`. */
export interface RolePreAssignment {
  /** Application that owns the role. */
  applicationId: string;
  /** Role to assign when the invitation is accepted. */
  roleId: string;
}

/**
 * Parse repeatable `--role <application-id>:<role-id>` values.
 *
 * UUIDs never contain `:`, so the first colon is the only valid separator.
 * Every pair is validated before the caller reaches the SDK, which keeps
 * malformed input from producing a misleading server error.
 *
 * @param values - Raw `--role` values; `undefined` when the flag was omitted
 * @returns Validated pairs in flag order, or `undefined` when no flag was given
 * @throws Error when a value is not exactly one `<application-id>:<role-id>` pair
 *
 * @example
 * ```typescript
 * parseRoleAssignments([
 *   '11111111-1111-4111-8111-111111111111:22222222-2222-4222-8222-222222222222',
 * ]);
 * // Returns: [{ applicationId: '11111111-...', roleId: '22222222-...' }]
 * ```
 */
export function parseRoleAssignments(values?: string[]): RolePreAssignment[] | undefined {
  if (!values || values.length === 0) return undefined;

  return values.map((value, index) => {
    const position = index + 1;
    const separator = value.indexOf(':');

    if (separator === -1 || value.indexOf(':', separator + 1) !== -1) {
      throw new Error(
        `--role ${position} must be "<application-id>:<role-id>" (received "${value}").`,
      );
    }

    const applicationId = value.slice(0, separator).trim();
    const roleId = value.slice(separator + 1).trim();

    if (!UUID.test(applicationId) || !UUID.test(roleId)) {
      throw new Error(
        `--role ${position} must contain two valid UUIDs in "<application-id>:<role-id>" form.`,
      );
    }

    return { applicationId, roleId };
  });
}

/**
 * Reject non-finite numbers in parsed JSON without recursive traversal.
 * JSON.parse creates only plain arrays/objects, so reading their own values cannot invoke
 * user-defined code. A worklist handles deep input without exhausting the JavaScript stack.
 */
function validateFiniteClaimValue(value: unknown, position: number): void {
  const pending: unknown[] = [value];
  while (pending.length > 0) {
    const current = pending.pop();
    if (typeof current === 'number' && !Number.isFinite(current)) {
      throw new LocalInputError(`--claim ${position} must contain only finite JSON numbers.`);
    }
    if (current !== null && typeof current === 'object') {
      for (const child of Object.values(current)) pending.push(child);
    }
  }
}

/**
 * Parse ordered repeatable application/claim/JSON assignments before creating an SDK client.
 * Only the first two colons separate fields; all remaining text belongs to the JSON value.
 * Identifier spelling is retained, while duplicate detection is case-insensitive.
 *
 * @param values - Raw flag values; omitted or empty arrays add no claims
 * @returns Explicit claim records in input order, or undefined when omitted
 * @throws LocalInputError for malformed values, duplicate pairs or non-finite JSON numbers
 * @example
 * parseClaimAssignments(['11111111-1111-4111-8111-111111111111:22222222-2222-4222-8222-222222222222:"Engineering:West"'])
 */
export function parseClaimAssignments(values?: string[]): InviteUserInput['claims'] {
  if (values === undefined) return undefined;
  if (!Array.isArray(values)) throw new LocalInputError('--claim 1 must contain an assignment.');
  if (values.length === 0) return undefined;

  const seen = new Set<string>();
  return values.map((assignment: unknown, index) => {
    const position = index + 1;
    if (typeof assignment !== 'string') {
      throw new LocalInputError(`--claim ${position} must contain a string assignment.`);
    }
    const first = assignment.indexOf(':');
    const second = first < 0 ? -1 : assignment.indexOf(':', first + 1);
    if (first < 0 || second < 0) {
      throw new LocalInputError(
        `--claim ${position} must use <application-id>:<claim-definition-id>:<json>.`,
      );
    }
    const applicationId = assignment.slice(0, first).trim();
    const claimDefinitionId = assignment.slice(first + 1, second).trim();
    if (!UUID.test(applicationId) || !UUID.test(claimDefinitionId)) {
      throw new LocalInputError(`--claim ${position} must contain two valid UUIDs.`);
    }
    let value: unknown;
    try {
      value = JSON.parse(assignment.slice(second + 1));
    } catch {
      throw new LocalInputError(`--claim ${position} must contain valid JSON.`);
    }
    validateFiniteClaimValue(value, position);
    const pair = `${applicationId.toLowerCase()}:${claimDefinitionId.toLowerCase()}`;
    if (seen.has(pair)) {
      throw new LocalInputError(`--claim ${position} repeats an application and claim pair.`);
    }
    seen.add(pair);
    // Never merge the parsed value into request options: prototype-like keys stay nested data.
    return { applicationId, claimDefinitionId, value };
  });
}

/**
 * Check that ordinary JSON encoding can handle the complete prepared SDK invitation request.
 * Wrapper nesting matters: a parsed claim may be too deep when placed inside the request.
 * The encoded body is discarded; the caller dispatches the same plain input through the SDK.
 *
 * @param input - Complete invitation input, including recipient and all optional fields
 * @throws LocalInputError when ordinary JSON.stringify cannot encode the full request
 * @example validateInvitationEncoding({ organizationId: 'org-id', email: 'person@example.com' })
 */
export function validateInvitationEncoding(input: InviteUserInput): void {
  try {
    JSON.stringify(input);
  } catch {
    throw new LocalInputError('The invitation input cannot be encoded as JSON.');
  }
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

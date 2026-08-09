/**
 * Login method resolution helper.
 *
 * Computes the effective login methods for a client by applying the
 * inheritance rule: if `client.loginMethods` is `null` (or, defensively,
 * an empty array), fall back to the organization's `defaultLoginMethods`.
 * Otherwise, use the client's explicit override.
 *
 * This is the single source of truth for "which login methods apply
 * here?" and is consumed by:
 *   - the login interaction handler (to drive template rendering)
 *   - the POST /login and POST /magic-link handlers (to enforce)
 *   - the admin API + CLI (to display the resolved value)
 *
 * Both functions are pure — no I/O, no side effects, deterministic. They
 * live next to {@link ../clients/types.ts | LoginMethod} so consumers can
 * import the type and helpers from a single barrel.
 */

import type { Organization } from '../organizations/types.js';
import type { LoginMethod } from './types.js';

/**
 * Minimal client shape consumed by {@link resolveLoginMethods}.
 *
 * Defined inline (instead of `Pick<Client, 'loginMethods'>`) so this
 * helper compiles cleanly *before* the `Client` model gains the
 * `loginMethods` field in Phase 4 of the implementation plan. Once the
 * field is added, this shape stays a valid structural subtype of
 * `Client`, so call sites continue to compile without changes.
 */
export interface LoginMethodsClientView {
  /**
   * Per-client override:
   *   - `null` → inherit org defaults
   *   - non-empty array → use these methods exclusively
   *   - empty array → defensively treated as inherit (service layer
   *     rejects this on write, but the resolver stays safe on read)
   */
  loginMethods: LoginMethod[] | null;
}

/**
 * Resolve the effective login methods for a client.
 *
 * Inheritance rule:
 *   - If the client has explicit methods set (non-null **and** non-empty),
 *     return those (the override).
 *   - Otherwise, return the organization's `defaultLoginMethods`.
 *
 * The empty-array branch is defensive: the data layer should never
 * persist an empty `loginMethods` array (the service layer rejects it),
 * but treating `[]` the same as `null` keeps the resolver safe in the
 * face of unexpected upstream data.
 *
 * @param org - Organization owning the client (only `defaultLoginMethods` is read)
 * @param client - Client — either with its own `loginMethods` or `null` to inherit
 * @returns The effective array of login methods that apply to this client
 */
export function resolveLoginMethods(
  org: Pick<Organization, 'defaultLoginMethods'>,
  client: LoginMethodsClientView,
): LoginMethod[] {
  if (client.loginMethods !== null && client.loginMethods.length > 0) {
    return client.loginMethods;
  }
  return org.defaultLoginMethods;
}

/**
 * Normalize a list of login-method inputs by deduplicating while
 * preserving first-occurrence order.
 *
 * Duplicate values (e.g., `['password', 'password', 'magic_link']`) are
 * collapsed to the first occurrence, yielding `['password', 'magic_link']`.
 *
 * Used by the service layer during create/update to sanitize incoming
 * arrays before persisting. An empty input returns an empty array — the
 * caller (typically the service validator) is responsible for rejecting
 * empty inputs when they are invalid.
 *
 * @param methods - Raw input array (may contain duplicates)
 * @returns De-duplicated array preserving first-occurrence order
 */
export function normalizeLoginMethods(methods: LoginMethod[]): LoginMethod[] {
  const seen = new Set<LoginMethod>();
  const result: LoginMethod[] = [];
  for (const m of methods) {
    if (!seen.has(m)) {
      seen.add(m);
      result.push(m);
    }
  }
  return result;
}

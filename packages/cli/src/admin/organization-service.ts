/** Sanitized organization operations for the embedded administration UI. */

import { PortaHttpError } from '@portaidentity/sdk';
import type { CreateOrganizationInput, OrganizationsDomain } from '@portaidentity/sdk';
import type {
  AdminOrganizationContext,
  AdminOrganizationReconciliation,
  AdminOrganizationResult,
} from './state.js';

const ORGANIZATION_SLUG = /^[a-z0-9][a-z0-9-]{1,98}[a-z0-9]$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ORGANIZATION_STATUSES = new Set(['active', 'suspended', 'archived']);

/** Narrows an untrusted value to a supported organization lifecycle state. */
function isOrganizationStatus(value: unknown): value is AdminOrganizationContext['status'] {
  return typeof value === 'string' && ORGANIZATION_STATUSES.has(value);
}

/** Returns true when text contains a terminal control character. */
function containsTerminalControl(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f)) return true;
  }
  return false;
}

/**
 * Converts one untrusted SDK row to the only fields retained by the UI.
 *
 * @param value - Untrusted organization data returned by the SDK.
 * @returns The validated four-field projection, or `undefined` for any malformed field.
 * @example
 * ```ts
 * const context = validateOrganizationContext(sdkOrganization);
 * ```
 */
export function validateOrganizationContext(value: unknown): AdminOrganizationContext | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.id !== 'string' ||
    !UUID.test(candidate.id) ||
    typeof candidate.name !== 'string' ||
    candidate.name.length === 0 ||
    candidate.name.length > 255 ||
    containsTerminalControl(candidate.name) ||
    typeof candidate.slug !== 'string' ||
    !ORGANIZATION_SLUG.test(candidate.slug) ||
    !isOrganizationStatus(candidate.status)
  ) {
    return undefined;
  }
  return {
    id: candidate.id,
    name: candidate.name,
    slug: candidate.slug,
    status: candidate.status,
  };
}

/** Fixed error-only subset shared by every organization operation. */
type AdminOrganizationErrorResult =
  | { readonly kind: 'session-invalid' }
  | {
      readonly kind: 'failure';
      readonly failure: 'validation' | 'unauthorized' | 'conflict' | 'unavailable';
    };

/** Maps an SDK error to a fixed result without retaining remote details. */
function mapOrganizationError(error: unknown): AdminOrganizationErrorResult {
  if (!(error instanceof PortaHttpError)) {
    return { kind: 'failure', failure: 'unavailable' };
  }
  switch (error.status) {
    case 400:
      return { kind: 'failure', failure: 'validation' };
    case 401:
      return { kind: 'session-invalid' };
    case 403:
      return { kind: 'failure', failure: 'unauthorized' };
    case 409:
      return { kind: 'failure', failure: 'conflict' };
    default:
      return { kind: 'failure', failure: 'unavailable' };
  }
}

/** Maps an SDK error to the equivalent fixed reconciliation result. */
function mapReconciliationError(error: unknown): AdminOrganizationReconciliation {
  return mapOrganizationError(error);
}

/** Operations used by the admin application without exposing raw SDK responses. */
export interface AdminOrganizationOperations {
  /** Loads and validates the complete organization list once. */
  readonly listAll: () => Promise<AdminOrganizationResult<readonly AdminOrganizationContext[]>>;
  /** Refreshes one selected organization without exposing unrelated rows. */
  readonly reconcile: (selectedId: string) => Promise<AdminOrganizationReconciliation>;
  /** Creates one organization and validates the returned projection. */
  readonly create: (
    input: CreateOrganizationInput,
  ) => Promise<AdminOrganizationResult<AdminOrganizationContext>>;
}

/**
 * Creates the narrow organization boundary used by the terminal application.
 *
 * The SDK domain is obtained lazily so no authenticated client is constructed before an
 * organization operation is actually requested.
 *
 * @param domain - Returns the organization methods for the currently verified server.
 * @returns Sanitized list, create, and reconciliation operations.
 * @example
 * ```ts
 * const operations = createAdminOrganizationOperations(() => client.organizations);
 * const result = await operations.listAll();
 * ```
 */
export function createAdminOrganizationOperations(
  domain: () => Pick<OrganizationsDomain, 'listAll' | 'create'>,
): AdminOrganizationOperations {
  return {
    async listAll() {
      try {
        const rows: unknown = await domain().listAll();
        if (!Array.isArray(rows)) {
          return { kind: 'failure', failure: 'invalid-response' };
        }
        const organizations: AdminOrganizationContext[] = [];
        for (const row of rows) {
          const organization = validateOrganizationContext(row);
          if (!organization) return { kind: 'failure', failure: 'invalid-response' };
          organizations.push(organization);
        }
        return { kind: 'success', value: organizations };
      } catch (error) {
        return mapOrganizationError(error);
      }
    },

    async reconcile(selectedId) {
      try {
        const rows: unknown = await domain().listAll();
        if (!Array.isArray(rows)) {
          return { kind: 'failure', failure: 'invalid-response' };
        }

        let matchedRow: unknown;
        let matchCount = 0;
        let matchingInvalid = false;
        let unrelatedInvalid = false;
        for (const row of rows) {
          const rawId =
            row && typeof row === 'object' ? (row as Record<string, unknown>).id : undefined;
          const isMatch = rawId === selectedId;
          if (isMatch) {
            matchCount += 1;
            matchedRow = row;
          }
          const validated = validateOrganizationContext(row);
          if (!validated) {
            if (isMatch) matchingInvalid = true;
            else unrelatedInvalid = true;
          }
        }

        if (matchCount > 1 || unrelatedInvalid) {
          return { kind: 'failure', failure: 'invalid-response' };
        }
        if (matchingInvalid) return { kind: 'matching-invalid' };
        if (matchCount === 0) return { kind: 'absent' };
        const organization = validateOrganizationContext(matchedRow);
        return organization ? { kind: 'match', organization } : { kind: 'matching-invalid' };
      } catch (error) {
        return mapReconciliationError(error);
      }
    },

    async create(input) {
      const payload: CreateOrganizationInput = { name: input.name };
      if (input.slug) payload.slug = input.slug;
      if (input.defaultLocale) payload.defaultLocale = input.defaultLocale;
      try {
        const created: unknown = await domain().create(payload);
        const organization = validateOrganizationContext(created);
        return organization
          ? { kind: 'success', value: organization }
          : { kind: 'failure', failure: 'invalid-response' };
      } catch (error) {
        return mapOrganizationError(error);
      }
    },
  };
}

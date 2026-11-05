import { z } from 'zod';
import type { InviteUserInput } from '../users/invite-service.js';
import {
  ServiceAccountAuthorizationError,
  ServiceAccountValidationError,
} from './errors.js';
import type {
  ServiceAccountPolicyTarget,
  SetServiceAccountInput,
} from './types.js';

/** Maximum distinct organizations in one complete policy. */
export const MAX_SERVICE_ACCOUNT_TARGETS = 100;

/** Maximum role occurrences across all organizations, including repeated cross-target pairs. */
export const MAX_SERVICE_ACCOUNT_ROLES = 100;

/** Maximum claim-definition occurrences across the complete policy. */
export const MAX_SERVICE_ACCOUNT_CLAIMS = 100;

/** UUID spelling is normalized before uniqueness or authority comparisons. */
const identifierSchema = z.string().uuid().transform((value) => value.toLowerCase());

/** An application identifier is part of role identity, not an optional qualifier. */
const roleReferenceSchema = z.object({
  applicationId: identifierSchema,
  roleId: identifierSchema,
}).strict();

/** Policies authorize claim definitions, never caller-supplied values or wildcard claims. */
const claimReferenceSchema = z.object({
  applicationId: identifierSchema,
  claimDefinitionId: identifierSchema,
}).strict();

/** Empty assignment lists authorize ordinary invitations but no corresponding assignments. */
const targetSchema = z.object({
  organizationId: identifierSchema,
  allowedRoles: z.array(roleReferenceSchema).max(MAX_SERVICE_ACCOUNT_ROLES),
  allowedClaimDefinitions: z.array(claimReferenceSchema).max(MAX_SERVICE_ACCOUNT_CLAIMS),
}).strict();

/** Construct an unambiguous key from two already validated UUID identities. */
function pairKey(applicationId: string, definitionId: string): string {
  return `${applicationId.toLowerCase()}:${definitionId.toLowerCase()}`;
}

/**
 * Counts apply to the complete policy, not independently to each organization's arrays.
 * Pair duplication is forbidden within a target but valid, and counted again, across targets.
 */
const targetsSchema = z.array(targetSchema).min(1).max(MAX_SERVICE_ACCOUNT_TARGETS)
  .superRefine((targets, context) => {
    const organizations = new Set<string>();
    let roles = 0;
    let claims = 0;
    let duplicate = false;

    for (const target of targets) {
      if (organizations.has(target.organizationId)) duplicate = true;
      organizations.add(target.organizationId);
      roles += target.allowedRoles.length;
      claims += target.allowedClaimDefinitions.length;
      const rolePairs = new Set(target.allowedRoles.map((role) =>
        pairKey(role.applicationId, role.roleId)));
      const claimPairs = new Set(target.allowedClaimDefinitions.map((claim) =>
        pairKey(claim.applicationId, claim.claimDefinitionId)));
      if (rolePairs.size !== target.allowedRoles.length ||
          claimPairs.size !== target.allowedClaimDefinitions.length) duplicate = true;
    }

    if (duplicate || roles > MAX_SERVICE_ACCOUNT_ROLES || claims > MAX_SERVICE_ACCOUNT_CLAIMS) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid service-account policy' });
    }
  });

/** Email remains identity metadata; no lifecycle operation may infer first ownership from it. */
const inputSchema = z.object({
  accountEmail: z.string().trim().toLowerCase().email().max(255).optional(),
  targets: targetsSchema,
}).strict();

/**
 * Validate a complete management input without adopting an account or checking live references.
 * Initial email presence and authoritative application ownership belong to the lifecycle service.
 *
 * @param input - Untrusted decoded request value.
 * @returns A normalized, strict replacement input.
 * @throws ServiceAccountValidationError for every invalid shape, identity, duplicate or bound.
 * @example
 * const input = parseServiceAccountInput({
 *   accountEmail: 'operator@example.test',
 *   targets: [{ organizationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 *     allowedRoles: [], allowedClaimDefinitions: [] }],
 * });
 */
export function parseServiceAccountInput(input: unknown): SetServiceAccountInput {
  const result = inputSchema.safeParse(input);
  if (!result.success) throw new ServiceAccountValidationError();
  return result.data;
}

/**
 * Validate stored or incoming target JSON without treating missing policy as unrestricted access.
 *
 * @param input - Untrusted policy-array value.
 * @returns Validated targets with lowercase UUIDs.
 * @throws ServiceAccountValidationError when any target or assignment is invalid.
 * @example
 * const targets = parseServiceAccountTargets([{
 *   organizationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 *   allowedRoles: [], allowedClaimDefinitions: [],
 * }]);
 */
export function parseServiceAccountTargets(input: unknown): ServiceAccountPolicyTarget[] {
  const result = targetsSchema.safeParse(input);
  if (!result.success) throw new ServiceAccountValidationError();
  return result.data;
}

/**
 * Enforce a validated target's complete assignment ceiling without modifying invitation data.
 * Every requested pair must belong to this target; matching a definition in another application
 * or organization is insufficient. Live existence and canonical-application checks are separate.
 *
 * @param targets - Previously validated policy targets.
 * @param organizationId - Resolved invitation organization UUID.
 * @param input - Previously validated invitation, including optional role and claim assignments.
 * @throws ServiceAccountAuthorizationError if the target or any assignment is not allowed.
 * @example
 * assertInvitationAllowed(targets, organizationId, { email: 'recipient@example.test' });
 */
export function assertInvitationAllowed(
  targets: ServiceAccountPolicyTarget[],
  organizationId: string,
  input: InviteUserInput,
): void {
  const normalizedOrganizationId = organizationId.toLowerCase();
  const target = targets.find((candidate) =>
    candidate.organizationId.toLowerCase() === normalizedOrganizationId);
  if (!target) throw new ServiceAccountAuthorizationError();

  const roles = new Set(target.allowedRoles.map((role) =>
    pairKey(role.applicationId, role.roleId)));
  const claims = new Set(target.allowedClaimDefinitions.map((claim) =>
    pairKey(claim.applicationId, claim.claimDefinitionId)));

  if ((input.roles ?? []).some((role) => !roles.has(pairKey(role.applicationId, role.roleId))) ||
      (input.claims ?? []).some((claim) =>
        !claims.has(pairKey(claim.applicationId, claim.claimDefinitionId)))) {
    throw new ServiceAccountAuthorizationError();
  }
}

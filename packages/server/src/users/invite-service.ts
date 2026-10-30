/**
 * Shared user-invitation workflow.
 *
 * The control-plane Admin API and the tenant-scoped BFF API use the same
 * invitation pipeline: validate pre-assignments, create a single-use token,
 * replace any live invitation, send the email, and write the audit event.
 *
 * The caller supplies an actor so the audit trail records whether a Porta
 * administrator, a tenant user, or a tenant service client created the
 * invitation. Tenant callers also supply the application that owns the
 * invitation's roles and claims, which prevents cross-application authority
 * from being attached to an invitation.
 *
 * @module users/invite-service
 */

import { z } from 'zod';
import type { InvitationEmailDelivery, InvitationEmailOptions } from '../auth/email-service.js';
import { sendInvitationEmail } from '../auth/email-service.js';
import { InvitationConflictError, replaceInvitation } from '../auth/token-repository.js';
import { generateToken } from '../auth/tokens.js';
import { config } from '../config/index.js';
import {
  auditActorColumns,
  inviteActorToAuditActor,
  writeAuditLogInTransaction,
} from '../lib/audit-log.js';
import {
  afterDatabaseCommit,
  getDatabaseTransactionClient,
  getPool,
  runDatabaseTransaction,
} from '../lib/database.js';
import { getSystemConfigNumber } from '../lib/system-config.js';
import { logger } from '../lib/logger.js';
import { getOrganizationById } from '../organizations/service.js';
import { RoleDelegationError } from '../rbac/errors.js';
import { getPermissionsForRole } from '../rbac/role-service.js';
import { getUserByEmail } from './service.js';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Role pre-assignment stored with an invitation. */
const invitationRoleSchema = z.object({
  applicationId: z.string().uuid(),
  roleId: z.string().uuid(),
});

/** Custom-claim pre-assignment stored with an invitation. */
const invitationClaimSchema = z.object({
  applicationId: z.string().uuid(),
  claimDefinitionId: z.string().uuid(),
  value: z.unknown(),
});

/** Schema for the enhanced invitation request. */
export const inviteUserSchema = z.object({
  email: z.string().email(),
  givenName: z.string().min(1).max(255).optional(),
  familyName: z.string().min(1).max(255).optional(),
  personalMessage: z.string().max(500).optional(),
  roles: z.array(invitationRoleSchema).optional(),
  claims: z.array(invitationClaimSchema).optional(),
  locale: z.string().max(10).optional(),
});

/** Validated invitation request. */
export type InviteUserInput = z.infer<typeof inviteUserSchema>;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** The invitation target organization does not exist. */
export class InviteOrganizationNotFoundError extends Error {
  /** Creates the fixed organization lookup failure. */
  public constructor() {
    super('Organization not found');
    this.name = 'InviteOrganizationNotFoundError';
  }
}

/** The email address already belongs to a user in the organization. */
export class InviteUserExistsError extends Error {
  /** Creates the fixed existing-user failure. */
  public constructor() {
    super('User already exists in this organization');
    this.name = 'InviteUserExistsError';
  }
}

/** Another live invitation already owns the address. */
export class InviteConflictError extends Error {
  /** Creates the fixed live-invitation failure. */
  public constructor() {
    super('A live invitation already exists for this email');
    this.name = 'InviteConflictError';
  }
}

/** The requested role or claim pre-assignment is invalid for this caller. */
export class InvitePreAssignmentError extends Error {
  /** Creates the fixed pre-assignment failure. */
  public constructor() {
    super('User request is invalid');
    this.name = 'InvitePreAssignmentError';
  }
}

// ---------------------------------------------------------------------------
// Actor and result contracts
// ---------------------------------------------------------------------------

/** Actor that created the invitation. */
export interface InviteActor {
  /** Whether a Porta administrator, tenant user, or tenant service client acted. */
  readonly kind: 'admin' | 'user' | 'service';
  /** Porta administrator or tenant user identifier. */
  readonly userId?: string;
  /** Tenant service client identifier. */
  readonly clientId?: string;
  /** Safe display name used in the invitation email and audit context. */
  readonly displayName: string;
  /** Live tenant permissions used to enforce the delegation ceiling. */
  readonly permissions?: ReadonlySet<string>;
}

/** Inputs for one invitation workflow run. */
export interface InviteUserOptions {
  /** Target organization UUID. */
  readonly organizationId: string;
  /** Validated invitation request. */
  readonly input: InviteUserInput;
  /** Actor creating the invitation. */
  readonly actor: InviteActor;
  /**
   * When present, every role and claim must belong to this application.
   * Tenant callers set this to the token client's application.
   */
  readonly allowedApplicationId?: string;
}

/** Delivery outcome returned to invitation callers. */
export type InviteUserEmailDelivery = InvitationEmailDelivery | 'unknown';

/** Result returned after an invitation is created. */
export interface InviteUserResult {
  /** Invitation record identifier. */
  readonly invitationId: string;
  /** Recipient email address. */
  readonly email: string;
  /** Whether the invitation email was handed to the mail boundary. */
  readonly invitationSent: boolean;
  /** Delivery outcome: sent, failed, or unknown when the post-commit effect did not report. */
  readonly emailDelivery: InviteUserEmailDelivery;
  /** ISO 8601 expiration time. */
  readonly expiresAt: string;
}

// ---------------------------------------------------------------------------
// Pre-assignment validation
// ---------------------------------------------------------------------------

/**
 * Validate that referenced applications, roles, and claim definitions exist.
 *
 * When `allowedApplicationId` is supplied, every role and claim must also
 * belong to that application. This is the tenant boundary: a tenant client
 * cannot attach another application's authority to an invitation.
 *
 * @param roles - Role pre-assignments
 * @param claims - Claim pre-assignments
 * @param allowedApplicationId - Optional tenant application boundary
 * @returns Validation messages; an empty array means everything is valid
 */
export async function validatePreAssignments(
  roles: InviteUserInput['roles'],
  claims: InviteUserInput['claims'],
  allowedApplicationId?: string,
): Promise<string[]> {
  const requestedRoles = roles ?? [];
  const requestedClaims = claims ?? [];
  if (requestedRoles.length === 0 && requestedClaims.length === 0) return [];

  const pool = getPool();
  const errors: string[] = [];

  if (allowedApplicationId) {
    for (const role of requestedRoles) {
      if (role.applicationId !== allowedApplicationId) {
        errors.push('A role does not belong to the client application');
      }
    }
    for (const claim of requestedClaims) {
      if (claim.applicationId !== allowedApplicationId) {
        errors.push('A claim does not belong to the client application');
      }
    }
  }

  const appIds = new Set<string>();
  for (const role of requestedRoles) appIds.add(role.applicationId);
  for (const claim of requestedClaims) appIds.add(claim.applicationId);

  if (appIds.size > 0) {
    const result = await pool.query<{ id: string }>(
      'SELECT id FROM applications WHERE id = ANY($1::uuid[])',
      [[...appIds]],
    );
    const found = new Set(result.rows.map((row) => row.id));
    for (const appId of appIds) {
      if (!found.has(appId)) errors.push('An application does not exist');
    }
  }

  for (const role of requestedRoles) {
    const result = await pool.query('SELECT id FROM roles WHERE id = $1 AND application_id = $2', [
      role.roleId,
      role.applicationId,
    ]);
    if (result.rows.length === 0) errors.push('A role does not belong to its application');
  }

  for (const claim of requestedClaims) {
    const result = await pool.query(
      'SELECT id FROM custom_claim_definitions WHERE id = $1 AND application_id = $2',
      [claim.claimDefinitionId, claim.applicationId],
    );
    if (result.rows.length === 0) errors.push('A claim does not belong to its application');
  }

  return errors;
}

/**
 * Require every requested role to fit inside the inviter's live permissions.
 *
 * This prevents a tenant user who may invite from granting a role stronger
 * than their own. The service client path is intentionally exempt because the
 * tenant application's BFF controls its allowlist.
 *
 * @param applicationId - Application that owns the roles
 * @param roleIds - Roles requested for the invitation
 * @param permissions - Inviter's live permissions in that application
 * @throws RoleDelegationError when a role exceeds the inviter's authority
 */
export async function requireRolesWithinPermissionSet(
  applicationId: string,
  roleIds: readonly string[],
  permissions: ReadonlySet<string>,
): Promise<void> {
  for (const roleId of new Set(roleIds)) {
    const rolePermissions = await getPermissionsForRole(applicationId, roleId);
    if (rolePermissions.some((permission) => !permissions.has(permission.slug))) {
      throw new RoleDelegationError();
    }
  }
}

// ---------------------------------------------------------------------------
// Invitation workflow
// ---------------------------------------------------------------------------

/**
 * Create one invitation using the shared validation, email, and audit path.
 *
 * @param options - Target organization, request, actor, and optional tenant boundary
 * @returns Created invitation summary
 * @throws InviteOrganizationNotFoundError when the target org does not exist
 * @throws InvitePreAssignmentError when a role or claim is invalid
 * @throws InviteUserExistsError when the email already belongs to a user
 * @throws InviteConflictError when a live invitation already exists
 * @throws RoleDelegationError when a tenant user grants a stronger role
 */
export async function inviteUser(options: InviteUserOptions): Promise<InviteUserResult> {
  const { organizationId, input, actor, allowedApplicationId } = options;

  const organization = await getOrganizationById(organizationId);
  if (!organization) throw new InviteOrganizationNotFoundError();

  const preAssignmentErrors = await validatePreAssignments(
    input.roles,
    input.claims,
    allowedApplicationId,
  );
  if (preAssignmentErrors.length > 0) throw new InvitePreAssignmentError();

  if (allowedApplicationId && actor.permissions) {
    await requireRolesWithinPermissionSet(
      allowedApplicationId,
      (input.roles ?? []).map((role) => role.roleId),
      actor.permissions,
    );
  }

  const existingUser = await getUserByEmail(organizationId, input.email);
  if (existingUser) throw new InviteUserExistsError();

  const { plaintext, hash } = generateToken();
  const invitationTtl = await getSystemConfigNumber('invitation_ttl');
  const expiresAt = new Date(Date.now() + invitationTtl * 1000);

  const details: Record<string, unknown> = {};
  if (input.personalMessage) details.personalMessage = input.personalMessage;
  if (input.roles?.length) details.roles = input.roles;
  if (input.claims?.length) details.claims = input.claims;
  details.inviterName = actor.displayName;

  const auditActor = inviteActorToAuditActor(actor);
  const inviteUrl = `${config.issuerBaseUrl}/${organization.slug}/auth/accept-invite/${plaintext}`;

  let invitationId: string;
  const deliveryOutcome: { value: InviteUserEmailDelivery } = { value: 'unknown' };
  try {
    invitationId = await runDatabaseTransaction(async () => {
      const invitation = await replaceInvitation({
        organizationId,
        applicationId: allowedApplicationId ?? null,
        email: input.email,
        tokenHash: hash,
        expiresAt,
        givenName: input.givenName ?? null,
        familyName: input.familyName ?? null,
        locale: input.locale ?? null,
        details: Object.keys(details).length > 0 ? details : null,
        invitedBy: actor.kind === 'service' ? null : (actor.userId ?? null),
      });

      const transaction = getDatabaseTransactionClient();
      if (!transaction) {
        throw new Error('Invitation creation requires an active database transaction');
      }

      await writeAuditLogInTransaction(transaction, {
        organizationId,
        ...auditActorColumns(auditActor),
        eventType: 'user.invited',
        eventCategory: 'admin',
        description: 'User invitation created',
        metadata: {
          invitationId: invitation.id,
          hasPersonalMessage: Boolean(input.personalMessage),
          preAssignedRoles: input.roles?.length ?? 0,
          preAssignedClaims: input.claims?.length ?? 0,
          actorKind: actor.kind,
          ...(actor.kind === 'service' && actor.clientId
            ? { serviceClientId: actor.clientId }
            : {}),
        },
      });

      const emailOptions: InvitationEmailOptions = {
        invitationId: invitation.id,
        expiresInSeconds: invitationTtl,
      };
      if (input.personalMessage) emailOptions.personalMessage = input.personalMessage;
      emailOptions.inviterName = actor.displayName;

      await afterDatabaseCommit(async () => {
        try {
          deliveryOutcome.value = await sendInvitationEmail(
            {
              email: input.email,
              givenName: input.givenName ?? null,
              familyName: input.familyName ?? null,
            },
            organization,
            inviteUrl,
            input.locale ?? organization.defaultLocale ?? 'en',
            emailOptions,
          );
        } catch {
          deliveryOutcome.value = 'unknown';
          logger.warn(
            { event: 'invitation-email-outcome-unknown', invitationId: invitation.id },
            'Invitation email delivery outcome is unknown',
          );
        }
      });

      return invitation.id;
    });
  } catch (error) {
    if (error instanceof InvitationConflictError) throw new InviteConflictError();
    throw error;
  }

  return {
    invitationId,
    email: input.email,
    invitationSent: deliveryOutcome.value === 'sent',
    emailDelivery: deliveryOutcome.value,
    expiresAt: expiresAt.toISOString(),
  };
}

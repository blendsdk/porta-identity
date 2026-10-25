/**
 * Shared user-route error mapper.
 *
 * Admin, tenant, and standalone user routers share one sanitized mapping so a
 * new domain error cannot surface differently on only one surface. The only
 * intentional difference is the duplicate-email status: Admin keeps `400` and
 * the tenant surface returns `409`.
 *
 * @module routes/user-error-handler
 */

import { z } from 'zod';
import { SuperAdminProtectionError } from '../lib/super-admin-protection.js';
import { RoleDelegationError, RoleNotFoundError, RbacValidationError } from '../rbac/errors.js';
import {
  InviteConflictError,
  InviteOrganizationNotFoundError,
  InvitePreAssignmentError,
  InviteUserExistsError,
} from '../users/invite-service.js';
import {
  UserEmailConflictError,
  UserNotFoundError,
  UserValidationError,
} from '../users/errors.js';

/** Minimal response context used by the shared mapper. */
interface ErrorContext {
  status: number;
  body: unknown;
  throw: (status: number, message: string) => never;
}

/** Surface-specific duplicate-email policy. */
export interface UserRouteErrorOptions {
  /** Admin keeps `400`; the tenant surface uses `409`. */
  readonly duplicateEmailStatus?: 400 | 409;
}

/**
 * Map a user-route domain error to a sanitized response.
 *
 * Unknown errors are re-thrown so the global error boundary can handle them.
 *
 * @param ctx - Koa context or compatible test context
 * @param error - Caught value
 * @param options - Surface-specific duplicate-email policy
 */
export function handleUserRouteError(
  ctx: ErrorContext,
  error: unknown,
  options: UserRouteErrorOptions = {},
): never {
  if (error instanceof SuperAdminProtectionError) {
    ctx.status = 403;
    ctx.body = { error: 'Forbidden', message: 'The requested operation is not permitted' };
    return undefined as never;
  }
  if (error instanceof InviteOrganizationNotFoundError) {
    ctx.throw(404, 'Organization not found');
  }
  if (error instanceof InviteUserExistsError) {
    ctx.status = 409;
    ctx.body = { error: 'User already exists in this organization' };
    return undefined as never;
  }
  if (error instanceof InviteConflictError) {
    ctx.status = 409;
    ctx.body = { error: 'A live invitation already exists for this email' };
    return undefined as never;
  }
  if (error instanceof InvitePreAssignmentError) {
    ctx.status = 400;
    ctx.body = { error: 'User request is invalid' };
    return undefined as never;
  }
  if (error instanceof UserEmailConflictError) {
    ctx.status = options.duplicateEmailStatus ?? 400;
    ctx.body = { error: 'User already exists in this organization' };
    return undefined as never;
  }
  if (error instanceof RoleDelegationError) {
    ctx.status = 403;
    ctx.body = { error: 'Forbidden', message: 'The requested operation is not permitted' };
    return undefined as never;
  }
  if (error instanceof RoleNotFoundError) {
    ctx.throw(404, 'Role not found');
  }
  if (error instanceof RbacValidationError) {
    ctx.status = 400;
    ctx.body = { error: 'User request is invalid' };
    return undefined as never;
  }
  if (error instanceof UserNotFoundError) {
    ctx.throw(404, 'User not found');
  }
  if (error instanceof UserValidationError) {
    ctx.throw(400, 'User request is invalid');
  }
  if (error instanceof z.ZodError) {
    ctx.status = 400;
    ctx.body = { error: 'User request is invalid' };
    return undefined as never;
  }
  throw error;
}

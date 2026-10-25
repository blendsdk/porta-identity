/**
 * Tenant-scoped OAuth scope names.
 *
 * These values are shared by the OIDC provider configuration and the tenant
 * user middleware. A scope must be registered as supported before an OIDC
 * client can carry it in its metadata; otherwise the provider rejects the
 * client at the token endpoint.
 *
 * @module oidc/scopes
 */

/** Scope that authorizes a tenant service client to read users and roles. */
export const TENANT_USER_READ_SCOPE = 'org:user:read';

/** Scope that authorizes tenant user profile, lifecycle, and role changes. */
export const TENANT_USER_WRITE_SCOPE = 'org:user:write';

/** Scope that authorizes permanent tenant user deletion. */
export const TENANT_USER_DELETE_SCOPE = 'org:user:delete';

/** Scope that authorizes a tenant service client or user to invite users. */
export const TENANT_INVITE_SCOPE = 'org:user:invite';

/** Permission that authorizes a tenant user to invite users. */
export const TENANT_INVITE_PERMISSION = TENANT_INVITE_SCOPE;

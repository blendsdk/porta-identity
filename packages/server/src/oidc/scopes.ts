/**
 * Tenant-scoped OAuth scope names.
 *
 * These values are shared by the OIDC provider configuration and the tenant
 * invitation middleware. A scope must be registered as supported before an
 * OIDC client can carry it in its metadata; otherwise the provider rejects the
 * client at the token endpoint.
 *
 * @module oidc/scopes
 */

/** Scope that authorizes a tenant service client to invite users. */
export const TENANT_INVITE_SCOPE = 'org:user:invite';

/** Permission that authorizes a tenant user to invite users. */
export const TENANT_INVITE_PERMISSION = TENANT_INVITE_SCOPE;

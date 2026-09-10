/** Immutable role and permission values retained by the terminal administration application. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLE_SLUG = /^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/;
const PERMISSION_SEGMENT = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;

/** Allowlisted application role safe for terminal presentation. */
export interface AdminRole {
  /** Stable role UUID. */
  readonly id: string;
  /** Application that owns the role. */
  readonly applicationId: string;
  /** Human-readable role name. */
  readonly name: string;
  /** Stable role key. */
  readonly slug: string;
  /** Optional multiline explanation. */
  readonly description: string | null;
  /** Creation timestamp. */
  readonly createdAt: string;
  /** Most recent update timestamp. */
  readonly updatedAt: string;
}

/** Allowlisted application permission safe for terminal presentation. */
export interface AdminPermission {
  /** Stable permission UUID. */
  readonly id: string;
  /** Application that owns the permission. */
  readonly applicationId: string;
  /** Optional application module that groups the permission. */
  readonly moduleId: string | null;
  /** Human-readable permission name. */
  readonly name: string;
  /** Stable `module:resource:action` permission key. */
  readonly slug: string;
  /** Optional multiline explanation. */
  readonly description: string | null;
  /** Creation timestamp. */
  readonly createdAt: string;
}

/** Fixed RBAC failure categories safe to display. */
export type AdminRbacFailureKind =
  'validation' | 'unauthorized' | 'conflict' | 'unavailable' | 'invalid-response';

/** Sanitized result returned by an RBAC read. */
export type AdminRbacReadResult<T> =
  | { readonly kind: 'success'; readonly value: T }
  | { readonly kind: 'session-invalid' }
  | { readonly kind: 'failure'; readonly failure: AdminRbacFailureKind };

/** Sanitized result returned by a mutation with no authority-reduction contract. */
export type AdminRbacMutationResult<T = void> =
  | ({ readonly kind: 'success' } & (T extends void ? object : { readonly value: T }))
  | { readonly kind: 'session-invalid' }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'outcome-unknown' }
  | { readonly kind: 'failure'; readonly failure: AdminRbacFailureKind };

/** Sanitized committed result returned by an authority-reducing mutation. */
export type AdminRbacReductionResult<T = void> =
  | ({ readonly kind: 'success'; readonly reauthenticationRequired: boolean } & (T extends void
      ? object
      : { readonly value: T }))
  | { readonly kind: 'session-invalid' }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'outcome-unknown' }
  | { readonly kind: 'failure'; readonly failure: AdminRbacFailureKind };

/** Complete validated RBAC collection for one selected application. */
export interface AdminApplicationRbacReadyProjection {
  /** Ready-state discriminator. */
  readonly kind: 'ready';
  /** Application that owns every retained row. */
  readonly applicationId: string;
  /** Complete role collection. */
  readonly roles: readonly AdminRole[];
  /** Complete permission collection. */
  readonly permissions: readonly AdminPermission[];
  /** Permissions assigned to the role currently being managed. */
  readonly assignedPermissions?: readonly AdminPermission[];
  /** Permissions not assigned to the role currently being managed. */
  readonly availablePermissions?: readonly AdminPermission[];
}

/** Validated RBAC state that may remain visible during recovery. */
export type AdminApplicationRbacProjection = AdminApplicationRbacReadyProjection;

/** Complete Application-owned RBAC controller state. */
export type AdminApplicationRbacViewState =
  | { readonly kind: 'closed' }
  | { readonly kind: 'loading'; readonly previous?: AdminApplicationRbacProjection }
  | AdminApplicationRbacProjection
  | { readonly kind: 'indeterminate'; readonly previous?: AdminApplicationRbacProjection }
  | {
      readonly kind: 'failure';
      readonly failure: AdminRbacFailureKind;
      readonly previous?: AdminApplicationRbacProjection;
    };

/** Returns true when text contains a terminal control other than an allowed line ending. */
function containsTerminalControl(value: string, allowLineEndings = false): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (allowLineEndings && (codePoint === 0x0a || codePoint === 0x0d)) continue;
    if (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f)) return true;
  }
  return false;
}

/** Validates bounded terminal-safe text. */
function isText(
  value: unknown,
  maximum: number,
  minimum = 0,
  allowLineEndings = false,
): value is string {
  return (
    typeof value === 'string' &&
    value.length >= minimum &&
    value.length <= maximum &&
    !containsTerminalControl(value, allowLineEndings)
  );
}

/** Validates an ISO timestamp used for presentation. */
function isTimestamp(value: unknown): value is string {
  if (!isText(value, 40, 20) || !ISO_TIMESTAMP.test(value)) return false;
  const parsed = new Date(value);
  return (
    Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 19) === value.slice(0, 19)
  );
}

/** Returns an object-shaped untrusted value. */
function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Validates a permission slug without importing server-only validation code. */
export function isAdminPermissionSlug(value: unknown): value is string {
  if (!isText(value, 150, 5)) return false;
  const segments = value.split(':');
  return segments.length >= 3 && segments.every((segment) => PERMISSION_SEGMENT.test(segment));
}

/** Projects one role and verifies its application owner. */
export function validateAdminRole(value: unknown, applicationId: string): AdminRole | undefined {
  const candidate = objectValue(value);
  if (
    !UUID.test(applicationId) ||
    !candidate ||
    !isText(candidate.id, 36, 36) ||
    !UUID.test(candidate.id) ||
    candidate.applicationId !== applicationId ||
    !isText(candidate.name, 255, 1) ||
    !isText(candidate.slug, 100, 1) ||
    !ROLE_SLUG.test(candidate.slug) ||
    !(candidate.description === null || isText(candidate.description, 1_000, 0, true)) ||
    !isTimestamp(candidate.createdAt) ||
    !isTimestamp(candidate.updatedAt)
  ) {
    return undefined;
  }
  return Object.freeze({
    id: candidate.id,
    applicationId,
    name: candidate.name,
    slug: candidate.slug,
    description: candidate.description,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
  });
}

/** Projects one permission and verifies its application owner. */
export function validateAdminPermission(
  value: unknown,
  applicationId: string,
): AdminPermission | undefined {
  const candidate = objectValue(value);
  if (
    !UUID.test(applicationId) ||
    !candidate ||
    !isText(candidate.id, 36, 36) ||
    !UUID.test(candidate.id) ||
    candidate.applicationId !== applicationId ||
    !(
      candidate.moduleId === null ||
      (isText(candidate.moduleId, 36, 36) && UUID.test(candidate.moduleId))
    ) ||
    !isText(candidate.name, 255, 1) ||
    !isAdminPermissionSlug(candidate.slug) ||
    !(candidate.description === null || isText(candidate.description, 1_000, 0, true)) ||
    !isTimestamp(candidate.createdAt)
  ) {
    return undefined;
  }
  return Object.freeze({
    id: candidate.id,
    applicationId,
    moduleId: candidate.moduleId,
    name: candidate.name,
    slug: candidate.slug,
    description: candidate.description,
    createdAt: candidate.createdAt,
  });
}

/** Projects a complete role collection without retaining partial or duplicate data. */
export function validateAdminRoleCollection(
  value: unknown,
  applicationId: string,
): readonly AdminRole[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const roles: AdminRole[] = [];
  const ids = new Set<string>();
  for (const entry of value) {
    const role = validateAdminRole(entry, applicationId);
    if (!role || ids.has(role.id)) return undefined;
    ids.add(role.id);
    roles.push(role);
  }
  return Object.freeze(roles);
}

/** Projects a complete permission collection without retaining partial or duplicate data. */
export function validateAdminPermissionCollection(
  value: unknown,
  applicationId: string,
): readonly AdminPermission[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const permissions: AdminPermission[] = [];
  const ids = new Set<string>();
  for (const entry of value) {
    const permission = validateAdminPermission(entry, applicationId);
    if (!permission || ids.has(permission.id)) return undefined;
    ids.add(permission.id);
    permissions.push(permission);
  }
  return Object.freeze(permissions);
}

/** Reads the fixed authority-reduction flag from an untrusted response. */
export function validateAdminAuthorityReduction(
  value: unknown,
): { readonly reauthenticationRequired: boolean } | undefined {
  const candidate = objectValue(value);
  return candidate && typeof candidate.reauthenticationRequired === 'boolean'
    ? Object.freeze({ reauthenticationRequired: candidate.reauthenticationRequired })
    : undefined;
}

/** Reads a role update and its fixed authority-reduction flag from an untrusted response. */
export function validateAdminRoleUpdate(
  value: unknown,
  applicationId: string,
): { readonly role: AdminRole; readonly reauthenticationRequired: boolean } | undefined {
  const candidate = objectValue(value);
  const role = candidate ? validateAdminRole(candidate.role, applicationId) : undefined;
  return role && typeof candidate?.reauthenticationRequired === 'boolean'
    ? Object.freeze({ role, reauthenticationRequired: candidate.reauthenticationRequired })
    : undefined;
}

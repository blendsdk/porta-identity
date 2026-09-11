/** Sanitized organization operations for the embedded administration UI. */

import {
  PortaAuthenticationError,
  PortaConflictError,
  PortaForbiddenError,
  PortaHttpError,
  PortaValidationError,
} from '@portaidentity/sdk';
import type {
  BrandingAssetUploadInput,
  BrandingDomain,
  CreateOrganizationInput,
  OrganizationsDomain,
  TwoFactorDomain,
  UpdateBrandingSettingsInput,
} from '@portaidentity/sdk';
import type {
  AdminOrganizationAsset,
  AdminOrganizationAssetContentType,
  AdminOrganizationAssetType,
  AdminOrganizationBranding,
  AdminOrganizationContext,
  AdminOrganizationLoginMethod,
  AdminOrganizationOverviewInput,
  AdminOrganizationReconciliation,
  AdminOrganizationResult,
  AdminOrganizationSettings,
  AdminOrganizationTwoFactorPolicy,
  AdminOrganizationWorkspaceMutationResult,
  AdminOrganizationWorkspaceReadResult,
} from './state.js';

const ORGANIZATION_SLUG = /^[a-z0-9][a-z0-9-]{1,98}[a-z0-9]$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ORGANIZATION_STATUSES = new Set(['active', 'suspended']);
const LOGIN_METHODS = new Set<AdminOrganizationLoginMethod>(['password', 'magic_link']);
const TWO_FACTOR_POLICIES = new Set<AdminOrganizationTwoFactorPolicy>(
  ['optional', 'required_email', 'required_totp', 'required_any'],
);
const ASSET_CONTENT_TYPES = new Set<AdminOrganizationAssetContentType>(
  ['image/png', 'image/jpeg', 'image/webp', 'image/x-icon', 'image/vnd.microsoft.icon', 'image/svg+xml'],
);
const ASSET_LIMITS: Readonly<Record<AdminOrganizationAssetType, number>> = {
  logo: 2 * 1024 * 1024,
  favicon: 512 * 1024,
};

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

/** Returns true for a bounded, terminal-safe text value. */
function isText(value: unknown, maximum: number, minimum = 0): value is string {
  return (
    typeof value === 'string' &&
    value.length >= minimum &&
    value.length <= maximum &&
    !containsTerminalControl(value)
  );
}

/** Validates an ISO timestamp retained only for human-readable display. */
function isTimestamp(value: unknown): value is string {
  if (
    !isText(value, 40, 20) ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(value)
  ) {
    return false;
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 19) === value.slice(0, 19);
}

/** Narrows one value to the supported organization login-method set. */
function isLoginMethod(value: unknown): value is AdminOrganizationLoginMethod {
  return typeof value === 'string' && LOGIN_METHODS.has(value as AdminOrganizationLoginMethod);
}

/** Projects a non-empty, duplicate-free login-method collection. */
function loginMethodValue(value: unknown): readonly AdminOrganizationLoginMethod[] | undefined {
  if (!Array.isArray(value) || value.length < 1 || value.length > LOGIN_METHODS.size) {
    return undefined;
  }
  const methods: AdminOrganizationLoginMethod[] = [];
  for (const method of value) {
    if (!isLoginMethod(method) || methods.includes(method)) return undefined;
    methods.push(method);
  }
  return Object.freeze(methods);
}

/** Narrows one value to the supported organization two-factor policy set. */
function isTwoFactorPolicy(value: unknown): value is AdminOrganizationTwoFactorPolicy {
  return (
    typeof value === 'string' &&
    TWO_FACTOR_POLICIES.has(value as AdminOrganizationTwoFactorPolicy)
  );
}

/** Validates an optional organization branding image URL. */
function isBrandingUrl(value: unknown): value is string | null {
  if (value === null) return true;
  if (!isText(value, 2_048, 1) || value.trim() !== value) return false;
  try {
    const url = new URL(value);
    if (url.username || url.password) return false;
    if (url.protocol === 'https:') return true;
    return (
      url.protocol === 'http:' &&
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]')
    );
  } catch {
    return false;
  }
}

/**
 * Projects the full organization settings used by the focused workspace.
 *
 * @param value - Untrusted organization returned by the SDK.
 * @returns A frozen safe projection, or `undefined` when any retained field is invalid.
 * @example
 * ```ts
 * const settings = validateOrganizationSettings(sdkOrganization);
 * ```
 */
export function validateOrganizationSettings(value: unknown): AdminOrganizationSettings | undefined {
  const context = validateOrganizationContext(value);
  if (!context || !value || typeof value !== 'object') return undefined;
  const candidate = value as Record<string, unknown>;
  const methods = loginMethodValue(candidate.defaultLoginMethods);
  if (
    typeof candidate.isSuperAdmin !== 'boolean' ||
    !isText(candidate.defaultLocale, 10, 2) ||
    !/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(candidate.defaultLocale) ||
    !methods ||
    !isTwoFactorPolicy(candidate.twoFactorPolicy) ||
    !(candidate.brandingCompanyName === null || isText(candidate.brandingCompanyName, 255)) ||
    !(
      candidate.brandingPrimaryColor === null ||
      (typeof candidate.brandingPrimaryColor === 'string' &&
        /^#[0-9A-Fa-f]{6}$/.test(candidate.brandingPrimaryColor))
    ) ||
    !isBrandingUrl(candidate.brandingLogoUrl) ||
    !isBrandingUrl(candidate.brandingFaviconUrl) ||
    !isTimestamp(candidate.createdAt) ||
    !isTimestamp(candidate.updatedAt)
  ) {
    return undefined;
  }
  return Object.freeze({
    ...context,
    isSuperAdmin: candidate.isSuperAdmin,
    defaultLocale: candidate.defaultLocale,
    defaultLoginMethods: methods,
    twoFactorPolicy: candidate.twoFactorPolicy,
    brandingCompanyName: candidate.brandingCompanyName,
    brandingPrimaryColor: candidate.brandingPrimaryColor,
    brandingLogoUrl: candidate.brandingLogoUrl,
    brandingFaviconUrl: candidate.brandingFaviconUrl,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
  });
}

/** Projects one branding asset and verifies its organization and decoded-size boundary. */
function assetValue(value: unknown, organizationId: string): AdminOrganizationAsset | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.id !== 'string' ||
    !UUID.test(candidate.id) ||
    candidate.organizationId !== organizationId ||
    !(candidate.assetType === 'logo' || candidate.assetType === 'favicon') ||
    typeof candidate.contentType !== 'string' ||
    !ASSET_CONTENT_TYPES.has(candidate.contentType as AdminOrganizationAssetContentType) ||
    typeof candidate.fileSize !== 'number' ||
    !Number.isSafeInteger(candidate.fileSize) ||
    candidate.fileSize < 1 ||
    candidate.fileSize > ASSET_LIMITS[candidate.assetType] ||
    !isTimestamp(candidate.updatedAt)
  ) {
    return undefined;
  }
  return Object.freeze({
    assetType: candidate.assetType,
    contentType: candidate.contentType as AdminOrganizationAssetContentType,
    size: candidate.fileSize,
    updatedAt: candidate.updatedAt,
  });
}

/** Projects a complete asset collection without duplicates or partial values. */
function assetCollection(
  value: unknown,
  organizationId: string,
): readonly AdminOrganizationAsset[] | undefined {
  if (!Array.isArray(value) || value.length > 2) return undefined;
  const slots = new Set<AdminOrganizationAssetType>();
  const assets: AdminOrganizationAsset[] = [];
  for (const row of value) {
    const asset = assetValue(row, organizationId);
    if (!asset || slots.has(asset.assetType)) return undefined;
    slots.add(asset.assetType);
    assets.push(asset);
  }
  return Object.freeze(assets);
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
    !isOrganizationStatus(candidate.status) ||
    (candidate.isSuperAdmin !== undefined && typeof candidate.isSuperAdmin !== 'boolean')
  ) {
    return undefined;
  }
  return {
    id: candidate.id,
    name: candidate.name,
    slug: candidate.slug,
    status: candidate.status,
    ...(candidate.isSuperAdmin === true ? { isSuperAdmin: true } : {}),
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
  /** Permanently deletes one organization. */
  readonly delete: (id: string) => Promise<AdminOrganizationResult<void>>;
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
  domain: () => Pick<OrganizationsDomain, 'listAll' | 'create' | 'delete'>,
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
    async delete(id) {
      if (!UUID.test(id)) return { kind: 'failure', failure: 'validation' };
      try {
        await domain().delete(id);
        return { kind: 'success', value: undefined };
      } catch (error) {
        return mapOrganizationError(error);
      }
    },
  };
}

/** Existing SDK domains required only by the selected-organization workspace. */
export interface AdminOrganizationWorkspaceDomains {
  /** Returns organization settings and lifecycle operations for the verified session. */
  readonly organizations: () => Pick<
    OrganizationsDomain,
    'get' | 'update' | 'activate' | 'suspend'
  >;
  /** Returns organization branding settings and asset operations. */
  readonly branding: () => Pick<
    BrandingDomain,
    'listAssets' | 'updateSettings' | 'uploadAsset' | 'deleteAsset'
  >;
  /** Returns the existing organization two-factor policy operations. */
  readonly twoFactor: () => Pick<TwoFactorDomain, 'getPolicy' | 'setPolicy'>;
}

/** Common organization-qualified read signature used by workspace resources. */
type OrganizationWorkspaceRead<T> = (
  organizationId: string,
  signal?: AbortSignal,
) => Promise<AdminOrganizationWorkspaceReadResult<T>>;
/** Common organization-qualified mutation signature used by lifecycle actions. */
type OrganizationWorkspaceMutation = (
  organizationId: string,
  signal?: AbortSignal,
) => Promise<AdminOrganizationWorkspaceMutationResult>;
/** Common organization-qualified update signature for one validated settings value. */
type OrganizationWorkspaceUpdate<T> = (
  organizationId: string,
  value: T,
  signal?: AbortSignal,
) => Promise<AdminOrganizationWorkspaceMutationResult>;

/** Organization-qualified image upload signature. */
type OrganizationWorkspaceAssetUpload = (
  organizationId: string,
  assetType: AdminOrganizationAssetType,
  input: BrandingAssetUploadInput,
  signal?: AbortSignal,
) => Promise<AdminOrganizationWorkspaceMutationResult>;
/** Organization-qualified image deletion signature. */
type OrganizationWorkspaceAssetDelete = (
  organizationId: string,
  assetType: AdminOrganizationAssetType,
  signal?: AbortSignal,
) => Promise<AdminOrganizationWorkspaceMutationResult>;

/** Direct validated operations consumed by the organization workspace controller. */
export interface AdminOrganizationWorkspaceOperations {
  /** Loads the complete validated organization settings projection. */
  readonly get: OrganizationWorkspaceRead<AdminOrganizationSettings>;
  /** Updates changed Overview fields without an ETag. */
  readonly update: OrganizationWorkspaceUpdate<AdminOrganizationOverviewInput>;
  /** Activates the selected organization. */
  readonly activate: OrganizationWorkspaceMutation;
  /** Suspends the selected organization. */
  readonly suspend: OrganizationWorkspaceMutation;
  /** Loads the organization login-method defaults. */
  readonly getLoginMethods: OrganizationWorkspaceRead<readonly AdminOrganizationLoginMethod[]>;
  /** Updates the non-empty organization login-method defaults. */
  readonly updateLoginMethods: OrganizationWorkspaceUpdate<
    readonly AdminOrganizationLoginMethod[]
  >;
  /** Loads the organization-wide password-login two-factor policy. */
  readonly getTwoFactorPolicy: OrganizationWorkspaceRead<AdminOrganizationTwoFactorPolicy>;
  /** Updates the organization-wide password-login two-factor policy. */
  readonly updateTwoFactorPolicy: OrganizationWorkspaceUpdate<AdminOrganizationTwoFactorPolicy>;
  /** Loads the four text branding values from the organization resource. */
  readonly getBranding: OrganizationWorkspaceRead<AdminOrganizationBranding>;
  /** Updates changed branding text fields independently from image assets. */
  readonly updateBranding: OrganizationWorkspaceUpdate<UpdateBrandingSettingsInput>;
  /** Lists complete validated logo and favicon metadata. */
  readonly listAssets: OrganizationWorkspaceRead<readonly AdminOrganizationAsset[]>;
  /** Creates or replaces one validated image asset. */
  readonly uploadAsset: OrganizationWorkspaceAssetUpload;
  /** Permanently removes one stored image asset. */
  readonly deleteAsset: OrganizationWorkspaceAssetDelete;
}

/** Maps an SDK read failure to a fixed workspace result. */
function workspaceReadError(error: unknown): AdminOrganizationWorkspaceReadResult<never> {
  if (error instanceof PortaAuthenticationError) return { kind: 'session-invalid' };
  if (error instanceof PortaValidationError) return { kind: 'failure', failure: 'validation' };
  if (error instanceof PortaForbiddenError) return { kind: 'failure', failure: 'unauthorized' };
  if (error instanceof PortaConflictError) return { kind: 'failure', failure: 'conflict' };
  return { kind: 'failure', failure: 'unavailable' };
}

/** Maps an SDK mutation failure without exposing its response or message. */
function workspaceMutationError(error: unknown): AdminOrganizationWorkspaceMutationResult {
  if (error instanceof DOMException && error.name === 'AbortError') return { kind: 'cancelled' };
  if (error instanceof PortaAuthenticationError) return { kind: 'session-invalid' };
  if (error instanceof PortaValidationError) return { kind: 'failure', failure: 'validation' };
  if (error instanceof PortaForbiddenError) return { kind: 'failure', failure: 'unauthorized' };
  if (error instanceof PortaConflictError) return { kind: 'failure', failure: 'conflict' };
  return { kind: 'outcome-unknown' };
}

/** Extracts the organization payload from the SDK's ETag wrapper. */
function organizationPayload(value: unknown): unknown {
  return value && typeof value === 'object' && 'data' in value
    ? (value as Record<string, unknown>).data
    : undefined;
}

/** Loads and validates a complete organization without retaining its ETag. */
async function loadWorkspaceOrganization(
  domains: AdminOrganizationWorkspaceDomains,
  organizationId: string,
): Promise<AdminOrganizationWorkspaceReadResult<AdminOrganizationSettings>> {
  if (!UUID.test(organizationId)) return { kind: 'failure', failure: 'validation' };
  try {
    const organization = validateOrganizationSettings(
      organizationPayload(await domains.organizations().get(organizationId)),
    );
    return organization
      ? { kind: 'success', value: organization }
      : { kind: 'failure', failure: 'invalid-response' };
  } catch (error) {
    return workspaceReadError(error);
  }
}

/** Validates the two editable Overview values and rejects empty updates. */
function isOverviewInput(value: AdminOrganizationOverviewInput): boolean {
  const keys = Object.keys(value);
  if (keys.length < 1 || keys.some((key) => key !== 'name' && key !== 'defaultLocale')) return false;
  if (value.name !== undefined && !isText(value.name, 255, 1)) return false;
  return !(
    value.defaultLocale !== undefined &&
    (!isText(value.defaultLocale, 10, 2) ||
      !/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(value.defaultLocale))
  );
}

/** Validates a changed branding payload while deliberately excluding custom CSS. */
function isBrandingInput(value: UpdateBrandingSettingsInput): boolean {
  const keys = Object.keys(value);
  const allowed = new Set(['companyName', 'primaryColor', 'logoUrl', 'faviconUrl']);
  if (keys.length < 1 || keys.some((key) => !allowed.has(key))) return false;
  if (
    !(
      value.companyName === undefined ||
      value.companyName === null ||
      isText(value.companyName, 255)
    )
  ) {
    return false;
  }
  if (
    !(
      value.primaryColor === undefined ||
      value.primaryColor === null ||
      /^#[0-9A-Fa-f]{6}$/.test(value.primaryColor)
    )
  ) {
    return false;
  }
  return (
    (value.logoUrl === undefined || isBrandingUrl(value.logoUrl)) &&
    (value.faviconUrl === undefined || isBrandingUrl(value.faviconUrl))
  );
}

/** Validates the JSON/base64 upload envelope before it reaches the SDK. */
function isAssetUploadInput(
  input: BrandingAssetUploadInput,
  assetType: AdminOrganizationAssetType,
): boolean {
  if (!ASSET_CONTENT_TYPES.has(input.contentType) || input.data.length === 0) return false;
  const bytes = Buffer.from(input.data, 'base64');
  return (
    bytes.length > 0 &&
    bytes.length <= ASSET_LIMITS[assetType] &&
    bytes.toString('base64') === input.data
  );
}

/** Invokes a void workspace mutation exactly once. */
async function workspaceVoidMutation(
  invoke: () => Promise<unknown>,
): Promise<AdminOrganizationWorkspaceMutationResult> {
  try {
    await invoke();
    return { kind: 'success' };
  } catch (error) {
    return workspaceMutationError(error);
  }
}

/**
 * Creates the direct SDK adapter used only by the selected-organization workspace.
 *
 * @param domains - Lazy access to the verified session's existing SDK domains.
 * @returns Validated operations that expose only fixed safe outcomes.
 * @example
 * ```ts
 * const operations = createAdminOrganizationWorkspaceOperations(domains);
 * ```
 */
export function createAdminOrganizationWorkspaceOperations(
  domains: AdminOrganizationWorkspaceDomains,
): AdminOrganizationWorkspaceOperations {
  return {
    get: (organizationId) => loadWorkspaceOrganization(domains, organizationId),
    async update(organizationId, input) {
      if (!UUID.test(organizationId) || !isOverviewInput(input)) {
        return { kind: 'failure', failure: 'validation' };
      }
      try {
        const organization = validateOrganizationSettings(
          await domains.organizations().update(organizationId, input),
        );
        return organization ? { kind: 'success' } : { kind: 'outcome-unknown' };
      } catch (error) {
        return workspaceMutationError(error);
      }
    },
    activate: (organizationId) =>
      UUID.test(organizationId)
        ? workspaceVoidMutation(() => domains.organizations().activate(organizationId))
        : Promise.resolve({ kind: 'failure', failure: 'validation' }),
    suspend: (organizationId) =>
      UUID.test(organizationId)
        ? workspaceVoidMutation(() => domains.organizations().suspend(organizationId))
        : Promise.resolve({ kind: 'failure', failure: 'validation' }),
    async getLoginMethods(organizationId) {
      const result = await loadWorkspaceOrganization(domains, organizationId);
      return result.kind === 'success'
        ? { kind: 'success', value: result.value.defaultLoginMethods }
        : result;
    },
    async updateLoginMethods(organizationId, methods) {
      const validated = loginMethodValue(methods);
      if (!UUID.test(organizationId) || !validated) {
        return { kind: 'failure', failure: 'validation' };
      }
      try {
        const organization = validateOrganizationSettings(
          await domains.organizations().update(organizationId, {
            defaultLoginMethods: [...validated],
          }),
        );
        return organization ? { kind: 'success' } : { kind: 'outcome-unknown' };
      } catch (error) {
        return workspaceMutationError(error);
      }
    },
    async getTwoFactorPolicy(organizationId) {
      if (!UUID.test(organizationId)) return { kind: 'failure', failure: 'validation' };
      try {
        const value: unknown = await domains.twoFactor().getPolicy(organizationId);
        const candidate =
          value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;
        return candidate && isTwoFactorPolicy(candidate.twoFactorPolicy)
          ? { kind: 'success', value: candidate.twoFactorPolicy }
          : { kind: 'failure', failure: 'invalid-response' };
      } catch (error) {
        return workspaceReadError(error);
      }
    },
    async updateTwoFactorPolicy(organizationId, policy) {
      if (!UUID.test(organizationId) || !isTwoFactorPolicy(policy)) {
        return { kind: 'failure', failure: 'validation' };
      }
      try {
        const value: unknown = await domains.twoFactor().setPolicy(organizationId, policy);
        const candidate =
          value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;
        return candidate && candidate.twoFactorPolicy === policy
          ? { kind: 'success' }
          : { kind: 'outcome-unknown' };
      } catch (error) {
        return workspaceMutationError(error);
      }
    },
    async getBranding(organizationId) {
      const result = await loadWorkspaceOrganization(domains, organizationId);
      return result.kind === 'success'
        ? {
            kind: 'success',
            value: {
              companyName: result.value.brandingCompanyName,
              primaryColor: result.value.brandingPrimaryColor,
              logoUrl: result.value.brandingLogoUrl,
              faviconUrl: result.value.brandingFaviconUrl,
            },
          }
        : result;
    },
    async updateBranding(organizationId, input) {
      if (!UUID.test(organizationId) || !isBrandingInput(input)) {
        return { kind: 'failure', failure: 'validation' };
      }
      try {
        const organization = validateOrganizationSettings(
          await domains.branding().updateSettings(organizationId, input),
        );
        return organization ? { kind: 'success' } : { kind: 'outcome-unknown' };
      } catch (error) {
        return workspaceMutationError(error);
      }
    },
    async listAssets(organizationId) {
      if (!UUID.test(organizationId)) return { kind: 'failure', failure: 'validation' };
      try {
        const assets = assetCollection(
          await domains.branding().listAssets(organizationId),
          organizationId,
        );
        return assets
          ? { kind: 'success', value: assets }
          : { kind: 'failure', failure: 'invalid-response' };
      } catch (error) {
        return workspaceReadError(error);
      }
    },
    async uploadAsset(organizationId, assetType, input) {
      if (!UUID.test(organizationId) || !isAssetUploadInput(input, assetType)) {
        return { kind: 'failure', failure: 'validation' };
      }
      try {
        const asset = assetValue(
          await domains.branding().uploadAsset(organizationId, assetType, input),
          organizationId,
        );
        return asset && asset.assetType === assetType
          ? { kind: 'success' }
          : { kind: 'outcome-unknown' };
      } catch (error) {
        return workspaceMutationError(error);
      }
    },
    deleteAsset: (organizationId, assetType) =>
      UUID.test(organizationId) && (assetType === 'logo' || assetType === 'favicon')
        ? workspaceVoidMutation(() => domains.branding().deleteAsset(organizationId, assetType))
        : Promise.resolve({ kind: 'failure', failure: 'validation' }),
  };
}

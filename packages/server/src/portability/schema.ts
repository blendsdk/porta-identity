/** Strict runtime schemas for the selective portability wire contract. */

import { z } from 'zod';
import {
  applicationDescriptionSchema,
  applicationNameSchema,
  applicationSlugSchema,
  applicationStatusSchema,
} from '../applications/validators.js';
import {
  clientApplicationTypeSchema,
  clientGrantTypesSchema,
  clientLoginMethodsSchema,
  clientNameSchema,
  clientResponseTypesSchema,
  clientScopeSchema,
  clientStatusSchema,
  clientTypeSchema,
  optionalClientUrisSchema,
  redirectUrisSchema,
  tokenEndpointAuthMethodSchema,
  validateClientProtocolCompatibility,
} from '../clients/validators.js';
import { validateClaimName } from '../custom-claims/validators.js';
import { validateImage, type AssetType } from '../lib/image-validator.js';
import {
  brandingCompanyNameSchema,
  brandingCustomCssSchema,
  brandingImageUrlSchema,
  brandingPrimaryColorSchema,
  organizationLocaleSchema,
  organizationLoginMethodsSchema,
  organizationNameSchema,
  organizationSlugSchema,
  organizationStatusSchema,
  organizationTwoFactorPolicySchema,
} from '../organizations/validators.js';
import { normalizeRbacSlug, validatePermissionSlug, validateRoleSlug } from '../rbac/slugs.js';
import {
  portableUserStatusSchema,
  userBirthdateSchema,
  userCountrySchema,
  userEmailSchema,
  userGenderSchema,
  userLocaleSchema,
  userPhoneNumberSchema,
  userPostalCodeSchema,
  userProfileNameSchema,
  userProfileUrlSchema,
  userZoneinfoSchema,
} from '../users/validators.js';

/** Return whether every value in an array is unique. */
function containsUniqueValues(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

/** Decode canonical base64, rejecting malformed or ambiguous encodings. */
function decodeCanonicalBase64(value: string): Buffer | null {
  if (value.length === 0 || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    return null;
  }
  const decoded = Buffer.from(value, 'base64');
  return decoded.toString('base64') === value ? decoded : null;
}

/** Build an embedded branding asset schema for one size-constrained image slot. */
function brandingAssetSchema(assetType: AssetType) {
  return z
    .object({
      media_type: z.string().min(1),
      content_base64: z.string().min(1),
    })
    .strict()
    .superRefine((asset, context) => {
      const bytes = decodeCanonicalBase64(asset.content_base64);
      if (bytes === null || !validateImage(bytes, asset.media_type, assetType).valid) {
        context.addIssue({ code: 'custom', message: `Invalid ${assetType} asset` });
      }
    });
}

/** Closed categories supported by the version 1.0 manifest. */
export const portabilityCategorySchema = z.enum([
  'organizations',
  'applications_authorization',
  'users_assignments',
  'oidc_clients',
]);

/** Organization or complete-environment source scope. */
export const portabilityScopeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('organization'), organization_slug: organizationSlugSchema }).strict(),
  z.object({ kind: z.literal('environment') }).strict(),
]);

/** Explicit application filter shared by export requests and manifests. */
export const portabilityApplicationSelectionSchema = z
  .object({
    all_applications: z.boolean(),
    application_slugs: z.array(applicationSlugSchema).refine(containsUniqueValues),
  })
  .strict();

/** Complete organization branding fields stored in a manifest. */
const brandingSchema = z
  .object({
    logo_url: brandingImageUrlSchema.nullable(),
    favicon_url: brandingImageUrlSchema.nullable(),
    primary_color: brandingPrimaryColorSchema.nullable(),
    company_name: brandingCompanyNameSchema.nullable(),
    custom_css: brandingCustomCssSchema.nullable(),
    logo_asset: brandingAssetSchema('logo').nullable(),
    favicon_asset: brandingAssetSchema('favicon').nullable(),
  })
  .strict();

/** Portable organization record without database identity or timestamps. */
const organizationSchema = z
  .object({
    slug: organizationSlugSchema,
    name: organizationNameSchema,
    status: organizationStatusSchema,
    default_locale: organizationLocaleSchema,
    default_login_methods: organizationLoginMethodsSchema.refine(containsUniqueValues),
    two_factor_policy: organizationTwoFactorPolicySchema,
    branding: brandingSchema,
  })
  .strict();

/** Portable application record without database identity or timestamps. */
const applicationSchema = z
  .object({
    slug: applicationSlugSchema,
    name: applicationNameSchema,
    description: applicationDescriptionSchema.nullable(),
    status: applicationStatusSchema,
  })
  .strict();

/** Portable module record qualified by its owning application slug. */
const applicationModuleSchema = z
  .object({
    application_slug: applicationSlugSchema,
    slug: applicationSlugSchema,
    name: applicationNameSchema,
    description: applicationDescriptionSchema.nullable(),
    status: applicationStatusSchema,
  })
  .strict();

/** External role claim values are trimmed before validation and matching. */
const roleSlugSchema = z
  .string()
  .transform(normalizeRbacSlug)
  .refine(validateRoleSlug, 'Role slug is invalid');
/** External permission claim values are trimmed but otherwise preserved. */
const permissionSlugSchema = z
  .string()
  .transform(normalizeRbacSlug)
  .refine(validatePermissionSlug, 'Permission slug is invalid');
/** Shared RBAC display-name boundary. */
const rbacNameSchema = z.string().min(1).max(255);
/** Shared RBAC description boundary. */
const rbacDescriptionSchema = z.string().max(1_000);

/** Portable application role. */
const roleSchema = z
  .object({
    application_slug: applicationSlugSchema,
    slug: roleSlugSchema,
    name: rbacNameSchema,
    description: rbacDescriptionSchema.nullable(),
  })
  .strict();

/** Portable application permission with an optional module relationship. */
const permissionSchema = z
  .object({
    application_slug: applicationSlugSchema,
    slug: permissionSlugSchema,
    module_slug: applicationSlugSchema.nullable(),
    name: rbacNameSchema,
    description: rbacDescriptionSchema.nullable(),
  })
  .strict();

/** Custom claim names use the established reserved-name and syntax rules. */
const claimNameSchema = z
  .string()
  .refine((value) => validateClaimName(value).valid, 'Claim name is invalid');
/** Portable custom-claim definition. */
const claimDefinitionSchema = z
  .object({
    application_slug: applicationSlugSchema,
    claim_name: claimNameSchema,
    claim_type: z.enum(['string', 'number', 'boolean', 'json']),
    description: z.string().max(1_000).nullable(),
    include_in_id_token: z.boolean(),
    include_in_access_token: z.boolean(),
    include_in_userinfo: z.boolean(),
  })
  .strict();

/** One non-empty, unique, deterministically ordered role-permission mapping. */
const rolePermissionMappingSchema = z
  .object({
    application_slug: applicationSlugSchema,
    role_slug: roleSlugSchema,
    permission_slugs: z
      .array(permissionSlugSchema)
      .min(1)
      .refine(containsUniqueValues)
      .refine((values) =>
        values.every((value, index) => index === 0 || values[index - 1] <= value),
      ),
  })
  .strict();

/** Reusable snake-case shape for the complete portable OIDC user profile. */
const portableUserProfileShape = {
  given_name: userProfileNameSchema.nullable(),
  family_name: userProfileNameSchema.nullable(),
  middle_name: userProfileNameSchema.nullable(),
  nickname: userProfileNameSchema.nullable(),
  preferred_username: userProfileNameSchema.nullable(),
  profile_url: userProfileUrlSchema.nullable(),
  picture_url: userProfileUrlSchema.nullable(),
  website_url: userProfileUrlSchema.nullable(),
  gender: userGenderSchema.nullable(),
  birthdate: userBirthdateSchema.nullable(),
  zoneinfo: userZoneinfoSchema.nullable(),
  locale: userLocaleSchema.nullable(),
  phone_number: userPhoneNumberSchema.nullable(),
  phone_number_verified: z.boolean(),
  address_street: z.string().nullable(),
  address_locality: userProfileNameSchema.nullable(),
  address_region: userProfileNameSchema.nullable(),
  address_postal_code: userPostalCodeSchema.nullable(),
  address_country: userCountrySchema.nullable(),
} as const;

/** Portable user record without credentials, lock state, or counters. */
const userSchema = z
  .object({
    organization_slug: organizationSlugSchema,
    email: userEmailSchema,
    email_verified: z.boolean(),
    ...portableUserProfileShape,
    status: portableUserStatusSchema,
  })
  .strict();

/** Portable assignment of one role to one user. */
const userRoleAssignmentSchema = z
  .object({
    organization_slug: organizationSlugSchema,
    email: userEmailSchema,
    application_slug: applicationSlugSchema,
    role_slug: roleSlugSchema,
  })
  .strict();

/** Portable custom-claim value assigned to one user. */
const userClaimValueSchema = z
  .object({
    organization_slug: organizationSlugSchema,
    email: userEmailSchema,
    application_slug: applicationSlugSchema,
    claim_name: claimNameSchema,
    value: z.json(),
  })
  .strict();

/** Portable OIDC client without existing credential material. */
const clientSchema = z
  .object({
    client_id: z.string().min(1).max(255),
    organization_slug: organizationSlugSchema,
    application_slug: applicationSlugSchema,
    name: clientNameSchema,
    client_type: clientTypeSchema,
    application_type: clientApplicationTypeSchema,
    status: clientStatusSchema,
    grant_types: clientGrantTypesSchema.refine(containsUniqueValues),
    response_types: clientResponseTypesSchema.refine(containsUniqueValues),
    scope: clientScopeSchema,
    login_methods: clientLoginMethodsSchema.refine(
      (methods) => methods === null || containsUniqueValues(methods),
    ),
    token_endpoint_auth_method: tokenEndpointAuthMethodSchema,
    redirect_uris: redirectUrisSchema.refine(containsUniqueValues),
    post_logout_redirect_uris: optionalClientUrisSchema.refine(containsUniqueValues),
    allowed_origins: optionalClientUrisSchema.refine(containsUniqueValues),
    require_pkce: z.boolean(),
  })
  .strict()
  .superRefine((client, context) => {
    const result = validateClientProtocolCompatibility({
      clientType: client.client_type,
      redirectUris: client.redirect_uris,
      postLogoutRedirectUris: client.post_logout_redirect_uris,
      grantTypes: client.grant_types,
      responseTypes: client.response_types,
      tokenEndpointAuthMethod: client.token_endpoint_auth_method,
      requirePkce: client.require_pkce,
      allowedOrigins: client.allowed_origins,
    });
    for (const message of result.errors) context.addIssue({ code: 'custom', message });
  });

/** Category that owns each manifest collection. */
const collectionCategories = {
  organizations: 'organizations',
  applications: 'applications_authorization',
  application_modules: 'applications_authorization',
  roles: 'applications_authorization',
  permissions: 'applications_authorization',
  claim_definitions: 'applications_authorization',
  role_permission_mappings: 'applications_authorization',
  users: 'users_assignments',
  user_role_assignments: 'users_assignments',
  user_claim_values: 'users_assignments',
  clients: 'oidc_clients',
} as const;

/** Add application-selection errors without exposing manifest values. */
function validateApplicationSelection(
  value: {
    readonly categories: readonly string[];
    readonly application_selection: {
      readonly all_applications: boolean;
      readonly application_slugs: readonly string[];
    };
  },
  context: z.RefinementCtx,
): void {
  const selectsApplicationData = value.categories.some((category) => category !== 'organizations');
  const selectsAll = value.application_selection.all_applications;
  const hasExplicitSlugs = value.application_selection.application_slugs.length > 0;
  const valid = selectsApplicationData
    ? selectsAll !== hasExplicitSlugs
    : !selectsAll && !hasExplicitSlugs;
  if (!valid) {
    context.addIssue({
      code: 'custom',
      path: ['application_selection'],
      message: 'Invalid selection',
    });
  }
}

/** Complete required manifest fields before cross-field validation. */
const manifestShape = {
  version: z.literal('1.0'),
  exported_at: z.string().datetime({ offset: false }),
  scope: portabilityScopeSchema,
  categories: z.array(portabilityCategorySchema).min(1).refine(containsUniqueValues),
  application_selection: portabilityApplicationSelectionSchema,
  organizations: z.array(organizationSchema),
  applications: z.array(applicationSchema),
  application_modules: z.array(applicationModuleSchema),
  roles: z.array(roleSchema),
  permissions: z.array(permissionSchema),
  claim_definitions: z.array(claimDefinitionSchema),
  role_permission_mappings: z.array(rolePermissionMappingSchema),
  users: z.array(userSchema),
  user_role_assignments: z.array(userRoleAssignmentSchema),
  user_claim_values: z.array(userClaimValueSchema),
  clients: z.array(clientSchema),
} as const;

/** Strict complete portability manifest schema. */
export const portabilityManifestSchema = z
  .object(manifestShape)
  .strict()
  .superRefine((manifest, context) => {
    validateApplicationSelection(manifest, context);
    for (const [collection, category] of Object.entries(collectionCategories)) {
      const records = manifest[collection as keyof typeof collectionCategories];
      if (!manifest.categories.includes(category) && records.length > 0) {
        context.addIssue({
          code: 'custom',
          path: [collection],
          message: 'Collection not selected',
        });
      }
    }
  });

/** Strict export-manifest request schema. */
export const exportManifestRequestSchema = z
  .object({
    scope: portabilityScopeSchema,
    categories: z.array(portabilityCategorySchema).min(1).refine(containsUniqueValues),
    application_selection: portabilityApplicationSelectionSchema,
  })
  .strict()
  .superRefine(validateApplicationSelection);

/** Strict preview/apply request schema. */
export const importManifestRequestSchema = z
  .object({
    manifest: portabilityManifestSchema,
    mode: z.enum(['dry-run', 'keep-existing', 'update-existing']),
  })
  .strict();

/** Result entity names in dependency order. */
export const portabilityEntityTypeSchema = z.enum([
  'organizations',
  'applications',
  'application_modules',
  'roles',
  'permissions',
  'claim_definitions',
  'role_permission_mappings',
  'users',
  'user_role_assignments',
  'user_claim_values',
  'clients',
]);

/** Non-negative result counters for one entity group. */
const actionCountsSchema = z
  .object({
    created: z.number().int().nonnegative(),
    updated: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
    rejected: z.number().int().nonnegative(),
  })
  .strict();
/** Public string fields that identify a record without database IDs. */
const naturalKeySchema = z.record(z.string(), z.string());

/** Exact public natural-key fields allowed for each entity group. */
const naturalKeyFields = {
  organizations: ['slug'],
  applications: ['slug'],
  application_modules: ['application_slug', 'slug'],
  roles: ['application_slug', 'slug'],
  permissions: ['application_slug', 'slug'],
  claim_definitions: ['application_slug', 'claim_name'],
  role_permission_mappings: ['application_slug', 'role_slug'],
  users: ['organization_slug', 'email'],
  user_role_assignments: ['organization_slug', 'email', 'application_slug', 'role_slug'],
  user_claim_values: ['organization_slug', 'email', 'application_slug', 'claim_name'],
  clients: ['client_id'],
} as const;

/** Reject missing or extra natural-key fields for an entity group. */
function validateNaturalKey(
  entityType: keyof typeof naturalKeyFields,
  naturalKey: Readonly<Record<string, string>>,
  context: z.RefinementCtx,
): void {
  const actual = Object.keys(naturalKey).sort();
  const expected = [...naturalKeyFields[entityType]].sort();
  if (
    actual.length !== expected.length ||
    actual.some((field, index) => field !== expected[index])
  ) {
    context.addIssue({ code: 'custom', path: ['natural_key'], message: 'Invalid natural key' });
  }
}

/** Strict ordered outcome for one manifest record. */
const resultItemSchema = z
  .object({
    entity_type: portabilityEntityTypeSchema,
    action: z.enum(['created', 'updated', 'skipped', 'rejected']),
    natural_key: naturalKeySchema,
    credential_will_be_generated: z.boolean().optional(),
  })
  .strict()
  .superRefine((item, context) => validateNaturalKey(item.entity_type, item.natural_key, context));

/** Strict bounded safe error for one rejected manifest record. */
const resultErrorSchema = z
  .object({
    entity_type: portabilityEntityTypeSchema,
    natural_key: naturalKeySchema,
    code: z.enum([
      'invalid_record',
      'duplicate_natural_key',
      'missing_dependency',
      'ambiguous_dependency',
      'incompatible_record',
      'cross_scope_reference',
      'control_plane_record',
      'client_id_collision',
    ]),
  })
  .strict()
  .superRefine((error, context) =>
    validateNaturalKey(error.entity_type, error.natural_key, context),
  );

/** Strict safe portability preview/apply result schema. */
export const portabilityResultSchema = z
  .object({
    mode: z.enum(['dry-run', 'keep-existing', 'update-existing']),
    summary: z
      .object({
        organizations: actionCountsSchema,
        applications: actionCountsSchema,
        application_modules: actionCountsSchema,
        roles: actionCountsSchema,
        permissions: actionCountsSchema,
        claim_definitions: actionCountsSchema,
        role_permission_mappings: actionCountsSchema,
        users: actionCountsSchema,
        user_role_assignments: actionCountsSchema,
        user_claim_values: actionCountsSchema,
        clients: actionCountsSchema,
      })
      .strict(),
    items: z.array(resultItemSchema),
    errors: z.array(resultErrorSchema).max(100),
    credentials: z
      .array(
        z
          .object({
            client_id: z.string().min(1).max(255),
            label: z.string(),
            secret: z.string().min(1),
            expires_at: z.string().datetime({ offset: false }),
          })
          .strict(),
      )
      .optional(),
  })
  .strict()
  .superRefine((result, context) => {
    if (result.mode === 'dry-run' && result.credentials !== undefined) {
      context.addIssue({
        code: 'custom',
        path: ['credentials'],
        message: 'Preview has no credentials',
      });
    }
  });

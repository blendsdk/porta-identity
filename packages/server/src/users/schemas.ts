/**
 * Shared user request schemas.
 *
 * The Admin and tenant user routes accept the same OIDC profile fields but
 * apply different capability and error policies. Keeping the field definitions
 * in one module prevents the two surfaces from drifting while allowing the
 * tenant variants to reject unsupported fields explicitly.
 *
 * @module users/schemas
 */

import { z } from 'zod';
import {
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
} from './validators.js';

/** Address field schema shared by create and update. */
const addressSchema = z.object({
  street: z.string().nullable().optional(),
  locality: userProfileNameSchema.nullable().optional(),
  region: userProfileNameSchema.nullable().optional(),
  postalCode: userPostalCodeSchema.nullable().optional(),
  country: userCountrySchema.nullable().optional(),
});

/** Base object for creating a user. */
const createUserObjectSchema = z.object({
  email: userEmailSchema,
  password: z.string().min(8).max(128).optional(),
  givenName: userProfileNameSchema.optional(),
  familyName: userProfileNameSchema.optional(),
  middleName: userProfileNameSchema.optional(),
  nickname: userProfileNameSchema.optional(),
  preferredUsername: userProfileNameSchema.optional(),
  profileUrl: userProfileUrlSchema.optional(),
  pictureUrl: userProfileUrlSchema.optional(),
  websiteUrl: userProfileUrlSchema.optional(),
  gender: userGenderSchema.optional(),
  birthdate: userBirthdateSchema.optional(),
  zoneinfo: userZoneinfoSchema.optional(),
  locale: userLocaleSchema.optional(),
  phoneNumber: userPhoneNumberSchema.optional(),
  phoneNumberVerified: z.boolean().optional(),
  emailVerified: z.boolean().optional(),
  address: addressSchema.optional(),
});

/** Validate a verified phone request has a phone to verify. */
function requireCreatePhone(
  value: { readonly phoneNumber?: string; readonly phoneNumberVerified?: boolean },
  context: z.RefinementCtx,
): void {
  if (value.phoneNumberVerified === true && !value.phoneNumber) {
    context.addIssue({
      code: 'custom',
      path: ['phoneNumber'],
      message: 'A phone number is required when phoneNumberVerified is true',
    });
  }
}

/** Base object for updating a user. */
const updateUserObjectSchema = z.object({
  givenName: userProfileNameSchema.nullable().optional(),
  familyName: userProfileNameSchema.nullable().optional(),
  middleName: userProfileNameSchema.nullable().optional(),
  nickname: userProfileNameSchema.nullable().optional(),
  preferredUsername: userProfileNameSchema.nullable().optional(),
  profileUrl: userProfileUrlSchema.nullable().optional(),
  pictureUrl: userProfileUrlSchema.nullable().optional(),
  websiteUrl: userProfileUrlSchema.nullable().optional(),
  gender: userGenderSchema.nullable().optional(),
  birthdate: userBirthdateSchema.nullable().optional(),
  zoneinfo: userZoneinfoSchema.nullable().optional(),
  locale: userLocaleSchema.nullable().optional(),
  phoneNumber: userPhoneNumberSchema.nullable().optional(),
  phoneNumberVerified: z.boolean().optional(),
  emailVerified: z.boolean().optional(),
  address: addressSchema.nullable().optional(),
});

/** Require at least one supplied update field. */
function requireUpdateField(
  value: Record<string, unknown>,
  context: z.RefinementCtx,
): void {
  if (Object.keys(value).length === 0) {
    context.addIssue({
      code: 'custom',
      message: 'At least one profile field must be provided',
    });
  }
}

/** Admin create schema, including password support. */
export const createUserSchema = createUserObjectSchema.superRefine(requireCreatePhone);

/** Admin update schema. */
export const updateUserSchema = updateUserObjectSchema.superRefine(requireUpdateField);

/** Tenant create schema: no password and no unsupported fields. */
export const tenantCreateUserSchema = createUserObjectSchema
  .omit({ password: true })
  .extend({
    organizationId: z.string().uuid().optional(),
    password: z.never().optional(),
  })
  .strict()
  .superRefine(requireCreatePhone);

/** Tenant update schema: no email, status, password, or 2FA fields. */
export const tenantUpdateUserSchema = updateUserObjectSchema
  .extend({ email: z.never().optional() })
  .strict()
  .superRefine(requireUpdateField);

/** Offset pagination query schema. */
export const listUsersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['active', 'inactive', 'locked']).optional(),
  search: z.string().max(255).optional(),
  sortBy: z
    .enum(['email', 'given_name', 'family_name', 'created_at', 'last_login_at'])
    .default('created_at'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

/** Cursor pagination query schema. */
export const listUsersCursorSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(['active', 'inactive', 'locked']).optional(),
  search: z.string().max(255).optional(),
  sortBy: z
    .enum(['email', 'given_name', 'family_name', 'created_at', 'last_login_at'])
    .default('created_at'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

/** Organization and user UUID path parameters. */
export const identifierSchema = z.object({
  orgId: z.string().uuid(),
  userId: z.string().uuid(),
});

/** Role assignment request body. */
export const roleIdsSchema = z.object({
  roleIds: z.array(z.string().uuid()).min(1),
});

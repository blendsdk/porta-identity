/**
 * Resource-server Admin request validation.
 *
 * The schemas are the server-side allowlist for the new Admin surface. They keep identifiers
 * absolute, lowercase-scheme, fragment-free, and free of raw whitespace/control characters; reject
 * standard OIDC scopes from the custom registry; and normalize the audience before the service
 * applies the identifier default.
 */

import { z } from 'zod';

import { applicationSlugSchema } from '../applications/validators.js';
import { STANDARD_OIDC_SCOPES } from '../oidc/resource-servers.js';
import { ResourceServerValidationError } from './errors.js';

/** Protocol-owned scopes that must not be stored in the custom registry. */
const STANDARD_SCOPE_SET = new Set<string>(STANDARD_OIDC_SCOPES);

/** UUID shape used to distinguish id lookup from slug lookup. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Returns true when the text contains a C0 or C1 control character. */
function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f)) return true;
  }
  return false;
}

/** Returns true when the text contains raw whitespace or a C0/C1 control character. */
function hasWhitespaceOrControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0x20 || (codePoint >= 0x7f && codePoint <= 0x9f)) return true;
  }
  return false;
}

/** Absolute URI up to the database bound, without a fragment component. */
const absoluteUriSchema = z
  .string()
  .min(1)
  .max(2_048)
  .refine((value) => {
    if (hasWhitespaceOrControlCharacter(value)) return false;
    if (!/^[a-z][a-z0-9+.-]*:/.test(value)) return false;
    if (value.includes('#')) return false;
    try {
      return new URL(value).protocol.length > 1;
    } catch {
      return false;
    }
  }, 'Resource identifier must be an absolute URI with a lowercase scheme, no fragment, and no whitespace');

/** One custom scope accepted by the existing scope column and resolver. */
const customScopeSchema = z.string().min(1).max(255).regex(/^[A-Za-z0-9_.:-]+$/);

/** Custom scopes are unique and never contain a protocol-owned OIDC scope. */
const scopesSchema = z
  .array(customScopeSchema)
  .optional()
  .default([])
  .superRefine((values, context) => {
    const seen = new Set<string>();
    for (const value of values) {
      if (STANDARD_SCOPE_SET.has(value)) {
        context.addIssue({
          code: 'custom',
          message: `Standard OIDC scope ${value} is protocol-owned`,
        });
      }
      if (seen.has(value)) {
        context.addIssue({ code: 'custom', message: `Duplicate scope ${value}` });
      }
      seen.add(value);
    }
  });

/** Audience is optional; null and omission both mean "use the identifier". */
const audienceSchema = absoluteUriSchema
  .nullish()
  .transform((value) => value ?? undefined);

/** Display name: trimmed, bounded, and free of control characters. */
const resourceNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .refine((value) => !hasControlCharacter(value), 'Resource server name must not contain control characters');

/** Resource-server slugs reuse application slug rules but cannot look like a UUID. */
const resourceServerSlugSchema = applicationSlugSchema.refine(
  (value) => !UUID.test(value),
  'Resource server slug must not look like a UUID',
);

/** UUID or application/resource slug accepted by a route parameter. */
const idOrSlugSchema = z
  .string()
  .min(1)
  .max(100)
  .refine(
    (value) => UUID.test(value) || applicationSlugSchema.safeParse(value).success,
    'Identifier must be a UUID or a valid slug',
  );

/** Create body. */
export const createResourceServerSchema = z.object({
  name: resourceNameSchema,
  slug: resourceServerSlugSchema.optional(),
  identifier: absoluteUriSchema,
  audience: audienceSchema,
  scopes: scopesSchema,
});

/** Full-replacement update body. */
export const updateResourceServerSchema = z.object({
  name: resourceNameSchema,
  slug: resourceServerSlugSchema,
  identifier: absoluteUriSchema,
  audience: audienceSchema,
  scopes: scopesSchema,
});

/** Route parameters for an application-scoped collection. */
export const applicationPathSchema = z.object({
  appId: idOrSlugSchema,
});

/** Route parameters for one resource server. */
export const resourceServerPathSchema = applicationPathSchema.extend({
  resourceServerId: idOrSlugSchema,
});

/**
 * Normalize a parsed scope array to sorted unique values.
 *
 * The HTTP schema is the first line of defense. This service-boundary check keeps direct callers
 * from persisting a protocol scope or duplicate through the exported service.
 *
 * @param scopes - Parsed custom scopes, or undefined.
 * @returns Sorted unique scopes.
 * @throws ResourceServerValidationError when a scope is malformed, standard, or duplicated.
 */
export function normalizeScopes(scopes: readonly string[] | undefined): readonly string[] {
  const seen = new Set<string>();
  for (const scope of scopes ?? []) {
    if (!customScopeSchema.safeParse(scope).success) {
      throw new ResourceServerValidationError('Resource server scope is invalid');
    }
    if (STANDARD_SCOPE_SET.has(scope)) {
      throw new ResourceServerValidationError(`Standard OIDC scope ${scope} is protocol-owned`);
    }
    if (seen.has(scope)) {
      throw new ResourceServerValidationError(`Duplicate scope ${scope}`);
    }
    seen.add(scope);
  }
  return [...seen].sort();
}

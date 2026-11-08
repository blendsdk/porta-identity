/**
 * Shared organization field validators used by ordinary Admin requests and portability manifests.
 */

import { z } from 'zod';
import { LOGIN_METHODS } from '../clients/types.js';
import { validateBrandingImageUrl } from './branding-url.js';
import { OrganizationValidationError } from './errors.js';
import { validateSlug } from './slugs.js';

/** Organization display names are required and limited by the database column. */
export const organizationNameSchema = z.string().min(1).max(255);

/** Organization slugs use the domain's URL-safe and reserved-word rules. */
export const organizationSlugSchema = z
  .string()
  .refine((value) => validateSlug(value).isValid, 'Organization slug is invalid');

/** Locale identifiers use the existing Admin API length boundary. */
export const organizationLocaleSchema = z.string().min(2).max(10);

/** Login methods are the closed set supported by the authentication flow. */
export const loginMethodSchema = z.enum(LOGIN_METHODS);

/** An organization must enable at least one login method. */
export const organizationLoginMethodsSchema = z.array(loginMethodSchema).min(1);

/** Organization lifecycle states persisted by the domain. */
export const organizationStatusSchema = z.enum(['active', 'suspended']);

/** Organization-level two-factor policies supported by the authentication flow. */
export const organizationTwoFactorPolicySchema = z.enum([
  'optional',
  'required_email',
  'required_totp',
  'required_any',
]);

/** Branding image URLs use the same normalization and safety checks as ordinary updates. */
export const brandingImageUrlSchema = z.string().transform((value, context) => {
  try {
    return validateBrandingImageUrl(value);
  } catch (error) {
    if (!(error instanceof OrganizationValidationError)) throw error;
    context.addIssue({ code: 'custom', message: 'Branding image URL is invalid' });
    return z.NEVER;
  }
});

/** Branding accent colors use six-digit HTML hexadecimal notation. */
export const brandingPrimaryColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

/** Branding company names fit the existing organization field limit. */
export const brandingCompanyNameSchema = z.string().max(255);

/**
 * Return whether custom CSS cannot open an HTML element.
 *
 * A `<` is the only character that can begin an HTML tag. Rejecting it prevents a style terminator
 * from ending the raw-text `<style>` element and introducing markup, while leaving ordinary CSS
 * untouched. This is deliberately narrower than parsing CSS; it closes HTML escape, not every
 * visually disruptive CSS rule.
 *
 * @param value - Stored or submitted custom CSS.
 * @returns True when the value cannot introduce HTML markup.
 */
export function isSafeBrandingCustomCss(value: string): boolean {
  return !value.includes('<');
}

/** Custom branding CSS retains the bounded text contract and cannot introduce HTML elements. */
export const brandingCustomCssSchema = z
  .string()
  .max(10_000)
  .refine(isSafeBrandingCustomCss, 'Custom CSS must not contain HTML markup');

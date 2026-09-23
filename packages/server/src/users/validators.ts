/** Shared user field validators used by Admin requests and portability manifests. */

import { z } from 'zod';

/** User email addresses use the existing Admin API syntax and length boundary. */
export const userEmailSchema = z.string().email().max(255);

/** General OIDC profile names and aliases use the existing database boundary. */
export const userProfileNameSchema = z.string().max(255);

/** OIDC profile URL fields must contain absolute URLs. */
export const userProfileUrlSchema = z.string().url();

/** Gender values retain the existing short free-text contract. */
export const userGenderSchema = z.string().max(50);

/** Birthdates use the OIDC calendar-date wire format. */
export const userBirthdateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Time-zone values retain the existing bounded IANA-name field contract. */
export const userZoneinfoSchema = z.string().max(50);

/** User locale identifiers retain the existing Admin API length boundary. */
export const userLocaleSchema = z.string().max(10);

/** Phone numbers retain the existing bounded external-number contract. */
export const userPhoneNumberSchema = z.string().max(50);

/** Postal codes retain the existing address field boundary. */
export const userPostalCodeSchema = z.string().max(20);

/** Address countries use two-letter country codes. */
export const userCountrySchema = z.string().length(2);

/** Portable user lifecycle states exclude automatic lock state. */
export const portableUserStatusSchema = z.enum(['active', 'inactive']);

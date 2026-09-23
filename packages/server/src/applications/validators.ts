/** Shared application and module field validators. */

import { z } from 'zod';
import { validateSlug } from './slugs.js';

/** Application and module display names are required and database bounded. */
export const applicationNameSchema = z.string().min(1).max(255);

/** Application and module slugs use the domain's URL-safe rules. */
export const applicationSlugSchema = z
  .string()
  .refine((value) => validateSlug(value).isValid, 'Application slug is invalid');

/** Application and module descriptions use the existing Admin API text limit. */
export const applicationDescriptionSchema = z.string().max(2_000);

/** Application and module lifecycle states persisted by the domain. */
export const applicationStatusSchema = z.enum(['active', 'inactive']);

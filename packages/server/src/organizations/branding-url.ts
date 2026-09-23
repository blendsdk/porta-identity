/**
 * Validate and normalize an externally hosted branding image URL.
 *
 * Production accepts credential-free HTTPS URLs. Development and test
 * environments additionally accept HTTP on exact loopback hosts so local
 * identity flows can load local assets without weakening deployed systems.
 */

import { config } from '../config/index.js';
import { OrganizationValidationError } from './errors.js';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Return the normalized branding URL or reject values that are unsafe to render.
 *
 * @param value - User-supplied absolute image URL.
 * @returns The URL with surrounding whitespace removed.
 * @throws OrganizationValidationError when the URL is malformed, contains credentials, or uses a
 * disallowed protocol or host.
 */
export function validateBrandingImageUrl(value: string): string {
  const normalized = value.trim();
  let url: URL;

  try {
    url = new URL(normalized);
  } catch {
    throw new OrganizationValidationError('Branding image URL is invalid');
  }

  if (url.username !== '' || url.password !== '') {
    throw new OrganizationValidationError('Branding image URL is invalid');
  }

  if (url.protocol === 'https:') return normalized;

  const localHttpAllowed =
    config.nodeEnv !== 'production' && url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname);
  if (localHttpAllowed) return normalized;

  throw new OrganizationValidationError('Branding image URL is invalid');
}

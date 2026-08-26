/**
 * Service-backed collection point for the immutable magic-link authority specification.
 *
 * The integration project owns PostgreSQL, Redis, and MailHog before importing the unchanged
 * requirement oracle. Unit collection remains structure-only and cannot claim product evidence.
 */
import { beforeAll } from 'vitest';
import { initI18n } from '../../../src/auth/i18n.js';
import { initTemplateEngine } from '../../../src/auth/template-engine.js';

beforeAll(async () => {
  await initI18n();
  await initTemplateEngine();
});

import '../../unit/auth/magic-link-tenant-binding.spec.test.js';

/**
 * Auth module barrel export.
 *
 * Re-exports all public APIs from the auth module for convenient importing.
 * Consumers should import from this barrel rather than reaching into
 * individual files (respects module boundary convention).
 *
 * @example
 *   import { generateToken, hashToken, generateCsrfToken } from './auth/index.js';
 */

// Token generation and hashing
export { generateToken, hashToken } from './tokens.js';
export type { GeneratedToken } from './tokens.js';

// Token repository (PostgreSQL CRUD for all 3 token tables)
export {
  insertToken,
  findValidToken,
  markTokenUsed,
  deleteExpiredTokens,
  invalidateUserTokens,
} from './token-repository.js';
export type { TokenTable, TokenRecord } from './token-repository.js';

// CSRF protection
export { generateCsrfToken, verifyCsrfToken, setCsrfCookie, getCsrfFromCookie } from './csrf.js';

// Rate limiting
export {
  checkRateLimit,
  resetRateLimit,
  buildLoginRateLimitKey,
  buildMagicLinkRateLimitKey,
  buildPasswordResetRateLimitKey,
  loadLoginRateLimitConfig,
  loadMagicLinkRateLimitConfig,
  loadPasswordResetRateLimitConfig,
} from './rate-limiter.js';
export type { RateLimitResult, RateLimitConfig } from './rate-limiter.js';

// Email transport
export { createSmtpTransport } from './email-transport.js';
export type { EmailTransport, SendEmailOptions, EmailResult } from './email-transport.js';

// Email renderer
export { renderEmail } from './email-renderer.js';

// Email service
export {
  sendMagicLinkEmail,
  sendPasswordResetEmail,
  sendInvitationEmail,
  sendWelcomeEmail,
  sendPasswordChangedEmail,
  setEmailTransport,
} from './email-service.js';
export type { EmailUser, EmailOrganization } from './email-service.js';

// i18n
export { initI18n, resolveLocale, getTranslationFunction, registerHandlebarsI18nHelper } from './i18n.js';

// Template engine
export { initTemplateEngine, renderPage } from './template-engine.js';
export type { TemplateContext } from './template-engine.js';

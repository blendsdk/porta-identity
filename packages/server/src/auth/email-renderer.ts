/**
 * Email template renderer using Handlebars.
 *
 * Renders HTML and plaintext email templates with organization branding
 * and i18n context. Supports per-organization template overrides:
 *   1. Try: templates/{orgSlug}/emails/{templateName}.hbs
 *   2. Fall back: templates/default/emails/{templateName}.hbs
 *
 * Both .hbs (HTML) and .txt.hbs (plaintext) variants are rendered.
 *
 * @example
 *   const { html, text } = await renderEmail('magic-link', 'acme-corp', {
 *     userName: 'Alice',
 *     magicLinkUrl: 'https://...',
 *     branding: { logoUrl: '...', primaryColor: '#3B82F6', companyName: 'Acme' },
 *   });
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import Handlebars from 'handlebars';
import { logger } from '../lib/logger.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Base directory for templates, resolved relative to project root */
const TEMPLATES_DIR = path.resolve(process.cwd(), 'templates');

// ---------------------------------------------------------------------------
// Template resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a template file path with org-override support.
 *
 * Checks for an organization-specific template first, then falls back
 * to the default template. Returns null if neither exists.
 *
 * @param orgSlug - Organization slug for override lookup
 * @param templatePath - Relative path within the emails directory (e.g., 'magic-link.hbs')
 * @returns Absolute path to the template file, or null if not found
 */
async function resolveTemplatePath(orgSlug: string, templatePath: string): Promise<string | null> {
  // Try org-specific template first
  const orgPath = path.join(TEMPLATES_DIR, orgSlug, 'emails', templatePath);
  try {
    await fs.access(orgPath);
    return orgPath;
  } catch {
    // Org-specific template doesn't exist — fall through to default
  }

  // Fall back to default template
  const defaultPath = path.join(TEMPLATES_DIR, 'default', 'emails', templatePath);
  try {
    await fs.access(defaultPath);
    return defaultPath;
  } catch {
    return null;
  }
}

/**
 * Load and compile a Handlebars template from the file system.
 *
 * @param filePath - Absolute path to the template file
 * @returns Compiled Handlebars template function
 */
async function loadTemplate(filePath: string): Promise<HandlebarsTemplateDelegate> {
  const source = await fs.readFile(filePath, 'utf-8');
  return Handlebars.compile(source);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Render an email template (HTML + plaintext) with the given context.
 *
 * Template resolution order:
 *   1. templates/{orgSlug}/emails/{templateName}.hbs (org override)
 *   2. templates/default/emails/{templateName}.hbs (default)
 *
 * Automatically adds `year` to the context for footer copyright.
 *
 * @param templateName - Email template name (e.g., 'magic-link', 'password-reset')
 * @param orgSlug - Organization slug for template override lookup
 * @param context - Template variables (userName, branding, URLs, etc.)
 * @returns Object with rendered `html` and `text` strings
 * @throws Error if the HTML template cannot be found
 */
export async function renderEmail(
  templateName: string,
  orgSlug: string,
  context: Record<string, unknown>,
): Promise<{ html: string; text: string }> {
  // Resolve HTML template (required)
  const htmlPath = await resolveTemplatePath(orgSlug, `${templateName}.hbs`);
  if (!htmlPath) {
    throw new Error(
      `Email template not found: ${templateName}.hbs (checked ${orgSlug}/ and default/)`,
    );
  }

  // Resolve plaintext template (optional — fall back to empty string)
  const textPath = await resolveTemplatePath(orgSlug, `${templateName}.txt.hbs`);

  // Enrich context with common variables
  const enrichedContext = {
    ...context,
    year: new Date().getFullYear(),
  };

  // Render HTML
  const htmlTemplate = await loadTemplate(htmlPath);
  const html = htmlTemplate(enrichedContext);

  // Render plaintext (if template exists)
  let text = '';
  if (textPath) {
    const textTemplate = await loadTemplate(textPath);
    text = textTemplate(enrichedContext);
  } else {
    logger.debug(
      { templateName, orgSlug },
      'No plaintext email template found — using empty text body',
    );
  }

  return { html, text };
}

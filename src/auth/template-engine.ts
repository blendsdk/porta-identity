/**
 * Handlebars-based page template engine for auth workflow pages.
 *
 * Renders server-side HTML pages using a layout + page template pattern.
 * Supports per-organization template overrides:
 *   1. Try: templates/{orgSlug}/pages/{pageName}.hbs
 *   2. Fall back: templates/default/pages/{pageName}.hbs
 *
 * The engine pre-registers partials (header, footer, flash-messages) and
 * compiles the base layout at startup. Page templates are compiled on
 * demand and injected into the layout's {{{body}}} placeholder.
 *
 * @example
 *   await initTemplateEngine();
 *   const html = await renderPage('login', {
 *     branding: { logoUrl: null, faviconUrl: null, primaryColor: '#3B82F6', companyName: 'Acme', customCss: null },
 *     locale: 'en',
 *     t: translationFn,
 *     csrfToken: 'abc123',
 *     orgSlug: 'acme-corp',
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

/** Default template set name */
const DEFAULT_SET = 'default';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Context passed to every page template and layout.
 *
 * Contains branding, i18n, CSRF, flash messages, and page-specific data.
 * The `t` function is the i18n translation function (used by the {{t}} helper).
 */
export interface TemplateContext {
  /** Organization branding for visual customization */
  branding: {
    logoUrl: string | null;
    faviconUrl: string | null;
    /** CSS primary color (default: '#3B82F6') */
    primaryColor: string;
    /** Company name displayed in header/footer */
    companyName: string;
    /** Optional custom CSS injected into layout <head> */
    customCss: string | null;
  };

  /** Current locale for the page (e.g., 'en') */
  locale: string;

  /** Translation function (injected into Handlebars context for {{t}} helper) */
  t: (key: string, options?: Record<string, unknown>) => string;

  /** OIDC interaction details (present when in an OIDC flow) */
  interaction?: {
    uid: string;
    prompt: string;
    params: Record<string, unknown>;
    client: { clientName: string };
  };

  /** Flash messages for success/error/info feedback */
  flash?: {
    success?: string;
    error?: string;
    info?: string;
  };

  /** CSRF token for form protection */
  csrfToken: string;

  /** Organization slug for route building and template overrides */
  orgSlug: string;

  /** Page-specific data (varies by page) */
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

/** Compiled base layout template (loaded at init) */
let layoutTemplate: HandlebarsTemplateDelegate | null = null;

/** Whether the engine has been initialized */
let initialized = false;

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/**
 * Initialize the Handlebars template engine.
 *
 * Registers all default partials (header, footer, flash-messages),
 * registers custom helpers (eq, ifCond), and compiles the base layout.
 * Must be called once at application startup before renderPage is used.
 *
 * @throws Error if layout template or required partials cannot be loaded
 */
export async function initTemplateEngine(): Promise<void> {
  // Register partials from the default set
  const partialsDir = path.join(TEMPLATES_DIR, DEFAULT_SET, 'partials');
  await registerPartials(partialsDir);

  // Register custom Handlebars helpers
  registerHelpers();

  // Compile the base layout
  const layoutPath = path.join(TEMPLATES_DIR, DEFAULT_SET, 'layouts', 'main.hbs');
  const layoutSource = await fs.readFile(layoutPath, 'utf-8');
  layoutTemplate = Handlebars.compile(layoutSource);

  initialized = true;
  logger.info({ templatesDir: TEMPLATES_DIR }, 'Template engine initialized');
}

/**
 * Register all .hbs files in a directory as Handlebars partials.
 *
 * Partial names are derived from filenames without extension:
 * e.g., 'header.hbs' → partial name 'header' (used as {{> header}}).
 *
 * @param partialsDir - Absolute path to the partials directory
 */
async function registerPartials(partialsDir: string): Promise<void> {
  try {
    const files = await fs.readdir(partialsDir);
    const hbsFiles = files.filter((f) => f.endsWith('.hbs'));

    for (const file of hbsFiles) {
      const name = path.basename(file, '.hbs');
      const source = await fs.readFile(path.join(partialsDir, file), 'utf-8');
      Handlebars.registerPartial(name, source);
      logger.debug({ partial: name }, 'Registered Handlebars partial');
    }
  } catch (error) {
    logger.warn({ error, partialsDir }, 'Failed to register partials — directory may not exist');
  }
}

/**
 * Register custom Handlebars helpers used across templates.
 *
 * Helpers:
 *   - {{eq a b}}: Strict equality check (useful in {{#if (eq status "active")}})
 *   - {{year}}: Current year (for copyright footers)
 */
function registerHelpers(): void {
  // Equality helper — {{#if (eq prompt "login")}}
  Handlebars.registerHelper('eq', function (a: unknown, b: unknown) {
    return a === b;
  });

  // Current year helper — {{year}}
  Handlebars.registerHelper('year', function () {
    return new Date().getFullYear();
  });

  // String concatenation helper — {{concat "prefix_" value}}
  Handlebars.registerHelper('concat', function (...args: unknown[]) {
    // Last argument is the Handlebars options object — exclude it
    return args.slice(0, -1).join('');
  });
}

// ---------------------------------------------------------------------------
// Template resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a page template path with org-override support.
 *
 * Checks for an organization-specific page template first, then falls
 * back to the default. Returns null if neither exists.
 *
 * @param pageName - Page template name (e.g., 'login', 'consent')
 * @param orgSlug - Organization slug for override lookup
 * @returns Absolute path to the template file, or null if not found
 */
async function resolvePageTemplatePath(
  pageName: string,
  orgSlug: string,
): Promise<string | null> {
  // Try org-specific page template first
  const orgPath = path.join(TEMPLATES_DIR, orgSlug, 'pages', `${pageName}.hbs`);
  try {
    await fs.access(orgPath);
    return orgPath;
  } catch {
    // Org-specific page doesn't exist — fall through to default
  }

  // Fall back to default page template
  const defaultPath = path.join(TEMPLATES_DIR, DEFAULT_SET, 'pages', `${pageName}.hbs`);
  try {
    await fs.access(defaultPath);
    return defaultPath;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Render a page template with layout, branding, and i18n.
 *
 * Template resolution order:
 *   1. templates/{orgSlug}/pages/{pageName}.hbs (org override)
 *   2. templates/default/pages/{pageName}.hbs (default)
 *
 * The page content is rendered first, then injected into the base layout's
 * {{{body}}} placeholder. Both the page and layout receive the full context,
 * so they can access branding, i18n, CSRF, and page-specific data.
 *
 * @param pageName - Page template name (e.g., 'login', 'consent', 'error')
 * @param context - Template context with branding, i18n, CSRF, flash, and page data
 * @returns Rendered HTML string (complete page with layout)
 * @throws Error if the template engine hasn't been initialized
 * @throws Error if the page template cannot be found
 */
export async function renderPage(
  pageName: string,
  context: TemplateContext,
): Promise<string> {
  if (!initialized || !layoutTemplate) {
    throw new Error('Template engine not initialized — call initTemplateEngine() first');
  }

  // Resolve the page template (with org-override support)
  const templatePath = await resolvePageTemplatePath(pageName, context.orgSlug);
  if (!templatePath) {
    throw new Error(
      `Page template not found: ${pageName}.hbs (checked ${context.orgSlug}/ and default/)`,
    );
  }

  // Load and compile the page template
  const pageSource = await fs.readFile(templatePath, 'utf-8');
  const pageTemplate = Handlebars.compile(pageSource);

  // Build the full context with additional layout properties
  const fullContext = {
    ...context,
    // Add pageTitle for the <title> tag — use pageName capitalized as default
    pageTitle: context.pageTitle ?? capitalize(pageName.replace(/-/g, ' ')),
    year: new Date().getFullYear(),
  };

  // Render the page body first
  const pageBody = pageTemplate(fullContext);

  // Inject the page body into the layout
  const layoutContext = {
    ...fullContext,
    body: pageBody,
  };

  return layoutTemplate(layoutContext);
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/**
 * Capitalize the first letter of a string.
 *
 * @param str - Input string
 * @returns String with first letter uppercased
 */
function capitalize(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

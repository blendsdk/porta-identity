/**
 * Handlebars Template Engine
 *
 * Compiles and renders Handlebars templates for the BFF playground.
 * Registers custom helpers (json, truncate, eq) and partials
 * (nav, sidebar, token-panel, event-log) at startup.
 *
 * Templates are loaded from the views/ directory and compiled once.
 */

import Handlebars from 'handlebars';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const viewsDir = resolve(__dirname, '..', '..', 'views');
const partialsDir = resolve(viewsDir, 'partials');

// ===========================================================================
// Custom helpers
// ===========================================================================

/** Pretty-print JSON with indentation */
Handlebars.registerHelper('json', (context: unknown) => {
  return new Handlebars.SafeString(
    `<pre class="json-display">${Handlebars.Utils.escapeExpression(
      JSON.stringify(context, null, 2),
    )}</pre>`,
  );
});

/** Truncate a string to a max length with ellipsis */
Handlebars.registerHelper('truncate', (str: string, len: number) => {
  if (!str) return '';
  if (str.length <= len) return str;
  return str.slice(0, len) + '…';
});

/** Equality comparison helper */
Handlebars.registerHelper('eq', (a: unknown, b: unknown) => a === b);

/** Format a Unix timestamp as a readable date */
Handlebars.registerHelper('formatDate', (timestamp: number) => {
  if (!timestamp) return 'N/A';
  return new Date(timestamp * 1000).toLocaleString();
});

/** Format milliseconds until expiry */
Handlebars.registerHelper('expiresIn', (expiresAt: number) => {
  if (!expiresAt) return 'Unknown';
  const remaining = expiresAt - Date.now();
  if (remaining <= 0) return 'Expired';
  const seconds = Math.floor(remaining / 1000);
  const minutes = Math.floor(seconds / 60);
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
});

// ===========================================================================
// Register partials
// ===========================================================================

try {
  const partialFiles = readdirSync(partialsDir).filter((f) => f.endsWith('.hbs'));
  for (const file of partialFiles) {
    const name = basename(file, '.hbs');
    const content = readFileSync(resolve(partialsDir, file), 'utf-8');
    Handlebars.registerPartial(name, content);
  }
} catch {
  // Partials directory may not exist yet during initial scaffold
  console.warn('Warning: Could not load partials from', partialsDir);
}

// ===========================================================================
// Template cache
// ===========================================================================

/** Cache of compiled templates */
const templateCache = new Map<string, HandlebarsTemplateDelegate>();

/**
 * Compile and cache a template, then render with the provided data.
 * The layout template is applied automatically — the rendered template
 * becomes the {{{body}}} of the layout.
 *
 * @param templateName - Template name without extension (e.g. 'dashboard')
 * @param data - Template variables
 * @returns Rendered HTML string
 */
export function render(templateName: string, data: Record<string, unknown> = {}): string {
  // Compile the page template
  if (!templateCache.has(templateName)) {
    const templatePath = resolve(viewsDir, `${templateName}.hbs`);
    const source = readFileSync(templatePath, 'utf-8');
    templateCache.set(templateName, Handlebars.compile(source));
  }

  // Compile the layout template
  if (!templateCache.has('layout')) {
    const layoutPath = resolve(viewsDir, 'layout.hbs');
    const layoutSource = readFileSync(layoutPath, 'utf-8');
    templateCache.set('layout', Handlebars.compile(layoutSource));
  }

  const pageTemplate = templateCache.get(templateName)!;
  const layoutTemplate = templateCache.get('layout')!;

  // Render page content, then inject into layout
  const body = pageTemplate(data);
  return layoutTemplate({ ...data, body });
}

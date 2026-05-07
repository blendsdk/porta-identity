/**
 * Static file serving middleware for the BFF server.
 *
 * Serves pre-built SPA assets from `dist/client/` and provides a catch-all
 * that returns `index.html` with `__PORTA_ENV__` injected for any GET request
 * that doesn't match a static file. This enables React Router client-side routing.
 *
 * Path resolution uses `import.meta.url` to work correctly for both local
 * development and global npm installs.
 *
 * @module middleware/static
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import serve from 'koa-static';
import type { Context, Next } from 'koa';

/** Configuration for the static middleware. */
export interface StaticConfig {
  /** Porta server URL (injected into `__PORTA_ENV__`). */
  serverUrl: string;
  /** GUI version string (injected into `__PORTA_ENV__`). */
  version: string;
}

/**
 * Resolve the path to the built SPA assets directory.
 *
 * Uses `import.meta.url` to locate the package's `dist/client/` directory.
 * This works correctly for both:
 * - Local development: `packages/porta-admin-gui/dist/client/`
 * - Global npm install: `{global-prefix}/lib/node_modules/@portaidentity/admin-gui/dist/client/`
 */
function resolveClientDir(): string {
  // This file is at: dist/server/middleware/static.js
  // Client dir is at: dist/client/
  const thisDir = dirname(fileURLToPath(import.meta.url));
  return join(thisDir, '..', '..', 'client');
}

/**
 * Create the static file serving middleware + SPA catch-all.
 *
 * @param config - Server URL and version for `__PORTA_ENV__` injection.
 * @returns Koa middleware function.
 */
export function createStaticMiddleware(config: StaticConfig): (ctx: Context, next: Next) => Promise<void> {
  const clientDir = resolveClientDir();

  // Pre-read index.html and inject __PORTA_ENV__ placeholder
  let indexHtml: string;
  try {
    const rawHtml = readFileSync(join(clientDir, 'index.html'), 'utf-8');
    // Inject runtime config before the closing </head> tag
    const envScript = `<script>window.__PORTA_ENV__=${JSON.stringify({
      serverUrl: config.serverUrl,
      version: config.version,
    })}</script>`;
    indexHtml = rawHtml.replace('</head>', `${envScript}</head>`);
  } catch {
    // SPA not built yet — return a helpful error page
    indexHtml = `<!DOCTYPE html><html><body><h1>SPA Not Built</h1><p>Run <code>yarn build:client</code> first.</p></body></html>`;
  }

  // koa-static serves files from dist/client/ with appropriate cache headers
  const staticServe = serve(clientDir, {
    maxage: 0, // Let Vite content-hashed files use their own caching
    gzip: true,
    brotli: true,
  });

  return async (ctx: Context, next: Next): Promise<void> => {
    // Try to serve static files first
    await staticServe(ctx, async () => {
      // If koa-static didn't handle it, check if this is a SPA route
      // (GET request without a file extension → serve index.html)
      if (ctx.method === 'GET' && !ctx.path.includes('.')) {
        ctx.type = 'text/html';
        ctx.body = indexHtml;
      } else {
        await next();
      }
    });
  };
}

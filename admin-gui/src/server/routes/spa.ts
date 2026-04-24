import serve from 'koa-static';
import path from 'node:path';
import fs from 'node:fs';
import type Koa from 'koa';
import type { BffConfig } from '../config.js';

/**
 * Configure SPA serving for the React application.
 *
 * In production:
 * - Serves built static assets from dist/client/ via koa-static
 * - All non-API, non-auth routes fall through to index.html (SPA routing)
 * - Injects __PORTA_ENV__ into index.html for environment indicator
 *
 * In development:
 * - Vite dev server handles SPA serving; BFF only handles /api and /auth
 *
 * @param app - Koa application instance
 * @param config - BFF configuration
 */
export function configureSpaServing(app: Koa, config: BffConfig): void {
  if (config.nodeEnv === 'development') {
    // In dev mode, Vite dev server serves the SPA.
    // BFF only handles /api/*, /auth/*, /health.
    return;
  }

  // Resolve the built client directory (relative to dist/server/ → dist/client/)
  const clientDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../client');

  // Serve static assets (JS, CSS, images) with long cache for hashed assets
  app.use(
    serve(clientDir, {
      maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year cache for hashed assets
      gzip: true,
      brotli: true,
    }),
  );

  // Read and prepare index.html with environment injection
  const indexPath = path.join(clientDir, 'index.html');
  let indexHtml = fs.readFileSync(indexPath, 'utf-8');

  // Inject __PORTA_ENV__ into the HTML so the SPA can read environment info
  const envScript = `<script>window.__PORTA_ENV__=${JSON.stringify({
    environment: config.nodeEnv,
    version: process.env.npm_package_version || 'unknown',
  })};</script>`;
  indexHtml = indexHtml.replace('</head>', `${envScript}</head>`);

  // SPA catch-all: serve index.html for all non-file routes (client-side routing)
  app.use(async (ctx, next) => {
    await next();

    // If no route matched and it's a GET request for a page (not a file),
    // serve the SPA index.html for client-side routing
    if (ctx.status === 404 && ctx.method === 'GET' && !ctx.path.includes('.')) {
      ctx.type = 'html';
      ctx.body = indexHtml;
      ctx.status = 200;
    }
  });
}

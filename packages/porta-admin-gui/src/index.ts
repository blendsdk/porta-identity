#!/usr/bin/env node
/**
 * Entry point for the standalone Admin GUI BFF server.
 *
 * Exports `startServer()` for programmatic use (from `porta gui` CLI command)
 * and runs as a standalone binary (`porta-gui`) when executed directly.
 *
 * Startup sequence (10 steps per RD-30 §Startup & Shutdown):
 *   1. Parse CLI arguments
 *   2. If --insecure, disable TLS verification
 *   3. Resolve Porta server URL
 *   4. Verify Porta reachability
 *   5. Discover admin metadata (client ID, org slug)
 *   6. Initialize OIDC configuration
 *   7. Start session cleanup timer
 *   8. Start Koa BFF server on 127.0.0.1:{port}
 *   9. Print startup banner
 *   10. Open browser (unless --no-open)
 *
 * @module index
 */

import type { Server } from 'node:http';
import chalk from 'chalk';
import open from 'open';
import { resolveConfig } from './config.js';
import type { StartServerOptions } from './config.js';
import { SessionStore } from './session.js';
import { createApp } from './server.js';
import { discoverOidc } from './auth/oidc.js';
import { createAuthRoutes } from './routes/auth.js';
import { createHealthRoutes } from './routes/health.js';
import { createApiProxy } from './middleware/api-proxy.js';
import { createStaticMiddleware } from './middleware/static.js';
import { GUI_VERSION } from './version.js';

// Re-export for `porta gui` command to import
export { startServer };
export type { StartServerOptions };

/**
 * Start the Admin GUI BFF server.
 *
 * This is the main public API — called by `porta gui` or directly via
 * `porta-gui` binary. Runs the full 10-step startup sequence.
 *
 * @param options - Server options (server URL, port, open, insecure).
 */
async function startServer(options: StartServerOptions = {}): Promise<void> {
  // Step 1: Resolve configuration (flag → env → credentials)
  const config = resolveConfig(options);

  // Step 2: If --insecure, disable TLS certificate verification
  if (config.insecure) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    console.log(chalk.yellow('  ⚠ TLS certificate verification disabled (--insecure)'));
  }

  // Step 3: Server URL is already resolved in config

  // Step 4: Verify Porta server is reachable
  console.log(chalk.gray(`  Checking Porta server at ${config.serverUrl}...`));
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${config.serverUrl}/health`, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) {
      throw new Error(`Porta server returned ${res.status}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`\n  ✖ Cannot reach Porta server at ${config.serverUrl}`));
    console.error(chalk.red(`    ${msg}\n`));
    process.exit(1);
  }

  // Step 5: Discover admin metadata (client ID, org slug)
  console.log(chalk.gray('  Discovering admin metadata...'));
  let clientId: string;
  let orgSlug: string;
  try {
    const metaRes = await fetch(`${config.serverUrl}/api/admin/metadata`);
    if (!metaRes.ok) {
      throw new Error(`Metadata endpoint returned ${metaRes.status}`);
    }
    const meta = (await metaRes.json()) as { clientId: string; orgSlug: string };
    clientId = meta.clientId;
    orgSlug = meta.orgSlug;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`\n  ✖ Cannot discover admin metadata`));
    console.error(chalk.red(`    ${msg}\n`));
    process.exit(1);
  }

  // Step 6: Initialize OIDC configuration via openid-client discovery
  console.log(chalk.gray('  Initializing OIDC...'));
  const oidcConfig = await discoverOidc({
    serverUrl: config.serverUrl,
    orgSlug,
    clientId,
    port: config.port,
  });

  // Step 7: Start session cleanup timer
  const sessionStore = new SessionStore();
  sessionStore.startCleanup();

  // Step 8: Create and start BFF server
  const app = createApp({ sessionStore });

  // Wire route-level middleware (order per RD-30 §BFF Route Table):
  // 5. Health route (before auth guard)
  const healthRouter = createHealthRoutes(config.serverUrl);
  app.use(healthRouter.routes());
  app.use(healthRouter.allowedMethods());

  // 6. Auth routes (login/callback don't require session)
  const authRouter = createAuthRoutes({
    oidcConfig,
    sessionStore,
    serverUrl: config.serverUrl,
    port: config.port,
  });
  app.use(authRouter.routes());
  app.use(authRouter.allowedMethods());

  // 7. Session guard — all routes below require authenticated session
  app.use(async (ctx, next) => {
    // Skip static files and already-handled routes
    if (ctx.path.startsWith('/auth/') || ctx.path === '/health') {
      return next();
    }

    // API routes require authentication
    if (ctx.path.startsWith('/api/') && !ctx.state.session) {
      ctx.status = 401;
      ctx.body = { error: 'Authentication required' };
      return;
    }

    return next();
  });

  // 8. API proxy (via SDK transport)
  app.use(createApiProxy({
    serverUrl: config.serverUrl,
    oidcConfig,
    sessionStore,
  }));

  // 9. SPA static serving + catch-all
  const staticMiddleware = createStaticMiddleware({
    serverUrl: config.serverUrl,
    version: GUI_VERSION,
  });
  app.use(staticMiddleware);

  // Bind to 127.0.0.1 ONLY — never 0.0.0.0 (security: no network exposure)
  const server: Server = app.listen(config.port, '127.0.0.1');

  // Handle port-in-use error
  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      const altPort = config.port + 1;
      console.error(
        chalk.red(`\n  ✖ Port ${config.port} is already in use. Try --port ${altPort}\n`),
      );
      process.exit(1);
    }
    throw err;
  });

  await new Promise<void>((resolve) => {
    server.once('listening', resolve);
  });

  // Step 9: Print startup banner
  const url = `http://127.0.0.1:${config.port}`;
  console.log('');
  console.log(chalk.cyan('  ╔══════════════════════════════════════════════════╗'));
  console.log(chalk.cyan('  ║') + chalk.bold(`  Porta Admin GUI v${GUI_VERSION}`) + ' '.repeat(Math.max(0, 33 - GUI_VERSION.length)) + chalk.cyan('║'));
  console.log(chalk.cyan('  ║') + ' '.repeat(50) + chalk.cyan('║'));
  console.log(chalk.cyan('  ║') + `  Local:   ${chalk.green(url)}` + ' '.repeat(Math.max(0, 39 - url.length)) + chalk.cyan('║'));
  console.log(chalk.cyan('  ║') + `  Server:  ${chalk.blue(config.serverUrl)}` + ' '.repeat(Math.max(0, 39 - config.serverUrl.length)) + chalk.cyan('║'));
  console.log(chalk.cyan('  ║') + ' '.repeat(50) + chalk.cyan('║'));
  console.log(chalk.cyan('  ║') + chalk.gray('  Press Ctrl+C to stop') + ' '.repeat(28) + chalk.cyan('║'));
  console.log(chalk.cyan('  ╚══════════════════════════════════════════════════╝'));
  console.log('');

  // Step 10: Open browser (unless --no-open)
  if (config.open) {
    await open(url);
  }

  // --- Graceful shutdown ---
  const shutdown = (): void => {
    console.log(chalk.gray('\n  Shutting down...'));
    sessionStore.stopCleanup();
    server.close(() => {
      sessionStore.clear();
      console.log(chalk.gray('  Goodbye.\n'));
      process.exit(0);
    });
    // Force exit after 5 seconds if server doesn't close
    setTimeout(() => process.exit(0), 5000).unref();
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// --- Direct execution: parse CLI args and start ---
// When run as `porta-gui` binary or `node dist/server/index.js`
const isDirectExecution =
  process.argv[1] &&
  (process.argv[1].endsWith('/index.js') || process.argv[1].endsWith('/porta-gui'));

if (isDirectExecution) {
  // Parse CLI arguments from process.argv
  const args = process.argv.slice(2);
  const opts: StartServerOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--server' && args[i + 1]) {
      opts.server = args[++i];
    } else if (arg === '--port' && args[i + 1]) {
      opts.port = parseInt(args[++i], 10);
    } else if (arg === '--no-open') {
      opts.open = false;
    } else if (arg === '--insecure') {
      opts.insecure = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
  Usage: porta-gui [options]

  Options:
    --server <url>   Porta server URL (required if not configured)
    --port <number>  BFF listen port (default: 4002)
    --no-open        Do not open browser on startup
    --insecure       Skip TLS certificate verification
    --help, -h       Show this help message
`);
      process.exit(0);
    }
  }

  startServer(opts).catch((err) => {
    console.error(chalk.red(`\n  ✖ Failed to start: ${err instanceof Error ? err.message : err}\n`));
    process.exit(1);
  });
}

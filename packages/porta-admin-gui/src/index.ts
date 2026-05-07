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

import chalk from 'chalk';
import type { Server } from 'node:http';
import open from 'open';
import { discoverOidc } from './auth/oidc.js';
import type { StartServerOptions } from './config.js';
import { resolveConfig } from './config.js';
import { createApiProxy } from './middleware/api-proxy.js';
import { createStaticMiddleware } from './middleware/static.js';
import { createAuthRoutes } from './routes/auth.js';
import { createHealthRoutes } from './routes/health.js';
import { createApp } from './server.js';
import { SessionStore } from './session.js';
import { GUI_VERSION } from './version.js';

// Re-export for `porta gui` command to import
export { startServer };
export type { StartServerOptions };

// ────────────────────────────────────────────────
// Startup logging helpers
// ────────────────────────────────────────────────

const TOTAL_STEPS = 8;

/** Print the initial startup header */
function printStartHeader(): void {
  console.log('');
  console.log(chalk.cyan('  ┌────────────────────────────────────────────────────┐'));
  console.log(
    chalk.cyan('  │') +
      chalk.bold('  Porta Admin GUI') +
      chalk.gray(` v${GUI_VERSION}`) +
      ' '.repeat(Math.max(0, 33 - GUI_VERSION.length)) +
      chalk.cyan('│'),
  );
  console.log(chalk.cyan('  │') + chalk.gray('  Starting...') + ' '.repeat(39) + chalk.cyan('│'));
  console.log(chalk.cyan('  └────────────────────────────────────────────────────┘'));
  console.log('');
}

/** Print a startup step in progress */
function stepStart(
  step: number,
  label: string,
): { done: (detail?: string) => void; fail: (detail: string) => void } {
  const prefix = chalk.gray(`  [${step}/${TOTAL_STEPS}]`);
  const paddedLabel = label.padEnd(36);
  process.stdout.write(`${prefix} ${paddedLabel}`);
  const t0 = Date.now();

  return {
    done(detail?: string) {
      const elapsed = Date.now() - t0;
      const time = chalk.gray(`(${elapsed}ms)`);
      const info = detail ? chalk.gray(` ${detail}`) : '';
      console.log(`${chalk.green('✓')} ${time}${info}`);
    },
    fail(detail: string) {
      console.log(`${chalk.red('✖')} ${chalk.red(detail)}`);
    },
  };
}

/** Print the final success banner */
function printBanner(url: string, serverUrl: string): void {
  console.log('');
  console.log(chalk.cyan('  ╔══════════════════════════════════════════════════╗'));
  console.log(
    chalk.cyan('  ║') + chalk.bold.green('  ✓ Ready!') + ' '.repeat(40) + chalk.cyan('║'),
  );
  console.log(chalk.cyan('  ║') + ' '.repeat(50) + chalk.cyan('║'));
  console.log(
    chalk.cyan('  ║') +
      `  Local:   ${chalk.green(url)}` +
      ' '.repeat(Math.max(0, 39 - url.length)) +
      chalk.cyan('║'),
  );
  console.log(
    chalk.cyan('  ║') +
      `  Server:  ${chalk.blue(serverUrl)}` +
      ' '.repeat(Math.max(0, 39 - serverUrl.length)) +
      chalk.cyan('║'),
  );
  console.log(chalk.cyan('  ║') + ' '.repeat(50) + chalk.cyan('║'));
  console.log(
    chalk.cyan('  ║') + chalk.gray('  Press Ctrl+C to stop') + ' '.repeat(28) + chalk.cyan('║'),
  );
  console.log(chalk.cyan('  ╚══════════════════════════════════════════════════╝'));
  console.log('');
}

// ────────────────────────────────────────────────
// Main startup
// ────────────────────────────────────────────────

/**
 * Start the Admin GUI BFF server.
 *
 * This is the main public API — called by `porta gui` or directly via
 * `porta-gui` binary. Runs the full 10-step startup sequence.
 *
 * @param options - Server options (server URL, port, open, insecure).
 */
async function startServer(options: StartServerOptions = {}): Promise<void> {
  printStartHeader();

  // Step 1: Resolve configuration (flag → env → credentials)
  const step1 = stepStart(1, 'Resolving configuration...');
  let config;
  try {
    config = resolveConfig(options);
    step1.done(config.serverUrl);
  } catch (err) {
    step1.fail(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  // Step 2: If --insecure, disable TLS certificate verification
  if (config.insecure) {
    const step2 = stepStart(2, 'Disabling TLS verification...');
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    step2.done('--insecure');
  } else {
    const step2 = stepStart(2, 'TLS verification...');
    step2.done('enabled');
  }

  // Step 3: Verify Porta server is reachable
  const step3 = stepStart(3, 'Checking Porta server...');
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${config.serverUrl}/health`, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) {
      throw new Error(`Server returned ${res.status}`);
    }
    step3.done(config.serverUrl);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    step3.fail(msg);
    console.error('');
    console.error(chalk.red(`  Cannot reach Porta server at ${config.serverUrl}`));
    console.error(chalk.gray('  Make sure the Porta server is running and accessible.'));
    console.error('');
    process.exit(1);
  }

  // Step 4: Discover admin metadata (client ID, org slug)
  const step4 = stepStart(4, 'Discovering admin metadata...');
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
    step4.done(`org=${orgSlug}, client=${clientId.substring(0, 8)}...`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    step4.fail(msg);
    console.error('');
    console.error(chalk.red('  Cannot discover admin metadata.'));
    console.error(chalk.gray('  Ensure the Porta server has been initialized (porta init).'));
    console.error('');
    process.exit(1);
  }

  // Step 5: Initialize OIDC configuration via openid-client discovery
  const step5 = stepStart(5, 'Initializing OIDC...');
  let oidcConfig;
  try {
    oidcConfig = await discoverOidc({
      serverUrl: config.serverUrl,
      orgSlug,
      clientId,
      port: config.publicPort,
    });
    step5.done(`issuer=${oidcConfig.issuer}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    step5.fail(msg);
    console.error('');
    console.error(chalk.red('  OIDC discovery failed.'));
    console.error(chalk.gray('  Check that the Porta server OIDC endpoints are accessible.'));
    console.error('');
    process.exit(1);
  }

  // Step 6: Start session cleanup timer
  const step6 = stepStart(6, 'Starting session store...');
  const sessionStore = new SessionStore();
  sessionStore.startCleanup();
  step6.done('cleanup interval: 60s');

  // Step 7: Create and start BFF server
  const step7 = stepStart(7, 'Starting BFF server...');

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
  app.use(
    createApiProxy({
      serverUrl: config.serverUrl,
      oidcConfig,
      sessionStore,
    }),
  );

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
      step7.fail(`Port ${config.port} is already in use`);
      console.error('');
      console.error(chalk.gray(`  Try --port ${config.port + 1}`));
      console.error('');
      process.exit(1);
    }
    throw err;
  });

  await new Promise<void>((resolve) => {
    server.once('listening', resolve);
  });

  const url = `http://127.0.0.1:${config.port}`;
  step7.done(url);

  // Step 8: Open browser (unless --no-open)
  if (config.open) {
    const step8 = stepStart(8, 'Opening browser...');
    try {
      await open(url);
      step8.done();
    } catch {
      step8.done('skipped (no browser available)');
    }
  } else {
    const step8 = stepStart(8, 'Opening browser...');
    step8.done('skipped (--no-open)');
  }

  // Print final success banner
  printBanner(url, config.serverUrl);

  // --- Graceful shutdown ---
  const shutdown = (): void => {
    console.log('');
    console.log(chalk.gray('  Shutting down...'));
    sessionStore.stopCleanup();
    server.close(() => {
      sessionStore.clear();
      console.log(chalk.gray('  Goodbye.'));
      console.log('');
      process.exit(0);
    });
    // Force exit after 5 seconds if server doesn't close
    setTimeout(() => process.exit(0), 5000).unref();
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// --- Direct execution: parse CLI args and start ---
// When run as `porta-gui` binary, `node dist/index.js`, or `tsx src/index.ts` (dev)
const isDirectExecution =
  process.argv[1] &&
  (process.argv[1].endsWith('/index.ts') ||
    process.argv[1].endsWith('/index.js') ||
    process.argv[1].endsWith('/porta-gui'));

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
    } else if (arg === '--public-port' && args[i + 1]) {
      opts.publicPort = parseInt(args[++i], 10);
    } else if (arg === '--no-open') {
      opts.open = false;
    } else if (arg === '--insecure') {
      opts.insecure = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
  Usage: porta-gui [options]

  Options:
    --server <url>        Porta server URL (required if not configured)
    --port <number>       BFF listen port (default: 4002)
    --public-port <num>   Public port for OIDC redirects (dev: Vite port)
    --no-open             Do not open browser on startup
    --insecure            Skip TLS certificate verification
    --help, -h            Show this help message
`);
      process.exit(0);
    }
  }

  startServer(opts).catch((err) => {
    console.error('');
    console.error(chalk.red(`  ✖ Failed to start: ${err instanceof Error ? err.message : err}`));
    console.error('');
    process.exit(1);
  });
}

/**
 * Playwright global setup — starts Porta + Admin GUI BFF for E2E tests.
 *
 * Startup sequence:
 *   1. Set environment variables (Porta + BFF)
 *   2. Connect PostgreSQL + Redis
 *   3. Run all database migrations
 *   4. Initialize Porta subsystems (i18n, template engine)
 *   5. Generate signing keys + load OIDC TTL config
 *   6. Create Porta Koa app with OIDC provider → listen on 49300
 *   7. Seed base data + Admin GUI test data (orgs, users, clients, etc.)
 *   8. Create BFF Koa app → OIDC discovery → sessions → routes → listen on 49301
 *   9. Mount built SPA as static files on the BFF
 *  10. Export env vars for test fixtures
 *
 * The BFF is started AFTER Porta because it needs to discover Porta's
 * OIDC configuration during initialization (setupOidc fetches the
 * discovery document from Porta's well-known endpoint).
 *
 * Uses ports 49300 (Porta) and 49301 (BFF) to avoid conflicts with
 * dev servers (4000/4002/4003), UI tests (49200), and E2E tests (random).
 */

import type { Server } from 'node:http';
import type { FullConfig } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Porta OIDC server port */
const PORT_PORTA = 49300;

/** Admin GUI BFF port */
const PORT_BFF = 49301;

/** MailHog API URL */
const MAILHOG_API_URL = 'http://localhost:8025';

/**
 * Test database URL — uses porta_test database to isolate from dev.
 * Matches the constant in tests/helpers/constants.ts.
 */
const TEST_DATABASE_URL = 'postgresql://porta:porta_dev@localhost:5432/porta_test';

/**
 * Redis URL — uses DB index 1 to isolate from dev (DB 0).
 * Matches the constant in tests/helpers/constants.ts.
 */
const TEST_REDIS_URL = 'redis://localhost:6379/1';

/** SMTP settings for MailHog */
const TEST_SMTP_HOST = 'localhost';
const TEST_SMTP_PORT = '1025';
const TEST_SMTP_FROM = 'test@porta.local';

/** Cookie signing keys for Porta */
const TEST_COOKIE_KEYS = 'test-cookie-key-1,test-cookie-key-2';

/** BFF session secret (min 32 chars for security validation) */
const BFF_SESSION_SECRET = 'e2e-test-session-secret-at-least-32-chars!!';

/** Admin user email — must match seed-data.ts ADMIN_EMAIL */
const ADMIN_EMAIL = 'admin@porta-test.local';

/** Path to admin-gui root (relative to this file at tests/e2e/setup/) */
const ADMIN_GUI_ROOT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  '../../..',
);

// ---------------------------------------------------------------------------
// Global Setup
// ---------------------------------------------------------------------------

/**
 * Playwright global setup function.
 *
 * Called once before all test files. Starts both Porta and the BFF,
 * seeds test data, and sets environment variables for fixtures.
 *
 * @param _config - Playwright full configuration (unused, required by signature)
 */
async function globalSetup(_config: FullConfig): Promise<void> {
  const startTime = Date.now();
  console.log('[Admin GUI E2E] Starting global setup...');

  // =====================================================================
  // PHASE 1: Start Porta Server
  // =====================================================================

  // ── 1a. Set Porta environment variables ────────────────────────────
  // Must be set BEFORE dynamic imports so modules pick up correct values
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.REDIS_URL = TEST_REDIS_URL;
  process.env.LOG_LEVEL = 'fatal';
  process.env.NODE_ENV = 'test';
  process.env.SMTP_HOST = TEST_SMTP_HOST;
  process.env.SMTP_PORT = TEST_SMTP_PORT;
  process.env.SMTP_FROM = TEST_SMTP_FROM;
  process.env.COOKIE_KEYS = TEST_COOKIE_KEYS;
  process.env.ISSUER_BASE_URL = `http://localhost:${PORT_PORTA}`;

  // ── 1b. Dynamic imports (Porta modules) ────────────────────────────
  const { connectDatabase } = await import('../../../../src/lib/database.js');
  const { connectRedis } = await import('../../../../src/lib/redis.js');
  const { runMigrations } = await import('../../../../src/lib/migrator.js');
  const { ensureSigningKeys } = await import('../../../../src/lib/signing-keys.js');
  const { loadOidcTtlConfig } = await import('../../../../src/lib/system-config.js');
  const { createOidcProvider } = await import('../../../../src/oidc/provider.js');
  const { createApp: createPortaApp } = await import('../../../../src/server.js');
  const { initI18n } = await import('../../../../src/auth/i18n.js');
  const { initTemplateEngine } = await import('../../../../src/auth/template-engine.js');

  // ── 1c. Connect infrastructure ─────────────────────────────────────
  await connectDatabase();
  await connectRedis();
  console.log('[Admin GUI E2E] DB + Redis connected');

  // ── 1d. Run migrations ─────────────────────────────────────────────
  await runMigrations();
  console.log('[Admin GUI E2E] Migrations complete');

  // ── 1e. Initialize Porta subsystems ────────────────────────────────
  await initI18n();
  await initTemplateEngine();

  // ── 1f. Signing keys + TTL config ──────────────────────────────────
  const jwks = await ensureSigningKeys();
  const ttl = await loadOidcTtlConfig();

  // ── 1g. Create Porta OIDC provider + Koa app ──────────────────────
  const provider = await createOidcProvider({ jwks, ttl });
  const portaApp = createPortaApp(provider);

  // ── 1h. Start Porta on dedicated port ──────────────────────────────
  const portaServer: Server = portaApp.listen(PORT_PORTA);
  await new Promise<void>((resolve) => {
    if (portaServer.listening) resolve();
    else portaServer.on('listening', resolve);
  });
  console.log(`[Admin GUI E2E] Porta server listening on port ${PORT_PORTA}`);

  // =====================================================================
  // PHASE 2: Seed Test Data
  // =====================================================================

  // Truncate and re-seed for a clean slate
  const { truncateAllTables, seedBaseData } = await import(
    '../../../../tests/integration/helpers/database.js'
  );
  await truncateAllTables();
  await seedBaseData();

  // Seed Admin GUI specific data (admin user, BFF client, test orgs, etc.)
  const { seedAdminGuiTestData } = await import('../fixtures/seed-data.js');
  const seedResult = await seedAdminGuiTestData();
  console.log('[Admin GUI E2E] Test data seeded');

  // =====================================================================
  // PHASE 3: Start Admin GUI BFF
  // =====================================================================

  // ── 3a. Set BFF environment variables ──────────────────────────────
  // These override any previously set values for the BFF's loadConfig()
  process.env.PORTA_ADMIN_PORT = String(PORT_BFF);
  process.env.PORTA_ADMIN_PORTA_URL = `http://localhost:${PORT_PORTA}`;
  process.env.PORTA_ADMIN_PUBLIC_URL = `http://localhost:${PORT_BFF}`;
  process.env.PORTA_ADMIN_CLIENT_ID = seedResult.client.clientId;
  process.env.PORTA_ADMIN_CLIENT_SECRET = seedResult.clientSecret;
  process.env.PORTA_ADMIN_SESSION_SECRET = BFF_SESSION_SECRET;
  process.env.PORTA_ADMIN_ORG_SLUG = seedResult.superAdminOrg.slug;
  // REDIS_URL already set above for Porta — BFF reuses same Redis
  // NODE_ENV stays 'test' but BFF needs 'development' for http cookies
  process.env.NODE_ENV = 'development';
  process.env.LOG_LEVEL = 'silent';

  // ── 3b. Dynamic imports (BFF modules) ──────────────────────────────
  const { loadConfig } = await import('../../../src/server/config.js');
  const { createApp: createBffApp } = await import('../../../src/server/app.js');
  const { setupOidc } = await import('../../../src/server/oidc.js');
  const { configureSession } = await import('../../../src/server/session.js');
  const { csrfProtection } = await import('../../../src/server/middleware/csrf.js');
  const { createHealthRouter } = await import('../../../src/server/routes/health.js');
  const { createAuthRouter } = await import('../../../src/server/routes/auth.js');
  const { sessionGuard } = await import('../../../src/server/middleware/session-guard.js');
  const { createApiProxyRouter } = await import('../../../src/server/routes/api-proxy.js');

  // We import pino for the logger since BFF modules need it
  const pino = (await import('pino')).default;

  // ── 3c. Load BFF config + create logger ────────────────────────────
  const bffConfig = loadConfig();
  const logger = pino({ level: 'silent' });

  // ── 3d. Discover OIDC (requires Porta to be running) ───────────────
  const oidcConfig = await setupOidc(bffConfig, logger);
  console.log('[Admin GUI E2E] OIDC discovery complete');

  // ── 3e. Create BFF Koa app + middleware ────────────────────────────
  const bffApp = createBffApp(bffConfig, logger);
  const bffRedis = configureSession(bffApp, bffConfig, logger);
  await bffRedis.connect();

  // Mount middleware in the same order as the real BFF entry point
  bffApp.use(csrfProtection(logger));

  const healthRouter = createHealthRouter(bffConfig, bffRedis);
  bffApp.use(healthRouter.routes());
  bffApp.use(healthRouter.allowedMethods());

  const authRouter = createAuthRouter(bffConfig, oidcConfig, logger);
  bffApp.use(authRouter.routes());
  bffApp.use(authRouter.allowedMethods());

  bffApp.use(sessionGuard());

  const apiProxyRouter = createApiProxyRouter(bffConfig, oidcConfig, logger);
  bffApp.use(apiProxyRouter.routes());
  bffApp.use(apiProxyRouter.allowedMethods());

  // ── 3f. Mount built SPA as static files ────────────────────────────
  // The SPA is pre-built by `vite build` (run before Playwright).
  // We serve it from dist/client/ instead of using configureSpaServing()
  // because the path resolution in spa.ts assumes running from dist/,
  // not from source TypeScript files.
  const clientDir = path.resolve(ADMIN_GUI_ROOT, 'dist', 'client');
  const indexHtmlPath = path.join(clientDir, 'index.html');

  if (!fs.existsSync(indexHtmlPath)) {
    throw new Error(
      `Admin GUI client not built — index.html not found at ${indexHtmlPath}.\n` +
        `Run "cd admin-gui && npx vite build" before running E2E tests.\n` +
        `(The test:e2e script does this automatically.)`,
    );
  }

  // Dynamic import of koa-static (already a dependency of admin-gui)
  const serve = (await import('koa-static')).default;
  bffApp.use(serve(clientDir, { maxAge: 0, gzip: true }));

  // SPA catch-all: serve index.html for all non-file GET requests
  // This enables client-side routing (React Router)
  const indexHtml = fs.readFileSync(indexHtmlPath, 'utf-8');
  bffApp.use(async (ctx, next) => {
    await next();
    // If no route matched and it's a GET for a page (not a file), serve SPA
    if (ctx.status === 404 && ctx.method === 'GET' && !ctx.path.includes('.')) {
      ctx.type = 'html';
      ctx.body = indexHtml;
      ctx.status = 200;
    }
  });

  // ── 3g. Start BFF on dedicated port ────────────────────────────────
  const bffServer: Server = bffApp.listen(PORT_BFF);
  await new Promise<void>((resolve) => {
    if (bffServer.listening) resolve();
    else bffServer.on('listening', resolve);
  });
  console.log(`[Admin GUI E2E] BFF server listening on port ${PORT_BFF}`);

  // =====================================================================
  // PHASE 4: Export Environment Variables for Tests
  // =====================================================================

  // These are read by test fixtures (admin-fixtures.ts) and auth-setup
  process.env.ADMIN_GUI_URL = `http://localhost:${PORT_BFF}`;
  process.env.PORTA_URL = `http://localhost:${PORT_PORTA}`;
  process.env.ADMIN_EMAIL = ADMIN_EMAIL;
  process.env.MAILHOG_API_URL = MAILHOG_API_URL;

  // =====================================================================
  // PHASE 5: Store Server References for Teardown
  // =====================================================================

  // Playwright runs setup and teardown in the same process, so
  // globalThis state persists between them.
  (globalThis as Record<string, unknown>).__ADMIN_GUI_PORTA_SERVER = portaServer;
  (globalThis as Record<string, unknown>).__ADMIN_GUI_BFF_SERVER = bffServer;
  (globalThis as Record<string, unknown>).__ADMIN_GUI_BFF_REDIS = bffRedis;

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[Admin GUI E2E] Global setup complete in ${elapsed}s`);
}

export default globalSetup;

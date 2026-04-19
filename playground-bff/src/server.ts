/**
 * BFF Playground Server
 *
 * Koa web server that acts as a Backend-for-Frontend for OIDC.
 * Uses openid-client v6 to handle Authorization Code flow server-side,
 * keeping tokens in Redis-backed sessions (never exposed to the browser).
 *
 * Mounts:
 *   - Session middleware (Redis-backed, HttpOnly cookie)
 *   - Body parsing for POST routes
 *   - Static file serving (public/)
 *   - Health check at GET /health
 *   - Auth routes at /auth/* (login, callback, logout)
 *   - Dashboard at GET /
 *   - API routes at /api/* (userinfo, refresh, introspect, tokens)
 *   - M2M demo at /m2m/*
 */

import Koa from 'koa';
import Router from '@koa/router';
import serve from 'koa-static';
import bodyParser from 'koa-bodyparser';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadConfig } from './config.js';
import { configureSession } from './session.js';
import { createHealthRoutes } from './routes/health.js';
import { createAuthRoutes } from './routes/auth.js';
import { createDashboardRoutes } from './routes/dashboard.js';
import { createApiRoutes } from './routes/api.js';
import { createM2mRoutes } from './routes/m2m.js';
import { createDebugRoutes } from './routes/debug.js';


// ===========================================================================
// Startup
// ===========================================================================

const __dirname = dirname(fileURLToPath(import.meta.url));
const config = loadConfig();

const app = new Koa();
const router = new Router();

// ---------------------------------------------------------------------------
// Middleware stack
// ---------------------------------------------------------------------------

// Redis-backed sessions — HttpOnly cookie, tokens stored server-side
configureSession(app, config.redis.host, config.redis.port);

// Parse JSON and form bodies for POST routes
app.use(bodyParser());

// Serve static files (CSS, JS) from public/
const publicDir = resolve(__dirname, '..', 'public');
app.use(serve(publicDir));

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// Health check — GET /health
createHealthRoutes(router);

// Auth routes — /auth/login, /auth/callback, /auth/logout
createAuthRoutes(router, config);

// Dashboard — GET /
createDashboardRoutes(router, config);

// API routes — /api/me, /api/refresh, /api/introspect, /api/tokens
createApiRoutes(router, config);

// M2M demo — /m2m, /m2m/token, /m2m/introspect, /m2m/revoke
createM2mRoutes(router, config);

// Debug routes — /debug/login-methods (dev-only)
createDebugRoutes(router, config);

app.use(router.routes());

app.use(router.allowedMethods());

// ---------------------------------------------------------------------------
// Listen
// ---------------------------------------------------------------------------

const PORT = 4001;
app.listen(PORT, () => {
  console.log(`\n🔒 BFF Playground running on http://localhost:${PORT}`);
  console.log(`   Porta:         ${config.portaUrl}`);
  console.log(`   Organizations: ${Object.keys(config.organizations).join(', ')}`);
  console.log(`   M2M client:    ${config.m2m.clientId.slice(0, 16)}…`);
  console.log();
});

/**
 * E2E global setup — starts a real Porta server for end-to-end tests.
 *
 * Delegates to the shared server-setup module which handles:
 * 1. Setting test environment variables
 * 2. Connecting to test DB and Redis
 * 3. Running migrations
 * 4. Initializing i18n and template engine
 * 5. Generating signing keys and loading OIDC TTL config
 * 6. Creating a Koa server with OIDC provider on a random port
 *
 * After setup, `process.env.TEST_SERVER_URL` contains the base URL
 * (e.g., `http://localhost:49123`) that E2E tests use for HTTP requests.
 *
 * The teardown function closes the server and disconnects infrastructure.
 */

import { setup as sharedSetup, teardown as sharedTeardown } from '../helpers/server-setup.js';

/**
 * Vitest global setup — runs ONCE before all E2E test files.
 * Starts the full Porta test server with OIDC provider.
 */
export async function setup(): Promise<void> {
  await sharedSetup();
}

/**
 * Vitest global teardown — runs ONCE after all E2E test files.
 * Stops the server and disconnects DB/Redis.
 */
export async function teardown(): Promise<void> {
  await sharedTeardown();
}

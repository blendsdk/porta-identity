/**
 * CLI error handler.
 *
 * Wraps command handlers to catch domain errors and HTTP errors,
 * displaying user-friendly messages with appropriate exit codes.
 *
 * Error handling priority:
 *   1. HTTP client errors (from authenticated API requests)
 *   2. Domain errors (from direct-DB commands like init/migrate)
 *   3. Unknown errors (generic fallback)
 *
 * HTTP error mapping:
 *   - HttpAuthError (401) → "Authentication required" with login hint
 *   - HttpForbiddenError (403) → "Insufficient permissions"
 *   - HttpNotFoundError (404) → "Not found: <message>"
 *   - HttpValidationError (400) → "Validation error" with field details
 *   - HttpServerError (5xx) → "Server error" with retry hint
 *
 * Domain error detection uses constructor name suffix matching so all
 * domain modules (organizations, applications, clients, users, RBAC,
 * custom claims) are handled without importing every error class.
 *
 * Exit codes:
 *   0 — success (set by withErrorHandling on normal completion)
 *   1 — any error (domain error, HTTP error, unexpected error)
 *
 * @module cli/error-handler
 */

import { error, warn } from './output.js';
import { HttpClientError } from './http-client.js';

/**
 * Wrap a command handler with error handling.
 *
 * Catches known HTTP errors, domain errors, and displays formatted
 * messages. Unknown errors show a generic message. Verbose mode
 * (--verbose) additionally prints the full stack trace to stderr.
 *
 * Always calls process.exit() — exit(0) on success, exit(1) on error.
 * This ensures the CLI process terminates cleanly after each command.
 *
 * @param fn - The async command handler to execute
 * @param verbose - Whether to show stack traces (from argv.verbose)
 */
export async function withErrorHandling(
  fn: () => Promise<void>,
  verbose = false,
): Promise<void> {
  try {
    await fn();
    process.exit(0);
  } catch (err: unknown) {
    if (err instanceof Error) {
      // ---------------------------------------------------------------
      // HTTP client errors (from authenticated API requests)
      // These are checked first because they're the most specific.
      // ---------------------------------------------------------------
      if (err instanceof HttpClientError) {
        handleHttpError(err);
        // handleHttpError always calls process.exit, but TypeScript
        // doesn't know that — the code below is a safety net.
      }

      // ---------------------------------------------------------------
      // Domain errors (from direct-DB commands like init/migrate)
      // Detected by constructor name suffix to avoid importing every
      // error class. All domain modules follow the naming convention:
      // <Entity>NotFoundError, <Entity>ValidationError.
      // ---------------------------------------------------------------
      const name = err.constructor.name;

      if (name.endsWith('NotFoundError')) {
        error(`Not found: ${err.message}`);
      } else if (name.endsWith('ValidationError')) {
        error(`Validation error: ${err.message}`);
      } else {
        error(`Error: ${err.message}`);
      }

      // In verbose mode, print full stack trace to stderr for debugging
      if (verbose && err.stack) {
        console.error('\n' + err.stack);
      }
    } else {
      error('An unexpected error occurred');
    }

    process.exit(1);
  }
}

/**
 * Handle HTTP client errors with status-specific messages.
 *
 * Maps HTTP status codes to user-friendly CLI output:
 *   - 401: authentication prompt
 *   - 403: permission denial
 *   - 404: resource not found
 *   - 400: validation error with field-level details
 *   - 5xx: server error with retry hint
 *
 * Always calls process.exit(1) — this function does not return.
 *
 * @param err - The HTTP client error to handle
 */
function handleHttpError(err: HttpClientError): never {
  switch (err.status) {
    case 401:
      error('Authentication required. Run "porta login" to authenticate.');
      break;

    case 403:
      error('Insufficient permissions for this operation.');
      break;

    case 404:
      error(`Not found: ${err.message}`);
      break;

    case 400:
      error(`Validation error: ${err.message}`);
      // Print field-level details if available (from Zod validation)
      if (err.details && err.details.length > 0) {
        for (const detail of err.details) {
          warn(`  - ${detail.path}: ${detail.message}`);
        }
      }
      break;

    default:
      if (err.status >= 500) {
        error('Server error. Try again or check server logs.');
      } else {
        error(`HTTP error ${err.status}: ${err.message}`);
      }
      break;
  }

  process.exit(1);
}

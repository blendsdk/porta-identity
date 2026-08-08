/**
 * CLI error handler — infrastructure commands only.
 *
 * Wraps command handlers to catch domain errors, displaying
 * user-friendly messages with appropriate exit codes.
 *
 * Domain error detection uses constructor name suffix matching so all
 * domain modules (organizations, applications, clients, users, RBAC,
 * custom claims) are handled without importing every error class.
 *
 * Exit codes:
 *   0 — success (set by withErrorHandling on normal completion)
 *   1 — any error (domain error, unexpected error)
 *
 * @module cli/error-handler
 */

import { error } from './output.js';

/**
 * Wrap a command handler with error handling.
 *
 * Catches known domain errors and displays formatted messages.
 * Unknown errors show a generic message. Verbose mode (--verbose)
 * additionally prints the full stack trace to stderr.
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

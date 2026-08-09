/**
 * CLI error handler — maps SDK errors to user-friendly output.
 *
 * Wraps command handlers with a try/catch that translates the SDK
 * error hierarchy into appropriate CLI output and exit codes:
 *
 * | Exit Code | Meaning             | SDK Error Class          |
 * |-----------|---------------------|--------------------------|
 * | 0         | Success             | —                        |
 * | 1         | General error       | PortaError, unknown      |
 * | 2         | Authentication error| PortaAuthenticationError |
 * | 3         | Validation error    | PortaValidationError     |
 *
 * In verbose mode (`--verbose`), the full error stack trace and
 * response body are printed. In normal mode, only the user-friendly
 * message is shown.
 *
 * @module error-handler
 */

import {
  PortaError,
  PortaHttpError,
  PortaAuthenticationError,
  PortaValidationError,
  PortaForbiddenError,
  PortaNotFoundError,
  PortaConflictError,
  PortaRateLimitError,
  PortaServerError,
} from '@portaidentity/sdk';
import { error as printError } from './output.js';

// ---------------------------------------------------------------------------
// Exit Codes
// ---------------------------------------------------------------------------

/** CLI exit codes per AR #99 */
export const EXIT_SUCCESS = 0;
export const EXIT_GENERAL_ERROR = 1;
export const EXIT_AUTH_ERROR = 2;
export const EXIT_VALIDATION_ERROR = 3;

// ---------------------------------------------------------------------------
// Error Handler
// ---------------------------------------------------------------------------

/**
 * Wraps a command handler function with error handling.
 *
 * Catches SDK errors and translates them to user-friendly output
 * with appropriate exit codes. This is the primary error boundary
 * for all CLI commands.
 *
 * @param fn - The async command handler to wrap
 * @param verbose - Whether to show detailed error output
 * @returns A wrapped function that handles errors gracefully
 */
export function withErrorHandling<T extends unknown[]>(
  fn: (...args: T) => Promise<void>,
  verbose = false,
): (...args: T) => Promise<void> {
  return async (...args: T) => {
    try {
      await fn(...args);
    } catch (err) {
      handleError(err, verbose);
    }
  };
}

/**
 * Handles an error by printing a user-friendly message and exiting.
 *
 * Maps SDK error types to specific messages and exit codes.
 * In verbose mode, includes the full stack trace and response body.
 *
 * @param err - The caught error
 * @param verbose - Whether to show detailed output
 */
export function handleError(err: unknown, verbose = false): never {
  // --- SDK Validation Error (400) ---
  if (err instanceof PortaValidationError) {
    printError(`Validation failed: ${err.message}`);
    if (err.details.length > 0) {
      for (const detail of err.details) {
        printError(`  ${detail.path}: ${detail.message}`);
      }
    }
    if (verbose) printVerboseDetails(err);
    process.exit(EXIT_VALIDATION_ERROR);
  }

  // --- SDK Authentication Error (401) ---
  if (err instanceof PortaAuthenticationError) {
    printError(`Authentication failed: ${err.message}`);
    printError('Run "porta login" to authenticate.');
    if (verbose) printVerboseDetails(err);
    process.exit(EXIT_AUTH_ERROR);
  }

  // --- SDK Forbidden Error (403) ---
  if (err instanceof PortaForbiddenError) {
    printError(`Access denied: ${err.message}`);
    printError('You do not have the required permissions for this operation.');
    if (verbose) printVerboseDetails(err);
    process.exit(EXIT_AUTH_ERROR);
  }

  // --- SDK Not Found Error (404) ---
  if (err instanceof PortaNotFoundError) {
    printError(`Not found: ${err.message}`);
    if (verbose) printVerboseDetails(err);
    process.exit(EXIT_GENERAL_ERROR);
  }

  // --- SDK Conflict Error (409) ---
  if (err instanceof PortaConflictError) {
    printError(`Conflict: ${err.message}`);
    if (verbose) printVerboseDetails(err);
    process.exit(EXIT_GENERAL_ERROR);
  }

  // --- SDK Rate Limit Error (429) ---
  if (err instanceof PortaRateLimitError) {
    const retryMsg = err.retryAfter ? ` Retry after ${err.retryAfter}s.` : '';
    printError(`Rate limit exceeded: ${err.message}${retryMsg}`);
    if (verbose) printVerboseDetails(err);
    process.exit(EXIT_GENERAL_ERROR);
  }

  // --- SDK Server Error (5xx) ---
  if (err instanceof PortaServerError) {
    printError(`Server error (${err.status}): ${err.message}`);
    if (verbose) printVerboseDetails(err);
    process.exit(EXIT_GENERAL_ERROR);
  }

  // --- Generic SDK HTTP Error ---
  if (err instanceof PortaHttpError) {
    printError(`HTTP ${err.status}: ${err.message}`);
    if (verbose) printVerboseDetails(err);
    process.exit(EXIT_GENERAL_ERROR);
  }

  // --- Generic SDK Error ---
  if (err instanceof PortaError) {
    printError(err.message);
    if (verbose && err.stack) {
      console.error('\n' + err.stack);
    }
    process.exit(EXIT_GENERAL_ERROR);
  }

  // --- Standard Error ---
  if (err instanceof Error) {
    printError(err.message);
    if (verbose && err.stack) {
      console.error('\n' + err.stack);
    }
    process.exit(EXIT_GENERAL_ERROR);
  }

  // --- Unknown error ---
  printError(`An unexpected error occurred: ${String(err)}`);
  process.exit(EXIT_GENERAL_ERROR);
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/**
 * Prints verbose error details (stack trace and response body).
 *
 * @param err - The HTTP error with additional details
 */
function printVerboseDetails(err: PortaHttpError): void {
  if (err.stack) {
    console.error('\nStack trace:');
    console.error(err.stack);
  }
  if (err.body) {
    console.error('\nResponse body:');
    console.error(JSON.stringify(err.body, null, 2));
  }
}

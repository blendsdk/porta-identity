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
import { formatCliError, LocalInputError } from './error-format.js';
import type { CliErrorEnvelope } from './error-format.js';

// ---------------------------------------------------------------------------
// Exit Codes
// ---------------------------------------------------------------------------

/** Successful command completion. */
export const EXIT_SUCCESS = 0;
/** A general command failure. */
export const EXIT_GENERAL_ERROR = 1;
/** Authentication or authorization failed. */
export const EXIT_AUTH_ERROR = 2;
/** The API or new local input failed validation. */
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
 * @param json - Whether to emit the fixed safe JSON error instead of human diagnostics
 * @returns A wrapped function that handles errors gracefully
 */
export function withErrorHandling<T extends unknown[]>(
  fn: (...args: T) => Promise<void>,
  verbose = false,
  json = false,
): (...args: T) => Promise<void> {
  return async (...args: T) => {
    try {
      await fn(...args);
    } catch (err) {
      if (json) handleError(err, verbose, true);
      handleError(err, verbose);
    }
  };
}

/** Chooses the stable exit code for one formatted JSON error envelope. */
function jsonExitCode(err: unknown): number {
  if (err instanceof LocalInputError || err instanceof PortaValidationError) {
    return EXIT_VALIDATION_ERROR;
  }
  if (err instanceof PortaAuthenticationError || err instanceof PortaForbiddenError) {
    return EXIT_AUTH_ERROR;
  }
  return EXIT_GENERAL_ERROR;
}

/**
 * Print one classified human diagnostic and then hand control to `exit`.
 *
 * Separating reporting from process termination lets command handlers inside a
 * yargs parser set the exit code without throwing, while the executable keeps
 * its existing terminating behaviour.
 */
function reportHuman(err: unknown, verbose: boolean, exit: (code: number) => void): void {
  if (err instanceof LocalInputError) {
    printError(err.message);
    exit(EXIT_VALIDATION_ERROR);
    return;
  }
  // --- SDK Validation Error (400) ---
  if (err instanceof PortaValidationError) {
    printError(`Validation failed: ${err.message}`);
    if (err.details.length > 0) {
      for (const detail of err.details) {
        printError(`  ${detail.path}: ${detail.message}`);
      }
    }
    if (verbose) printVerboseDetails(err);
    exit(EXIT_VALIDATION_ERROR);
    return;
  }

  // --- SDK Authentication Error (401) ---
  if (err instanceof PortaAuthenticationError) {
    printError(`Authentication failed: ${err.message}`);
    printError('Run "porta login" to authenticate.');
    if (verbose) printVerboseDetails(err);
    exit(EXIT_AUTH_ERROR);
    return;
  }

  // --- SDK Forbidden Error (403) ---
  if (err instanceof PortaForbiddenError) {
    printError(`Access denied: ${err.message}`);
    printError('You do not have the required permissions for this operation.');
    if (verbose) printVerboseDetails(err);
    exit(EXIT_AUTH_ERROR);
    return;
  }

  // --- SDK Not Found Error (404) ---
  if (err instanceof PortaNotFoundError) {
    printError(`Not found: ${err.message}`);
    if (verbose) printVerboseDetails(err);
    exit(EXIT_GENERAL_ERROR);
    return;
  }

  // --- SDK Conflict Error (409) ---
  if (err instanceof PortaConflictError) {
    printError(`Conflict: ${err.message}`);
    if (verbose) printVerboseDetails(err);
    exit(EXIT_GENERAL_ERROR);
    return;
  }

  // --- SDK Rate Limit Error (429) ---
  if (err instanceof PortaRateLimitError) {
    const retryMsg = err.retryAfter ? ` Retry after ${err.retryAfter}s.` : '';
    printError(`Rate limit exceeded: ${err.message}${retryMsg}`);
    if (verbose) printVerboseDetails(err);
    exit(EXIT_GENERAL_ERROR);
    return;
  }

  // --- SDK Server Error (5xx) ---
  if (err instanceof PortaServerError) {
    printError(`Server error (${err.status}): ${err.message}`);
    if (err.requestId) printError(`Request ID: ${err.requestId}`);
    if (verbose) printVerboseDetails(err);
    exit(EXIT_GENERAL_ERROR);
    return;
  }

  // --- Generic SDK HTTP Error ---
  if (err instanceof PortaHttpError) {
    printError(`HTTP ${err.status}: ${err.message}`);
    if (verbose) printVerboseDetails(err);
    exit(EXIT_GENERAL_ERROR);
    return;
  }

  // --- Generic SDK Error ---
  if (err instanceof PortaError) {
    printError(err.message);
    if (verbose && err.stack) {
      console.error('\n' + err.stack);
    }
    exit(EXIT_GENERAL_ERROR);
    return;
  }

  // --- Standard Error ---
  if (err instanceof Error) {
    printError(err.message);
    if (verbose && err.stack) {
      console.error('\n' + err.stack);
    }
    exit(EXIT_GENERAL_ERROR);
    return;
  }

  // --- Unknown error ---
  printError(`An unexpected error occurred: ${String(err)}`);
  exit(EXIT_GENERAL_ERROR);
  return;
}

/**
 * Handles an error by printing a user-friendly message and exiting.
 *
 * Maps SDK error types to specific messages and exit codes.
 * In verbose mode, includes the full stack trace and response body.
 *
 * @param err - The caught error
 * @param verbose - Whether to show detailed output
 * @param json - Whether to discard external diagnostics and emit one safe JSON envelope
 */
export function handleError(err: unknown, verbose = false, json = false): never {
  if (json) {
    writeJsonError(formatCliError(err));
    process.exit(jsonExitCode(err));
  }
  reportHuman(err, verbose, (code) => process.exit(code));
  process.exit(EXIT_GENERAL_ERROR);
}

/** Print one classified human diagnostic and retain its exit code without terminating. */
export function reportHumanError(err: unknown, verbose = false): void {
  reportHuman(err, verbose, (code) => {
    process.exitCode = code;
  });
}

/** Write one safe JSON envelope and retain its exit code without terminating. */
export function reportJsonError(err: unknown): void {
  writeJsonError(formatCliError(err));
  process.exitCode = jsonExitCode(err);
}

/**
 * Write a preformatted safe error without exiting or altering a command's legacy exit code.
 * Callers must construct it through the closed formatter, never from arbitrary response data.
 * @example writeJsonError(formatCliError(new Error('private diagnostics')))
 */
export function writeJsonError(envelope: CliErrorEnvelope): void {
  console.error(JSON.stringify(envelope));
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

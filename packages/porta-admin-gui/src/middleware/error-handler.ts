/**
 * Global error handler middleware for the BFF server.
 *
 * Catches all unhandled errors in the Koa middleware chain and returns
 * a safe JSON error response. Internal details (stack traces, file paths,
 * database errors) are NEVER leaked to the client.
 *
 * @module middleware/error-handler
 */

import type { Context, Next } from 'koa';

/**
 * Koa middleware that wraps the entire downstream chain in a try/catch.
 * Returns a generic error message for unexpected errors.
 */
export function errorHandler(): (ctx: Context, next: Next) => Promise<void> {
  return async (ctx: Context, next: Next): Promise<void> => {
    try {
      await next();
    } catch (err: unknown) {
      // Extract status code if the error has one (e.g., Koa HttpError)
      const status =
        typeof (err as { status?: unknown }).status === 'number'
          ? (err as { status: number }).status
          : 500;

      // Use the error message only for client-safe status codes (4xx)
      // For 5xx errors, always return a generic message to prevent leaking internals
      const message =
        status >= 400 && status < 500 && err instanceof Error
          ? err.message
          : 'Internal server error';

      ctx.status = status;
      ctx.body = { error: message };

      // Log the full error for debugging (console only — never to the response)
      if (status >= 500) {
        console.error(
          `[error] ${ctx.method} ${ctx.path} → ${status}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
  };
}

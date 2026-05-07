/**
 * Request logging middleware for the BFF server.
 *
 * Logs each request in the format: `{method} {path} {status} {duration}ms`
 * using chalk for color coding. Lightweight — uses console.log, not pino.
 *
 * @module middleware/request-logger
 */

import type { Context, Next } from 'koa';
import chalk from 'chalk';

/**
 * Koa middleware that logs every request with method, path, status, and duration.
 */
export function requestLogger(): (ctx: Context, next: Next) => Promise<void> {
  return async (ctx: Context, next: Next): Promise<void> => {
    const start = Date.now();

    await next();

    const duration = Date.now() - start;
    const status = ctx.status;

    // Color-code the status: green for 2xx, yellow for 3xx, red for 4xx/5xx
    const statusColor =
      status >= 500
        ? chalk.red(status)
        : status >= 400
          ? chalk.yellow(status)
          : status >= 300
            ? chalk.cyan(status)
            : chalk.green(status);

    const method = chalk.bold(ctx.method.padEnd(7));
    const path = ctx.path;
    const time = chalk.gray(`${duration}ms`);

    console.log(`  ${method} ${path} ${statusColor} ${time}`);
  };
}

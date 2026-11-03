#!/usr/bin/env node
/** Executable adapter: keep process exits and uncaught errors outside parser construction. */
import { hideBin } from 'yargs/helpers';
import { createCli, resolveJsonMode } from './cli.js';
import { handleError } from './error-handler.js';

const args = hideBin(process.argv);
/** Capture synchronous construction/parsing failures in the same executable error boundary. */
async function main(): Promise<void> {
  await createCli(args).parseAsync();
}

main().catch((error: unknown) => {
  if (resolveJsonMode(args)) handleError(error, false, true);
  // Human mode retains the established top-level diagnostics and general exit.
  console.error(error);
  process.exit(1);
});

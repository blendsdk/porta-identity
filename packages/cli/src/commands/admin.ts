/** Thin command adapter for the embedded terminal administration application. */

import type { CommandModule } from 'yargs';
import { runAdminApplication } from '../admin/index.js';
import type { AdminApplicationOptions, AdminExitCode } from '../admin/index.js';
import { prepareAdminSession } from '../admin/session-service.js';
import { normalizeServerOrigin, resolveServerUrl, type GlobalOptions } from '../global-options.js';

/** Parsed arguments accepted by `porta admin`. */
export type AdminArguments = GlobalOptions;

/** Injectable command boundaries used by focused preflight tests. */
export interface AdminCommandDependencies {
  /** Whether standard input is attached to an interactive terminal. */
  readonly stdinIsTTY: boolean;
  /** Whether standard output is attached to an interactive terminal. */
  readonly stdoutIsTTY: boolean;
  /** Writes a concise preflight failure after no screen has been constructed. */
  readonly writeStderr: (message: string) => void;
  /** Starts the embedded application after all local checks pass. */
  readonly runApplication: (options: AdminApplicationOptions) => Promise<AdminExitCode>;
}

/** Production process and application boundaries. */
const DEFAULT_DEPENDENCIES: AdminCommandDependencies = {
  stdinIsTTY: process.stdin.isTTY === true,
  stdoutIsTTY: process.stdout.isTTY === true,
  writeStderr: (message) => process.stderr.write(`${message}\n`),
  runApplication: runAdminApplication,
};

const INSECURE_TLS_RUNTIME_WARNING =
  "Setting the NODE_TLS_REJECT_UNAUTHORIZED environment variable to '0' makes TLS connections and HTTPS requests insecure by disabling certificate verification.";

/**
 * Prevents Node's redundant insecure-TLS warning from writing outside JSVision's frame renderer.
 *
 * The application retains its own persistent insecure-mode warning. Every unrelated process warning
 * still reaches Node's original warning handler, and the process hook is restored after the TUI exits.
 */
async function withoutInsecureTlsRuntimeWarning<T>(operation: () => Promise<T>): Promise<T> {
  const originalEmitWarning = process.emitWarning;
  const filteredEmitWarning = (
    warning: string | Error,
    ...metadata: readonly unknown[]
  ): void => {
    const message = typeof warning === 'string' ? warning : warning.message;
    if (message === INSECURE_TLS_RUNTIME_WARNING) return;
    Reflect.apply(originalEmitWarning, process, [warning, ...metadata]);
  };
  Object.defineProperty(process, 'emitWarning', {
    configurable: true,
    value: filteredEmitWarning,
    writable: true,
  });
  try {
    return await operation();
  } finally {
    Object.defineProperty(process, 'emitWarning', {
      configurable: true,
      value: originalEmitWarning,
      writable: true,
    });
  }
}

/** Reports one bounded usage failure without constructing terminal state. */
function rejectUsage(dependencies: AdminCommandDependencies, message: string): AdminExitCode {
  dependencies.writeStderr(message);
  return 2;
}

/** Runs the command preflight and starts the application only when it is safe. */
export async function runAdminCommand(
  arguments_: AdminArguments,
  dependencies: AdminCommandDependencies = DEFAULT_DEPENDENCIES,
): Promise<AdminExitCode> {
  if (!dependencies.stdinIsTTY || !dependencies.stdoutIsTTY) {
    return rejectUsage(dependencies, 'porta admin requires an interactive input and output TTY.');
  }
  if (arguments_.json || arguments_.force) {
    return rejectUsage(dependencies, 'porta admin cannot be used with --json or --force.');
  }

  let server: URL | undefined;
  try {
    server = arguments_.server
      ? normalizeServerOrigin(arguments_.server)
      : normalizeServerOrigin(resolveServerUrl(arguments_));
  } catch {
    if (arguments_.server) {
      return rejectUsage(dependencies, 'Select a valid HTTPS Porta server origin.');
    }
  }

  if (arguments_.insecure) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  try {
    const runApplication = () =>
      dependencies.runApplication({
        server,
        insecure: arguments_.insecure,
        showInsecureWarning: arguments_.insecure,
        prepareSession: (selectedServer, interaction) =>
          prepareAdminSession(selectedServer, interaction),
      });
    return await (arguments_.insecure
      ? withoutInsecureTlsRuntimeWarning(runApplication)
      : runApplication());
  } catch {
    dependencies.writeStderr('Unable to start Porta administration.');
    return 1;
  }
}

/** Registers the interactive administration application. */
export const adminCommand: CommandModule<GlobalOptions, AdminArguments> = {
  command: 'admin',
  describe: 'Open the interactive Porta administration application',
  handler: async (arguments_) => {
    process.exitCode = await runAdminCommand(arguments_);
  },
};

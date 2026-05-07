/**
 * `porta gui` command — Launch the standalone Admin GUI.
 *
 * Dynamically imports `@portaidentity/admin-gui` and calls `startServer()`.
 * If the package is not installed, prints install instructions.
 *
 * The admin-gui package is NOT a dependency of the CLI — it is discovered
 * at runtime via dynamic import. This avoids bloating the CLI with
 * React + FluentUI dependencies.
 *
 * @module commands/gui
 */

import type { CommandModule } from 'yargs';
import type { GlobalOptions } from '../global-options.js';
import { error, warn } from '../output.js';

interface GuiOptions extends GlobalOptions {
  port?: number;
  'no-open'?: boolean;
}

export const guiCommand: CommandModule<GlobalOptions, GuiOptions> = {
  command: 'gui',
  describe: 'Launch the Porta Admin GUI in your browser',
  builder: (yargs) =>
    yargs
      .option('port', {
        type: 'number',
        describe: 'BFF listen port',
        default: 4002,
      })
      .option('no-open', {
        type: 'boolean',
        describe: 'Do not open browser on startup',
        default: false,
      }),

  handler: async (argv) => {
    try {
      // Dynamic import — admin-gui is NOT a CLI dependency
      const adminGui = (await import('@portaidentity/admin-gui')) as {
        startServer: (options: {
          server?: string;
          port?: number;
          open?: boolean;
          insecure?: boolean;
        }) => Promise<void>;
      };

      await adminGui.startServer({
        server: argv.server,
        port: argv.port,
        open: !argv['no-open'],
        insecure: argv.insecure,
      });
    } catch (err: unknown) {
      // Check if it's a module-not-found error
      if (isModuleNotFound(err)) {
        warn('The Porta Admin GUI package is not installed.\n');
        console.log('  Install it with:\n');
        console.log('    npm install -g @portaidentity/admin-gui\n');
        console.log('  Or run it directly with:\n');
        console.log('    npx @portaidentity/admin-gui --server <porta-server-url>\n');
        process.exit(1);
      }

      // Other error — rethrow
      error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  },
};

/**
 * Check if an error is a module-not-found error for @portaidentity/admin-gui.
 */
function isModuleNotFound(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const code = (err as NodeJS.ErrnoException).code;
  return code === 'ERR_MODULE_NOT_FOUND' && err.message.includes('@portaidentity/admin-gui');
}

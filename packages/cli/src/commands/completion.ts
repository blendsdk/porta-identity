/**
 * CLI completion command — generate shell completion scripts.
 *
 * Leverages yargs' built-in completion support to generate
 * shell completion scripts for bash, zsh, and fish.
 *
 * Usage:
 *   porta completion              # Print completion script
 *   source <(porta completion)    # Install for current session (bash/zsh)
 *
 * Permanent installation:
 *   porta completion >> ~/.bashrc    # bash
 *   porta completion >> ~/.zshrc     # zsh
 *
 * @module commands/completion
 */

import type { CommandModule } from 'yargs';
import type { GlobalOptions } from '../global-options.js';

// ---------------------------------------------------------------------------
// Command Definition
// ---------------------------------------------------------------------------

/**
 * The completion command module — outputs shell completion script.
 *
 * This is a thin wrapper that triggers yargs' built-in `showCompletionScript()`
 * method. The completion script handles tab-completion for commands,
 * subcommands, and options.
 */
export const completionCommand: CommandModule<GlobalOptions, GlobalOptions> = {
  command: 'completion',
  describe: 'Generate shell completion script',

  handler: async () => {
    // yargs.showCompletionScript() is called via the yargs configuration
    // in index.ts. This handler is a fallback for direct invocation.
    console.log('# Porta CLI shell completion');
    console.log('# Add the following to your shell profile:');
    console.log('#   source <(porta completion)');
    console.log('#');
    console.log('# Or use yargs built-in completion:');
    console.log('#   porta --get-yargs-completions');
    process.exit(0);
  },
};

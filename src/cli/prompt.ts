/**
 * CLI confirmation prompt utility.
 *
 * Uses Node.js built-in readline for simple y/N confirmation prompts.
 * Respects the --force flag to skip prompts for automation and scripting.
 *
 * The default answer is "No" (capital N in the prompt), so pressing Enter
 * without typing anything returns false. Only an explicit "y" or "Y"
 * confirms the action.
 *
 * @module cli/prompt
 */

import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

/**
 * Ask a y/N confirmation question.
 *
 * Returns true if user types "y" or "Y", false for anything else.
 * If force is true, skips the prompt entirely and returns true —
 * this allows `--force` to bypass confirmations in scripts/automation.
 *
 * @param message - The question to display (e.g., "Delete organization?")
 * @param force - If true, skip the prompt and return true (from argv.force)
 * @returns true if confirmed, false otherwise
 */
export async function confirm(
  message: string,
  force = false,
): Promise<boolean> {
  // --force flag bypasses all confirmation prompts
  if (force) return true;

  const rl = readline.createInterface({ input, output });
  try {
    const answer = await rl.question(`${message} (y/N): `);
    // Only explicit "y" or "Y" confirms — empty input or anything else is "no"
    return answer.trim().toLowerCase() === 'y';
  } finally {
    // Always close the readline interface to release stdin
    rl.close();
  }
}

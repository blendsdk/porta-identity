/**
 * CLI prompt utilities.
 *
 * Provides confirmation, text input, and password (hidden) prompts
 * for interactive CLI commands. Uses Node.js built-in readline.
 *
 * - `confirm()` — y/N confirmation, respects --force flag
 * - `promptInput()` — reads a line of text (echoed)
 * - `promptPassword()` — reads a line with hidden input (no echo)
 *
 * @module cli/prompt
 */

import * as readline from 'node:readline/promises';
import { Writable } from 'node:stream';
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

/**
 * Prompt the user for a line of text input.
 *
 * Displays the message and waits for the user to type a response.
 * Returns the trimmed input string. Used for non-sensitive fields
 * like email, name, etc.
 *
 * @param message - The prompt message to display (e.g., "Admin email: ")
 * @returns The user's trimmed input
 */
export async function promptInput(message: string): Promise<string> {
  const rl = readline.createInterface({ input, output });
  try {
    const answer = await rl.question(message);
    return answer.trim();
  } finally {
    rl.close();
  }
}

/**
 * Prompt the user for a password (hidden input).
 *
 * Displays the message but suppresses character echo so the password
 * is not visible on screen. Uses a muted Writable stream as the
 * readline output to prevent echo while still allowing the prompt
 * message to be displayed via direct stdout write.
 *
 * @param message - The prompt message to display (e.g., "Password: ")
 * @returns The user's password input (trimmed)
 */
export async function promptPassword(message: string): Promise<string> {
  // Write the prompt message directly to stdout before creating the
  // muted readline — this ensures the user sees the prompt label
  output.write(message);

  // Create a Writable that discards all output — this suppresses
  // character echo while readline is active
  const muted = new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  });

  const rl = readline.createInterface({ input, output: muted, terminal: true });
  try {
    // Empty string prompt since we already wrote the label above
    const answer = await rl.question('');
    // Move to the next line since echo was suppressed (no newline from Enter)
    output.write('\n');
    return answer.trim();
  } finally {
    rl.close();
  }
}

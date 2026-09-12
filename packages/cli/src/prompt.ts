/**
 * Interactive prompt helpers for CLI commands.
 *
 * Provides confirmation, text input, and password prompts using
 * Node.js readline. All prompts respect the `--force` flag —
 * when set, confirmation prompts auto-approve and the command
 * proceeds without user interaction.
 *
 * @module prompt
 */

import { createInterface } from 'node:readline';
import { sanitizeTerminalText } from './output.js';

// ---------------------------------------------------------------------------
// Confirmation Prompt
// ---------------------------------------------------------------------------

/**
 * Asks the user for yes/no confirmation.
 *
 * Displays the message and waits for 'y' or 'n' input.
 * Returns true if the user confirms, false otherwise.
 *
 * @param message - The confirmation question
 * @returns true if the user answers 'y' or 'yes'
 */
export async function confirm(message: string, signal?: AbortSignal): Promise<boolean> {
  const answer = await question(`${message} [y/N] `, signal);
  return answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
}

/**
 * Asks the user for type-to-confirm input.
 *
 * Used for destructive operations (e.g., `porta org destroy`).
 * Requires the user to type the exact expected value to confirm.
 *
 * @param message - The prompt message
 * @param expected - The value the user must type to confirm
 * @returns true if the input matches the expected value
 */
export async function confirmTyped(message: string, expected: string): Promise<boolean> {
  const answer = await question(`${message}: `);
  return answer === expected;
}

// ---------------------------------------------------------------------------
// Input Prompts
// ---------------------------------------------------------------------------

/**
 * Prompts the user for text input.
 *
 * @param prompt - The prompt message to display
 * @returns The user's input string
 */
export async function question(prompt: string, signal?: AbortSignal): Promise<string> {
  const safePrompt = sanitizeTerminalText(prompt);
  const rl = createInterface({
    input: process.stdin,
    output: process.stderr, // Prompt on stderr so stdout stays clean for piping
  });

  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const abort = (): void => {
      if (settled) return;
      settled = true;
      rl.close();
      reject(new DOMException('The operation was aborted', 'AbortError'));
    };
    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener('abort', abort, { once: true });
    rl.question(safePrompt, (answer) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', abort);
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Prompts the user for password input (hidden).
 *
 * Masks input characters with asterisks. Uses the readline
 * `_writeToOutput` override to suppress echo while still
 * showing the prompt.
 *
 * @param prompt - The prompt message to display
 * @returns The entered password string
 */
export async function password(prompt: string): Promise<string> {
  const safePrompt = sanitizeTerminalText(prompt);
  const rl = createInterface({
    input: process.stdin,
    output: process.stderr,
  });

  // Suppress echoing of password characters
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (rl as any)._writeToOutput = function _writeToOutput(str: string) {
    if (str.includes(safePrompt)) {
      // Show the prompt itself
      process.stderr.write(str);
    } else {
      // Mask password characters with asterisks
      process.stderr.write('*');
    }
  };

  return new Promise<string>((resolve) => {
    rl.question(safePrompt, (answer) => {
      process.stderr.write('\n'); // New line after hidden input
      rl.close();
      resolve(answer);
    });
  });
}

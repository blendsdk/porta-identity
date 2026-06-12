/**
 * CLI output helpers.
 *
 * Provides table and JSON formatters, color helpers, and common display
 * utilities. All commands use these helpers for consistent output across
 * the CLI.
 *
 * Table output uses cli-table3 with bold headers.
 * JSON output uses formatted (2-space indent) JSON to stdout.
 * Color helpers use chalk for success/warning/error messages.
 *
 * @module output
 */

import Table from 'cli-table3';
import chalk from 'chalk';

/** Matches ANSI SGR escape sequences (e.g. chalk colors) for length measurement. */
// eslint-disable-next-line no-control-regex
const ANSI_PATTERN = /\u001b\[[0-9;]*m/g;


/** Returns the visible length of a string, ignoring ANSI color codes. */
function visibleLength(value: string): number {
  return value.replace(ANSI_PATTERN, '').length;
}

/**
 * Computes per-column widths so that long cell values wrap within the table
 * instead of overflowing the terminal — without ever dropping characters.
 *
 * Returns `undefined` when the table's natural width already fits the terminal
 * (let cli-table3 auto-size to content). When the natural width exceeds the
 * terminal, column widths are allocated proportionally to their content so the
 * table box stays intact and `wordWrap` wraps the overflow.
 *
 * @param headers - Column header labels
 * @param rows - Row data
 * @param terminalWidth - Available terminal columns
 * @returns Array of cli-table3 column widths (content + padding), or undefined
 */
function computeColumnWidths(
  headers: string[],
  rows: string[][],
  terminalWidth: number,
): number[] | undefined {
  const numCols = headers.length;
  if (numCols === 0) return undefined;

  // Natural content width per column = widest visible value (header or cell).
  const natural = headers.map((header, i) => {
    let max = visibleLength(header);
    for (const row of rows) {
      max = Math.max(max, visibleLength(String(row[i] ?? '')));
    }
    return max;
  });

  // cli-table3 layout: each column adds 2 chars of padding; borders add numCols+1.
  const paddingPerCol = 2;
  const borders = numCols + 1;
  const naturalTotal = natural.reduce((sum, w) => sum + w + paddingPerCol, 0) + borders;

  // Already fits — let the table size itself to the full content.
  if (naturalTotal <= terminalWidth) return undefined;

  const minContent = 6;
  const overhead = numCols * paddingPerCol + borders;
  const available = terminalWidth - overhead;

  // Terminal too narrow even for minimums — give every column the minimum.
  if (available < numCols * minContent) {
    return natural.map(() => minContent + paddingPerCol);
  }

  const naturalContentTotal = natural.reduce((a, b) => a + b, 0) || 1;
  return natural.map((w) => {
    const allocated = Math.max(minContent, Math.floor((w / naturalContentTotal) * available));
    return allocated + paddingPerCol;
  });
}

/**
 * Formats data as a table and prints to stdout.
 *
 * Creates a cli-table3 instance with bold headers and prints each row. Cell
 * values are NEVER truncated: when attached to a TTY whose width is too small
 * for the full content, columns are sized to the terminal and long values wrap
 * within their cell (preserving every character, including full UUIDs). When
 * output is piped (no TTY), values print on single lines for easy grep/scripting.
 *
 * @param headers - Column header labels (will be bold)
 * @param rows - Array of row data (each row is an array of cell strings)
 */
export function printTable(headers: string[], rows: string[][]): void {
  const options: Table.TableConstructorOptions = {
    head: headers.map((h) => chalk.bold(h)),
  };

  const terminalWidth = process.stdout.columns;
  if (terminalWidth && terminalWidth > 0) {
    const colWidths = computeColumnWidths(headers, rows, terminalWidth);
    if (colWidths) {
      options.colWidths = colWidths;
      options.wordWrap = true;
      // Wrap long unbroken tokens (e.g. UUIDs) by character, not word boundary.
      options.wrapOnWordBoundary = false;
    }
  }

  const table = new Table(options);
  rows.forEach((row) => table.push(row));
  console.log(table.toString());
}

/**
 * Prints data as formatted JSON to stdout.
 *
 * Outputs a 2-space-indented JSON string. Used when `--json` flag is set,
 * enabling machine-readable output for scripting and piping.
 *
 * @param data - Any JSON-serializable value
 */
export function printJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

/**
 * Prints a success message in green.
 *
 * @param message - The success message
 */
export function success(message: string): void {
  console.log(chalk.green(`✓ ${message}`));
}

/**
 * Prints a warning message in yellow to stderr.
 *
 * @param message - The warning message
 */
export function warn(message: string): void {
  console.error(chalk.yellow(`⚠ ${message}`));
}

/**
 * Prints an error message in red to stderr.
 *
 * @param message - The error message
 */
export function error(message: string): void {
  console.error(chalk.red(`✗ ${message}`));
}

/**
 * Prints an info message in blue.
 *
 * @param message - The info message
 */
export function info(message: string): void {
  console.log(chalk.blue(`ℹ ${message}`));
}

/**
 * Formats a date string or Date object for display.
 *
 * Returns 'N/A' for null/undefined values.
 * Uses ISO 8601 format with local timezone.
 *
 * @param date - Date string, Date object, or null/undefined
 * @returns Formatted date string or 'N/A'
 */
export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return 'N/A';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString();
}

/**
 * Truncates a string to a maximum length with ellipsis.
 *
 * @param str - The string to truncate
 * @param maxLen - Maximum length (default: 40)
 * @returns Truncated string with '...' if needed
 */
export function truncate(str: string, maxLen = 40): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}

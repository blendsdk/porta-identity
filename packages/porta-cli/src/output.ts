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

/**
 * Formats data as a table and prints to stdout.
 *
 * Creates a cli-table3 instance with bold headers and prints each row.
 * Used by list and show commands for human-readable output.
 *
 * @param headers - Column header labels (will be bold)
 * @param rows - Array of row data (each row is an array of cell strings)
 */
export function printTable(headers: string[], rows: string[][]): void {
  const table = new Table({ head: headers.map((h) => chalk.bold(h)) });
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

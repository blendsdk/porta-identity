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
 * @module cli/output
 */

import Table from 'cli-table3';
import chalk from 'chalk';

/**
 * Format data as a table and print to stdout.
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
 * Print data as formatted JSON to stdout.
 *
 * Outputs a 2-space-indented JSON representation. Used when the --json
 * flag is provided for machine-readable output.
 *
 * @param data - Any JSON-serializable value
 */
export function printJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

/**
 * Print a success message with green checkmark.
 *
 * @param message - The success message to display
 */
export function success(message: string): void {
  console.log(chalk.green('✅ ' + message));
}

/**
 * Print a warning message with yellow icon.
 *
 * @param message - The warning message to display
 */
export function warn(message: string): void {
  console.log(chalk.yellow('⚠️  ' + message));
}

/**
 * Print an error message with red X to stderr.
 *
 * Uses console.error so error messages go to stderr (fd 2),
 * keeping stdout clean for piping and scripting.
 *
 * @param message - The error message to display
 */
export function error(message: string): void {
  console.error(chalk.red('❌ ' + message));
}

/**
 * Print a "total" summary line below a table.
 *
 * Standard pattern: "Total: N <label>" displayed after list output.
 *
 * @param label - Plural noun describing the items (e.g., "organizations")
 * @param count - Number of items
 */
export function printTotal(label: string, count: number): void {
  console.log(`\nTotal: ${count} ${label}`);
}

/**
 * Smart output: if --json, print JSON; otherwise, run the table renderer.
 *
 * Common pattern used by all list/show commands. The table renderer is
 * a callback so we don't build table data when JSON mode is active.
 *
 * @param isJson - Whether JSON output is requested (from argv.json)
 * @param tableRenderer - Function that renders table output when called
 * @param jsonData - Data to output in JSON mode
 */
export function outputResult(
  isJson: boolean,
  tableRenderer: () => void,
  jsonData: unknown,
): void {
  if (isJson) {
    printJson(jsonData);
  } else {
    tableRenderer();
  }
}

/**
 * Truncate a string for table display.
 *
 * UUIDs and long fields are shortened to fit table columns.
 * Shows the first `length` characters followed by "...".
 *
 * @param id - The string to truncate
 * @param length - Maximum length before truncation (default: 8)
 * @returns The original string if short enough, or truncated with "..."
 */
export function truncateId(id: string, length = 8): string {
  return id.length > length ? id.substring(0, length) + '...' : id;
}

/**
 * Format a Date for display.
 *
 * Converts Date objects or ISO strings to YYYY-MM-DD format.
 * Null/undefined values render as an em-dash for clean table display.
 *
 * @param date - Date object, ISO string, or null
 * @returns Formatted date string or em-dash for null values
 */
export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toISOString().split('T')[0];
}

/**
 * Tests for the CLI output helpers module.
 *
 * Verifies table formatting, JSON output, color helpers,
 * date formatting, and string truncation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  printTable,
  printJson,
  success,
  warn,
  error,
  info,
  formatDate,
  truncate,
} from '../src/output.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('output', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('printTable', () => {
    it('prints a table to stdout', () => {
      printTable(
        ['Name', 'Status'],
        [
          ['org-1', 'active'],
          ['org-2', 'suspended'],
        ],
      );
      expect(logSpy).toHaveBeenCalledOnce();
      const output = logSpy.mock.calls[0][0] as string;
      // cli-table3 output contains the data
      expect(output).toContain('org-1');
      expect(output).toContain('active');
      expect(output).toContain('org-2');
      expect(output).toContain('suspended');
    });

    it('handles empty rows', () => {
      printTable(['Name'], []);
      expect(logSpy).toHaveBeenCalledOnce();
    });

    it('never truncates full UUIDs, even in a narrow terminal', () => {
      const originalColumns = process.stdout.columns;
      // Simulate a narrow terminal that cannot fit the full content on one line.
      Object.defineProperty(process.stdout, 'columns', {
        value: 40,
        configurable: true,
      });
      try {
        const uuid = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
        // The second column uses a non-hex label ("ZZZ") so that extracting
        // hex glyphs from the rendered table yields only the ID cell content.
        printTable(['ID', 'Name'], [[uuid, 'ZZZ']]);
        const rawOutput = logSpy.mock.calls[0][0] as string;
        // Strip ANSI color codes so only the rendered glyphs remain.
        // eslint-disable-next-line no-control-regex
        const output = rawOutput.replace(/\u001b\[[0-9;]*m/g, '');
        // Reconstruct the ID column's hex characters across wrapped lines.
        // Every hex digit of the UUID must survive (wrapped, never clipped).
        const hexOnly = output.replace(/[^0-9a-f]/g, '');
        expect(hexOnly).toContain(uuid.replace(/-/g, ''));
        // No ellipsis truncation marker should appear.
        expect(output).not.toContain('…');
      } finally {
        Object.defineProperty(process.stdout, 'columns', {
          value: originalColumns,
          configurable: true,
        });
      }
    });
  });

  describe('printJson', () => {
    it('prints formatted JSON to stdout', () => {
      const data = { name: 'test', status: 'active' };
      printJson(data);
      expect(logSpy).toHaveBeenCalledWith(JSON.stringify(data, null, 2));
    });

    it('handles arrays', () => {
      printJson([1, 2, 3]);
      expect(logSpy).toHaveBeenCalledWith(JSON.stringify([1, 2, 3], null, 2));
    });

    it('handles null', () => {
      printJson(null);
      expect(logSpy).toHaveBeenCalledWith('null');
    });
  });

  describe('success', () => {
    it('prints green success message to stdout', () => {
      success('Operation completed');
      expect(logSpy).toHaveBeenCalledOnce();
      // The output includes chalk coloring and ✓ prefix
      const output = logSpy.mock.calls[0][0] as string;
      expect(output).toContain('Operation completed');
    });
  });

  describe('warn', () => {
    it('prints yellow warning message to stderr', () => {
      warn('Something is off');
      expect(errorSpy).toHaveBeenCalledOnce();
      const output = errorSpy.mock.calls[0][0] as string;
      expect(output).toContain('Something is off');
    });
  });

  describe('error', () => {
    it('prints red error message to stderr', () => {
      error('Something failed');
      expect(errorSpy).toHaveBeenCalledOnce();
      const output = errorSpy.mock.calls[0][0] as string;
      expect(output).toContain('Something failed');
    });
  });

  describe('info', () => {
    it('prints blue info message to stdout', () => {
      info('FYI');
      expect(logSpy).toHaveBeenCalledOnce();
      const output = logSpy.mock.calls[0][0] as string;
      expect(output).toContain('FYI');
    });
  });

  describe('formatDate', () => {
    it('returns N/A for null', () => {
      expect(formatDate(null)).toBe('N/A');
    });

    it('returns N/A for undefined', () => {
      expect(formatDate(undefined)).toBe('N/A');
    });

    it('formats a date string', () => {
      const result = formatDate('2026-01-15T10:30:00Z');
      expect(result).toBeTruthy();
      expect(result).not.toBe('N/A');
    });

    it('formats a Date object', () => {
      const result = formatDate(new Date('2026-06-15T14:00:00Z'));
      expect(result).toBeTruthy();
      expect(result).not.toBe('N/A');
    });
  });

  describe('truncate', () => {
    it('returns short strings unchanged', () => {
      expect(truncate('hello', 40)).toBe('hello');
    });

    it('truncates long strings with ellipsis', () => {
      const long = 'a'.repeat(50);
      const result = truncate(long, 20);
      expect(result.length).toBe(20);
      expect(result.endsWith('...')).toBe(true);
    });

    it('uses default max length of 40', () => {
      const exact = 'a'.repeat(40);
      expect(truncate(exact)).toBe(exact);

      const longer = 'a'.repeat(41);
      expect(truncate(longer).length).toBe(40);
    });

    it('handles edge case of maxLen equal to string length', () => {
      expect(truncate('hello', 5)).toBe('hello');
    });
  });
});

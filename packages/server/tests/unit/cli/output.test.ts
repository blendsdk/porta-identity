import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock cli-table3 — must use a function (not arrow) so `new Table()` works.
// vi.mock factories are hoisted, so we cannot reference top-level variables.
vi.mock('cli-table3', () => {
  // Use a regular function constructor so `new Table(...)` succeeds
  const MockTable = vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.rows = [] as string[][];
    this.push = vi.fn().mockImplementation((row: string[]) => {
      (this.rows as string[][]).push(row);
    });
    this.toString = vi.fn().mockReturnValue('mock-table-output');
  });
  return { default: MockTable };
});

// Mock chalk — pass-through for testing (no ANSI codes to assert against)
vi.mock('chalk', () => ({
  default: {
    bold: (s: string) => `[bold]${s}[/bold]`,
    green: (s: string) => `[green]${s}[/green]`,
    yellow: (s: string) => `[yellow]${s}[/yellow]`,
    red: (s: string) => `[red]${s}[/red]`,
  },
}));

import Table from 'cli-table3';
import {
  printTable,
  printJson,
  success,
  warn,
  error,
  printTotal,
  outputResult,
  truncateId,
  formatDate,
} from '../../../src/cli/output.js';

describe('CLI Output Helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Spy on console methods to capture output
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('printTable()', () => {
    it('should create a table with bold headers', () => {
      printTable(['Name', 'Status'], [['Acme', 'active']]);

      expect(Table).toHaveBeenCalledWith({
        head: ['[bold]Name[/bold]', '[bold]Status[/bold]'],
      });
    });

    it('should push each row to the table', () => {
      const rows = [
        ['Acme', 'active'],
        ['Beta', 'suspended'],
      ];

      printTable(['Name', 'Status'], rows);

      // Access the mock instance's push method
      const tableInstance = vi.mocked(Table).mock.results[0].value;
      expect(tableInstance.push).toHaveBeenCalledTimes(2);
      expect(tableInstance.push).toHaveBeenCalledWith(['Acme', 'active']);
      expect(tableInstance.push).toHaveBeenCalledWith(['Beta', 'suspended']);
    });

    it('should print table toString output to console.log', () => {
      printTable(['Name'], [['Acme']]);

      expect(console.log).toHaveBeenCalledWith('mock-table-output');
    });

    it('should handle empty rows array', () => {
      printTable(['Name', 'Status'], []);

      const tableInstance = vi.mocked(Table).mock.results[0].value;
      expect(tableInstance.push).not.toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith('mock-table-output');
    });
  });

  describe('printJson()', () => {
    it('should print formatted JSON to stdout', () => {
      const data = { name: 'Acme', status: 'active' };

      printJson(data);

      expect(console.log).toHaveBeenCalledWith(
        JSON.stringify(data, null, 2),
      );
    });

    it('should handle arrays', () => {
      const data = [{ id: 1 }, { id: 2 }];

      printJson(data);

      expect(console.log).toHaveBeenCalledWith(
        JSON.stringify(data, null, 2),
      );
    });

    it('should handle null', () => {
      printJson(null);

      expect(console.log).toHaveBeenCalledWith('null');
    });

    it('should handle primitive values', () => {
      printJson(42);

      expect(console.log).toHaveBeenCalledWith('42');
    });
  });

  describe('success()', () => {
    it('should print a green checkmark message to stdout', () => {
      success('Organization created');

      expect(console.log).toHaveBeenCalledWith(
        '[green]✅ Organization created[/green]',
      );
    });
  });

  describe('warn()', () => {
    it('should print a yellow warning message to stdout', () => {
      warn('This is a production environment');

      expect(console.log).toHaveBeenCalledWith(
        '[yellow]⚠️  This is a production environment[/yellow]',
      );
    });
  });

  describe('error()', () => {
    it('should print a red error message to stderr', () => {
      error('Connection failed');

      expect(console.error).toHaveBeenCalledWith(
        '[red]❌ Connection failed[/red]',
      );
    });

    it('should use console.error not console.log', () => {
      error('Something broke');

      expect(console.log).not.toHaveBeenCalled();
      expect(console.error).toHaveBeenCalledOnce();
    });
  });

  describe('printTotal()', () => {
    it('should print total count with label', () => {
      printTotal('organizations', 5);

      expect(console.log).toHaveBeenCalledWith('\nTotal: 5 organizations');
    });

    it('should handle zero count', () => {
      printTotal('users', 0);

      expect(console.log).toHaveBeenCalledWith('\nTotal: 0 users');
    });
  });

  describe('outputResult()', () => {
    it('should print JSON when isJson is true', () => {
      const tableRenderer = vi.fn();
      const jsonData = { name: 'Acme' };

      outputResult(true, tableRenderer, jsonData);

      expect(tableRenderer).not.toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(
        JSON.stringify(jsonData, null, 2),
      );
    });

    it('should call table renderer when isJson is false', () => {
      const tableRenderer = vi.fn();
      const jsonData = { name: 'Acme' };

      outputResult(false, tableRenderer, jsonData);

      expect(tableRenderer).toHaveBeenCalledOnce();
    });

    it('should not build JSON when in table mode', () => {
      // The table renderer is called, JSON data is not printed
      let tableCalled = false;
      const tableRenderer = () => {
        tableCalled = true;
      };

      outputResult(false, tableRenderer, { data: 'unused' });

      expect(tableCalled).toBe(true);
    });
  });

  describe('truncateId()', () => {
    it('should return full UUID without truncation', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';

      expect(truncateId(uuid)).toBe(uuid);
    });

    it('should return short strings as-is', () => {
      expect(truncateId('12345678')).toBe('12345678');
      expect(truncateId('abc')).toBe('abc');
    });

    it('should return long strings as-is (no truncation)', () => {
      expect(truncateId('abcdefghij')).toBe('abcdefghij');
    });

    it('should handle empty string', () => {
      expect(truncateId('')).toBe('');
    });
  });

  describe('formatDate()', () => {
    it('should format a Date object to YYYY-MM-DD', () => {
      const date = new Date('2026-04-09T10:30:00Z');

      expect(formatDate(date)).toBe('2026-04-09');
    });

    it('should format an ISO string to YYYY-MM-DD', () => {
      expect(formatDate('2026-01-15T14:00:00.000Z')).toBe('2026-01-15');
    });

    it('should return em-dash for null', () => {
      expect(formatDate(null)).toBe('—');
    });

    it('should return em-dash for undefined', () => {
      expect(formatDate(undefined)).toBe('—');
    });

    it('should handle date-only strings', () => {
      // Date-only strings are parsed as UTC by the Date constructor
      expect(formatDate('2026-12-25')).toBe('2026-12-25');
    });
  });
});

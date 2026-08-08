import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock node:readline/promises — vi.mock factories are hoisted and CANNOT
// reference top-level const variables (they're in the temporal dead zone).
// Instead, we define mock functions inside the factory and retrieve them
// via vi.mocked(createInterface) after import.
vi.mock('node:readline/promises', () => ({
  createInterface: vi.fn().mockReturnValue({
    question: vi.fn().mockResolvedValue('n'),
    close: vi.fn(),
  }),
}));

import { createInterface } from 'node:readline/promises';
import { confirm } from '../../../src/cli/prompt.js';

/**
 * Helper to get the mock readline interface returned by createInterface.
 * Must be called after createInterface has been invoked (i.e., after confirm()).
 */
function getMockRl() {
  return vi.mocked(createInterface).mock.results[0]?.value as {
    question: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  };
}

describe('CLI Prompt Utility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the mock interface returned by createInterface for each test.
    // Since clearAllMocks only clears call history, we need to re-set the
    // mockReturnValue so each test gets a fresh mock interface.
    const freshMockRl = {
      question: vi.fn().mockResolvedValue('n'),
      close: vi.fn(),
    };
    vi.mocked(createInterface).mockReturnValue(freshMockRl as never);
  });

  describe('confirm() with force=true', () => {
    it('should return true immediately when force is true', async () => {
      const result = await confirm('Delete everything?', true);

      expect(result).toBe(true);
    });

    it('should not create a readline interface when force is true', async () => {
      await confirm('Dangerous operation?', true);

      expect(createInterface).not.toHaveBeenCalled();
    });

    it('should not prompt the user when force is true', async () => {
      await confirm('Are you sure?', true);

      // No readline interface created, so no question asked
      expect(createInterface).not.toHaveBeenCalled();
    });
  });

  describe('confirm() with user input', () => {
    it('should return true when user types "y"', async () => {
      const mockRl = { question: vi.fn().mockResolvedValue('y'), close: vi.fn() };
      vi.mocked(createInterface).mockReturnValue(mockRl as never);

      const result = await confirm('Continue?');

      expect(result).toBe(true);
    });

    it('should return true when user types "Y" (case insensitive)', async () => {
      const mockRl = { question: vi.fn().mockResolvedValue('Y'), close: vi.fn() };
      vi.mocked(createInterface).mockReturnValue(mockRl as never);

      const result = await confirm('Continue?');

      expect(result).toBe(true);
    });

    it('should return true when user types " y " (with whitespace)', async () => {
      const mockRl = { question: vi.fn().mockResolvedValue(' y '), close: vi.fn() };
      vi.mocked(createInterface).mockReturnValue(mockRl as never);

      const result = await confirm('Continue?');

      expect(result).toBe(true);
    });

    it('should return false when user types "n"', async () => {
      const mockRl = { question: vi.fn().mockResolvedValue('n'), close: vi.fn() };
      vi.mocked(createInterface).mockReturnValue(mockRl as never);

      const result = await confirm('Continue?');

      expect(result).toBe(false);
    });

    it('should return false when user types "N"', async () => {
      const mockRl = { question: vi.fn().mockResolvedValue('N'), close: vi.fn() };
      vi.mocked(createInterface).mockReturnValue(mockRl as never);

      const result = await confirm('Continue?');

      expect(result).toBe(false);
    });

    it('should return false when user presses Enter (empty input)', async () => {
      const mockRl = { question: vi.fn().mockResolvedValue(''), close: vi.fn() };
      vi.mocked(createInterface).mockReturnValue(mockRl as never);

      const result = await confirm('Continue?');

      expect(result).toBe(false);
    });

    it('should return false for "yes" (only single "y" counts)', async () => {
      const mockRl = { question: vi.fn().mockResolvedValue('yes'), close: vi.fn() };
      vi.mocked(createInterface).mockReturnValue(mockRl as never);

      const result = await confirm('Continue?');

      expect(result).toBe(false);
    });

    it('should return false for arbitrary text', async () => {
      const mockRl = { question: vi.fn().mockResolvedValue('maybe'), close: vi.fn() };
      vi.mocked(createInterface).mockReturnValue(mockRl as never);

      const result = await confirm('Continue?');

      expect(result).toBe(false);
    });
  });

  describe('prompt display', () => {
    it('should display message with (y/N) suffix', async () => {
      await confirm('Delete this organization?');

      const mockRl = getMockRl();
      expect(mockRl.question).toHaveBeenCalledWith(
        'Delete this organization? (y/N): ',
      );
    });

    it('should display custom message', async () => {
      await confirm('Run seed data in production?');

      const mockRl = getMockRl();
      expect(mockRl.question).toHaveBeenCalledWith(
        'Run seed data in production? (y/N): ',
      );
    });
  });

  describe('readline lifecycle', () => {
    it('should create a readline interface with stdin/stdout', async () => {
      await confirm('Continue?');

      expect(createInterface).toHaveBeenCalledWith({
        input: process.stdin,
        output: process.stdout,
      });
    });

    it('should close the readline interface after user answers', async () => {
      const mockRl = { question: vi.fn().mockResolvedValue('y'), close: vi.fn() };
      vi.mocked(createInterface).mockReturnValue(mockRl as never);

      await confirm('Continue?');

      expect(mockRl.close).toHaveBeenCalledOnce();
    });

    it('should close the readline interface even when question throws', async () => {
      const mockRl = {
        question: vi.fn().mockRejectedValue(new Error('stdin closed')),
        close: vi.fn(),
      };
      vi.mocked(createInterface).mockReturnValue(mockRl as never);

      await expect(confirm('Continue?')).rejects.toThrow('stdin closed');

      // The finally block should still close the interface
      expect(mockRl.close).toHaveBeenCalledOnce();
    });
  });

  describe('force parameter defaults', () => {
    it('should default force to false (prompts user)', async () => {
      const result = await confirm('Continue?');

      // Should have prompted because force defaults to false
      const mockRl = getMockRl();
      expect(mockRl.question).toHaveBeenCalledOnce();
      expect(result).toBe(false);
    });
  });
});

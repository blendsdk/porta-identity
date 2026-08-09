/**
 * Tests for the CLI error handler module.
 *
 * Verifies that SDK errors are mapped to the correct exit codes
 * and user-friendly messages. Uses process.exit mocking to capture
 * exit codes without actually terminating.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  PortaError,
  PortaHttpError,
  PortaValidationError,
  PortaAuthenticationError,
  PortaForbiddenError,
  PortaNotFoundError,
  PortaConflictError,
  PortaRateLimitError,
  PortaServerError,
} from '@portaidentity/sdk';
import {
  handleError,
  withErrorHandling,
  EXIT_SUCCESS,
  EXIT_GENERAL_ERROR,
  EXIT_AUTH_ERROR,
  EXIT_VALIDATION_ERROR,
} from '../src/error-handler.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock process.exit to capture exit code without terminating
const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {
  // throw to stop execution in handleError (it's marked `never`)
  throw new Error('process.exit called');
}) as never);

// Suppress console output during tests
vi.spyOn(console, 'error').mockImplementation(() => {});
vi.spyOn(console, 'log').mockImplementation(() => {});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('error-handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('exit codes', () => {
    it('EXIT_SUCCESS is 0', () => {
      expect(EXIT_SUCCESS).toBe(0);
    });

    it('EXIT_GENERAL_ERROR is 1', () => {
      expect(EXIT_GENERAL_ERROR).toBe(1);
    });

    it('EXIT_AUTH_ERROR is 2', () => {
      expect(EXIT_AUTH_ERROR).toBe(2);
    });

    it('EXIT_VALIDATION_ERROR is 3', () => {
      expect(EXIT_VALIDATION_ERROR).toBe(3);
    });
  });

  describe('handleError', () => {
    it('exits with code 3 for PortaValidationError', () => {
      expect(() => handleError(new PortaValidationError({ error: 'Bad input', details: [] }))).toThrow();
      expect(mockExit).toHaveBeenCalledWith(EXIT_VALIDATION_ERROR);
    });

    it('exits with code 2 for PortaAuthenticationError', () => {
      expect(() => handleError(new PortaAuthenticationError())).toThrow();
      expect(mockExit).toHaveBeenCalledWith(EXIT_AUTH_ERROR);
    });

    it('exits with code 2 for PortaForbiddenError', () => {
      expect(() => handleError(new PortaForbiddenError())).toThrow();
      expect(mockExit).toHaveBeenCalledWith(EXIT_AUTH_ERROR);
    });

    it('exits with code 1 for PortaNotFoundError', () => {
      expect(() => handleError(new PortaNotFoundError())).toThrow();
      expect(mockExit).toHaveBeenCalledWith(EXIT_GENERAL_ERROR);
    });

    it('exits with code 1 for PortaConflictError', () => {
      expect(() => handleError(new PortaConflictError())).toThrow();
      expect(mockExit).toHaveBeenCalledWith(EXIT_GENERAL_ERROR);
    });

    it('exits with code 1 for PortaRateLimitError', () => {
      expect(() => handleError(new PortaRateLimitError())).toThrow();
      expect(mockExit).toHaveBeenCalledWith(EXIT_GENERAL_ERROR);
    });

    it('exits with code 1 for PortaServerError', () => {
      expect(() => handleError(new PortaServerError(500))).toThrow();
      expect(mockExit).toHaveBeenCalledWith(EXIT_GENERAL_ERROR);
    });

    it('exits with code 1 for generic PortaHttpError', () => {
      expect(() => handleError(new PortaHttpError(418, 'I am a teapot'))).toThrow();
      expect(mockExit).toHaveBeenCalledWith(EXIT_GENERAL_ERROR);
    });

    it('exits with code 1 for generic PortaError', () => {
      expect(() => handleError(new PortaError('SDK error'))).toThrow();
      expect(mockExit).toHaveBeenCalledWith(EXIT_GENERAL_ERROR);
    });

    it('exits with code 1 for standard Error', () => {
      expect(() => handleError(new Error('Something went wrong'))).toThrow();
      expect(mockExit).toHaveBeenCalledWith(EXIT_GENERAL_ERROR);
    });

    it('exits with code 1 for unknown error types', () => {
      expect(() => handleError('string error')).toThrow();
      expect(mockExit).toHaveBeenCalledWith(EXIT_GENERAL_ERROR);
    });

    it('includes retry-after info for rate limit errors', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error');
      expect(() => handleError(new PortaRateLimitError(undefined, 30))).toThrow();
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Retry after 30s'));
    });
  });

  describe('withErrorHandling', () => {
    it('calls the wrapped function normally on success', async () => {
      const fn = vi.fn().mockResolvedValue(undefined);
      const wrapped = withErrorHandling(fn);
      await wrapped();
      expect(fn).toHaveBeenCalledOnce();
    });

    it('catches errors and calls handleError', async () => {
      const fn = vi.fn().mockRejectedValue(new PortaNotFoundError());
      const wrapped = withErrorHandling(fn);
      // handleError calls process.exit which throws in our mock
      await expect(wrapped()).rejects.toThrow('process.exit called');
      expect(mockExit).toHaveBeenCalledWith(EXIT_GENERAL_ERROR);
    });

    it('passes arguments through to the wrapped function', async () => {
      const fn = vi.fn().mockResolvedValue(undefined);
      const wrapped = withErrorHandling(fn);
      await wrapped('arg1', 'arg2');
      expect(fn).toHaveBeenCalledWith('arg1', 'arg2');
    });
  });
});

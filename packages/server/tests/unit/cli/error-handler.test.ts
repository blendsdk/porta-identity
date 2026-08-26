import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the output module to capture error() calls without chalk/console side effects
vi.mock('../../../src/cli/output.js', () => ({
  error: vi.fn(),
}));

import { withErrorHandling } from '../../../src/cli/error-handler.js';
import { error } from '../../../src/cli/output.js';

/**
 * Custom error classes for testing domain error mapping.
 * These simulate the real domain error classes without importing them.
 */
class OrganizationNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OrganizationNotFoundError';
  }
}

class UserValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserValidationError';
  }
}

class ClientNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClientNotFoundError';
  }
}

class RbacValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RbacValidationError';
  }
}

describe('CLI Error Handler', () => {
  let mockExit: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock process.exit to prevent actually exiting during tests.
    // Cast to any because process.exit's return type is `never`.
    mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('successful command execution', () => {
    it('should call process.exit(0) when handler succeeds', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);

      await withErrorHandling(handler);

      expect(handler).toHaveBeenCalledOnce();
      expect(mockExit).toHaveBeenCalledWith(0);
    });

    it('should not call error() when handler succeeds', async () => {
      await withErrorHandling(async () => {});

      expect(error).not.toHaveBeenCalled();
    });
  });

  describe('NotFoundError mapping', () => {
    it('should display "Not found" for OrganizationNotFoundError', async () => {
      await withErrorHandling(async () => {
        throw new OrganizationNotFoundError('Organization not found: acme');
      });

      expect(error).toHaveBeenCalledWith(
        'Not found: Organization not found: acme',
      );
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('should display "Not found" for ClientNotFoundError', async () => {
      await withErrorHandling(async () => {
        throw new ClientNotFoundError('Client not found: abc123');
      });

      expect(error).toHaveBeenCalledWith(
        'Not found: Client not found: abc123',
      );
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('should map any error ending with NotFoundError', async () => {
      // Simulate a custom NotFoundError from any module
      class CustomEntityNotFoundError extends Error {
        constructor() {
          super('Entity 42 does not exist');
          this.name = 'CustomEntityNotFoundError';
        }
      }

      await withErrorHandling(async () => {
        throw new CustomEntityNotFoundError();
      });

      expect(error).toHaveBeenCalledWith(
        'Not found: Entity 42 does not exist',
      );
    });
  });

  describe('ValidationError mapping', () => {
    it('should display "Validation error" for UserValidationError', async () => {
      await withErrorHandling(async () => {
        throw new UserValidationError('Email is required');
      });

      expect(error).toHaveBeenCalledWith(
        'Validation error: Email is required',
      );
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('should display "Validation error" for RbacValidationError', async () => {
      await withErrorHandling(async () => {
        throw new RbacValidationError('Role slug already exists');
      });

      expect(error).toHaveBeenCalledWith(
        'Validation error: Role slug already exists',
      );
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('should map any error ending with ValidationError', async () => {
      class AnyModuleValidationError extends Error {
        constructor() {
          super('Field X is invalid');
          this.name = 'AnyModuleValidationError';
        }
      }

      await withErrorHandling(async () => {
        throw new AnyModuleValidationError();
      });

      expect(error).toHaveBeenCalledWith(
        'Validation error: Field X is invalid',
      );
    });
  });

  describe('generic Error handling', () => {
    it('should display "Error" for standard Error instances', async () => {
      await withErrorHandling(async () => {
        throw new Error('Connection refused');
      });

      expect(error).toHaveBeenCalledWith('Error: Connection refused');
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('should display "Error" for TypeError', async () => {
      await withErrorHandling(async () => {
        throw new TypeError('Cannot read property of null');
      });

      expect(error).toHaveBeenCalledWith(
        'Error: Cannot read property of null',
      );
    });
  });

  describe('non-Error throw handling', () => {
    it('should display generic message for string throws', async () => {
      await withErrorHandling(async () => {
        throw 'string error';
      });

      expect(error).toHaveBeenCalledWith('An unexpected error occurred');
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('should display generic message for null throws', async () => {
      await withErrorHandling(async () => {
        throw null;
      });

      expect(error).toHaveBeenCalledWith('An unexpected error occurred');
    });

    it('should display generic message for undefined throws', async () => {
      await withErrorHandling(async () => {
        throw undefined;
      });

      expect(error).toHaveBeenCalledWith('An unexpected error occurred');
    });
  });

  describe('verbose mode', () => {
    it('should print stack trace when verbose is true', async () => {
      const testError = new Error('Something broke');

      await withErrorHandling(async () => {
        throw testError;
      }, true);

      // Stack trace should be printed to console.error
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Error: Something broke'),
      );
    });

    it('should not print stack trace when verbose is false', async () => {
      await withErrorHandling(async () => {
        throw new Error('Something broke');
      }, false);

      // console.error should NOT be called with a stack trace
      // (error() is mocked separately, so console.error is only for stack)
      expect(console.error).not.toHaveBeenCalled();
    });

    it('should not print stack trace by default (verbose defaults to false)', async () => {
      await withErrorHandling(async () => {
        throw new Error('Something broke');
      });

      expect(console.error).not.toHaveBeenCalled();
    });

    it('should print stack trace for NotFoundError in verbose mode', async () => {
      const notFoundErr = new OrganizationNotFoundError('org not found');

      await withErrorHandling(async () => {
        throw notFoundErr;
      }, true);

      expect(error).toHaveBeenCalledWith('Not found: org not found');
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('OrganizationNotFoundError'),
      );
    });
  });

  describe('exit codes', () => {
    it('should exit with code 0 on success', async () => {
      await withErrorHandling(async () => {});

      expect(mockExit).toHaveBeenCalledWith(0);
    });

    it('should exit with code 1 on NotFoundError', async () => {
      await withErrorHandling(async () => {
        throw new OrganizationNotFoundError('not found');
      });

      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('should exit with code 1 on ValidationError', async () => {
      await withErrorHandling(async () => {
        throw new UserValidationError('invalid');
      });

      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('should exit with code 1 on generic Error', async () => {
      await withErrorHandling(async () => {
        throw new Error('oops');
      });

      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('should exit with code 1 on non-Error throw', async () => {
      await withErrorHandling(async () => {
        throw 42;
      });

      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });
});

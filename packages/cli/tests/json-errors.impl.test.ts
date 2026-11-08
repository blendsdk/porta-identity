/** Internal metadata guards and additive error-reporting boundaries. */
import { PortaHttpError, PortaAuthenticationError } from '@portaidentity/sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CliArgumentError,
  CliErrorCode,
  formatCliError,
  formatKnownCliError,
  LocalInputError,
} from '../src/error-format.js';
import { handleError, writeJsonError } from '../src/error-handler.js';
import { captureCommandOutput, CommandExit } from './helpers/json-error-contract.js';

afterEach(() => vi.restoreAllMocks());

describe('local error discriminators', () => {
  it('should keep local human diagnostics separate from fixed JSON prose', () => {
    const input = new LocalInputError('--claim 2 must contain valid JSON.');
    expect(formatCliError(input)).toStrictEqual({
      code: CliErrorCode.Validation,
      message: 'The command input is invalid.',
    });
    const output = captureCommandOutput();
    expect(() => handleError(input)).toThrow(CommandExit);
    expect(process.exit).toHaveBeenCalledExactlyOnceWith(3);
    expect(output.stderr).toContain('--claim 2 must contain valid JSON.');
  });

  it('should classify a parser discriminator without retaining parser text', () => {
    expect(formatCliError(new CliArgumentError())).toStrictEqual({
      code: CliErrorCode.Argument,
      message: 'Invalid command arguments.',
    });
  });
});

describe('observed HTTP metadata', () => {
  it.each([NaN, Infinity, -1, 99, 600, 403.5])(
    'should omit invalid status %s rather than coerce it',
    (status) => {
      expect(formatKnownCliError(CliErrorCode.Diagnostic, { status })).not.toHaveProperty('status');
    },
  );

  it.each([100, 200, 401, 599])('should retain bounded observed status %s', (status) => {
    expect(formatKnownCliError(CliErrorCode.Diagnostic, { status })).toHaveProperty(
      'status',
      status,
    );
  });

  it('should retain an observed generic HTTP 401 but omit an opaque SDK authentication 401', () => {
    expect(formatCliError(new PortaHttpError(401, 'private'))).toStrictEqual({
      code: CliErrorCode.Authentication,
      message: 'Authentication is required.',
      status: 401,
    });
    expect(formatCliError(new PortaAuthenticationError())).not.toHaveProperty('status');
  });

  it('should not copy structural metadata from an ordinary object', () => {
    expect(formatCliError({ status: 403, requestId: 'private', retryAfter: 5 })).toStrictEqual({
      code: CliErrorCode.Command,
      message: 'The command failed.',
    });
  });

  it('should filter metadata independently and keep a new summary object', () => {
    const metadata = { status: 503, requestId: 'invalid', retryAfter: -1 };
    const result = formatKnownCliError(CliErrorCode.Batch, metadata);
    expect(result).toStrictEqual({
      code: CliErrorCode.Batch,
      message: 'The operation did not complete successfully.',
      status: 503,
    });
    metadata.status = 418;
    expect(result.status).toBe(503);
  });

  it('should write one safe direct summary without exiting or changing the legacy exit code', () => {
    const previous = process.exitCode;
    const output = captureCommandOutput();
    try {
      process.exitCode = 3;
      writeJsonError(formatKnownCliError(CliErrorCode.Batch, { retryAfter: 0 }));
      expect(process.exitCode).toBe(3);
      expect(process.exit).not.toHaveBeenCalled();
      expect(output.stdout).toBe('');
      expect(JSON.parse(output.stderr)).toStrictEqual({
        code: CliErrorCode.Batch,
        message: 'The operation did not complete successfully.',
        retryAfter: 0,
      });
    } finally {
      process.exitCode = previous;
    }
  });
});

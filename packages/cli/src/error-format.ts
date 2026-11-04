/** Closed, value-free diagnostics for non-interactive CLI consumers. */
import {
  PortaAuthenticationError,
  PortaHttpError,
  PortaRateLimitError,
  PortaServerError,
} from '@portaidentity/sdk';

/** Stable machine-readable error categories; external error names are never categories. */
export enum CliErrorCode {
  /** The API or local command input failed validation. */
  Validation = 'VALIDATION_ERROR',
  /** Authentication is absent or could not be recovered. */
  Authentication = 'AUTHENTICATION_REQUIRED',
  /** The authenticated actor cannot perform the operation. */
  Forbidden = 'FORBIDDEN',
  /** The requested resource does not exist. */
  NotFound = 'NOT_FOUND',
  /** The request conflicts with existing state. */
  Conflict = 'CONFLICT',
  /** The server rejected a request because of its rate limit. */
  RateLimited = 'RATE_LIMITED',
  /** A server-side failure does not establish whether a mutation committed. */
  Server = 'SERVER_ERROR',
  /** An observed HTTP failure has no more specific category. */
  Http = 'HTTP_ERROR',
  /** The command line could not be parsed. */
  Argument = 'ARGUMENT_ERROR',
  /** An exception has no trustworthy public classification. */
  Command = 'COMMAND_FAILED',
  /** One or more diagnostic checks failed. */
  Diagnostic = 'DIAGNOSTIC_FAILED',
  /** A structured operation did not fully complete. */
  Batch = 'BATCH_INCOMPLETE',
  /** An invitation invocation did not establish creation certainty. */
  Unknown = 'OUTCOME_UNKNOWN',
}

/** Optional metadata whose provenance must be established by the calling boundary. */
export interface CliErrorMetadata {
  /** An actually observed HTTP status, never one inferred from exception text. */
  readonly status?: number;
  /** A validated server-created request UUID. */
  readonly requestId?: string;
  /** Bounded non-negative whole retry seconds; reporting does not imply waiting. */
  readonly retryAfter?: number;
}

/** The complete public stderr schema; no external body, value, path or stack is allowed. */
export interface CliErrorEnvelope extends CliErrorMetadata {
  /** One closed category owned by the CLI. */
  readonly code: CliErrorCode;
  /** Fixed public prose, independent of exception messages. */
  readonly message: string;
}

/** Locally invalid new command input, with trusted, bounded human-mode diagnostics. */
export class LocalInputError extends Error {
  /** Construct a validation failure without attaching raw submitted values. */
  constructor(message = 'The command input is invalid.') {
    super(message);
    this.name = 'LocalInputError';
  }
}

/** A parser failure whose raw yargs message must not reach JSON output. */
export class CliArgumentError extends Error {
  /** Construct a parser discriminator without retaining submitted arguments. */
  constructor() {
    super('Invalid command arguments.');
    this.name = 'CliArgumentError';
  }
}

/** Public messages are deliberately independent of server and parser diagnostics. */
const messages: Readonly<Record<CliErrorCode, string>> = {
  [CliErrorCode.Validation]: 'The request failed validation.',
  [CliErrorCode.Authentication]: 'Authentication is required.',
  [CliErrorCode.Forbidden]: 'This operation is not permitted.',
  [CliErrorCode.NotFound]: 'The requested resource was not found.',
  [CliErrorCode.Conflict]: 'The request conflicts with existing state.',
  [CliErrorCode.RateLimited]: 'The request was rate limited.',
  [CliErrorCode.Server]: 'The server could not complete the request.',
  [CliErrorCode.Http]: 'The HTTP request failed.',
  [CliErrorCode.Argument]: 'Invalid command arguments.',
  [CliErrorCode.Command]: 'The command failed.',
  [CliErrorCode.Diagnostic]: 'One or more checks failed.',
  [CliErrorCode.Batch]: 'The operation did not complete successfully.',
  [CliErrorCode.Unknown]: 'The invitation outcome is unknown.',
};

/** Same request-UUID shape accepted by the SDK's safe error boundary. */
const requestUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Construct a known diagnostic/aggregate summary, copying only validated public metadata.
 * The caller must establish HTTP provenance before supplying status.
 * @example formatKnownCliError(CliErrorCode.Batch, { status: 429, retryAfter: 30 })
 */
export function formatKnownCliError(
  code: CliErrorCode,
  metadata: CliErrorMetadata = {},
): CliErrorEnvelope {
  const { status, requestId, retryAfter } = metadata;
  return {
    code,
    message: messages[code],
    ...(typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599
      ? { status }
      : {}),
    ...(typeof requestId === 'string' && requestUuid.test(requestId) ? { requestId } : {}),
    ...(typeof retryAfter === 'number' &&
    Number.isInteger(retryAfter) &&
    retryAfter >= 0 &&
    retryAfter <= 2_147_483_647
      ? { retryAfter }
      : {}),
  };
}

/**
 * Classify an opaque exception without retaining its message, body, cause or stack.
 * SDK authentication errors can be synthesized locally, so their 401 is not observed HTTP.
 * @example formatCliError(new Error('private diagnostics')) // COMMAND_FAILED, without diagnostics
 */
export function formatCliError(error: unknown): CliErrorEnvelope {
  if (error instanceof LocalInputError) {
    return { code: CliErrorCode.Validation, message: 'The command input is invalid.' };
  }
  if (error instanceof CliArgumentError) return formatKnownCliError(CliErrorCode.Argument);
  if (error instanceof PortaAuthenticationError) {
    return formatKnownCliError(CliErrorCode.Authentication);
  }
  if (!(error instanceof PortaHttpError)) return formatKnownCliError(CliErrorCode.Command);

  let code = CliErrorCode.Http;
  switch (error.status) {
    case 400:
      code = CliErrorCode.Validation;
      break;
    case 401:
      code = CliErrorCode.Authentication;
      break;
    case 403:
      code = CliErrorCode.Forbidden;
      break;
    case 404:
      code = CliErrorCode.NotFound;
      break;
    case 409:
      code = CliErrorCode.Conflict;
      break;
    case 429:
      code = CliErrorCode.RateLimited;
      break;
    default:
      if (error.status >= 500 && error.status <= 599) code = CliErrorCode.Server;
  }
  return formatKnownCliError(code, {
    status: error.status,
    ...(error instanceof PortaServerError && error.requestId ? { requestId: error.requestId } : {}),
    ...(error instanceof PortaRateLimitError && error.retryAfter !== null
      ? { retryAfter: error.retryAfter }
      : {}),
  });
}

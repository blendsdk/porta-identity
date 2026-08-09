/**
 * Tests for the Porta SDK error hierarchy.
 *
 * Verifies: class hierarchy (instanceof chains), status code mapping,
 * message extraction from various body shapes, validation details
 * extraction, Retry-After parsing, and the mapResponseToError() dispatcher.
 */
import { describe, it, expect } from 'vitest';
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
  mapResponseToError,
} from '../../src/errors/index.js';
import type { TransportResponse } from '../../src/transport/types.js';

// ── Helper to build a TransportResponse ─────────────────────────

function makeResponse(
  status: number,
  body: unknown = undefined,
  headers: Record<string, string> = {},
): TransportResponse {
  return { status, body, headers };
}

// ── PortaError ──────────────────────────────────────────────────

describe('PortaError', () => {
  it('extends Error', () => {
    const err = new PortaError('test');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(PortaError);
  });

  it('sets name and message', () => {
    const err = new PortaError('something broke');
    expect(err.name).toBe('PortaError');
    expect(err.message).toBe('something broke');
  });

  it('supports cause chaining', () => {
    const cause = new Error('root cause');
    const err = new PortaError('wrapper', { cause });
    expect(err.cause).toBe(cause);
  });
});

// ── PortaHttpError ──────────────────────────────────────────────

describe('PortaHttpError', () => {
  it('extends PortaError', () => {
    const err = new PortaHttpError(500, 'fail');
    expect(err).toBeInstanceOf(PortaError);
    expect(err).toBeInstanceOf(PortaHttpError);
  });

  it('stores status and body', () => {
    const body = { error: 'oops' };
    const err = new PortaHttpError(418, 'teapot', body);
    expect(err.status).toBe(418);
    expect(err.body).toBe(body);
    expect(err.message).toBe('teapot');
    expect(err.name).toBe('PortaHttpError');
  });

  it('body defaults to undefined', () => {
    const err = new PortaHttpError(500, 'fail');
    expect(err.body).toBeUndefined();
  });
});

// ── PortaValidationError ────────────────────────────────────────

describe('PortaValidationError', () => {
  it('extends PortaHttpError with status 400', () => {
    const err = new PortaValidationError({});
    expect(err).toBeInstanceOf(PortaHttpError);
    expect(err).toBeInstanceOf(PortaValidationError);
    expect(err.status).toBe(400);
    expect(err.name).toBe('PortaValidationError');
  });

  it('extracts message from body.error', () => {
    const err = new PortaValidationError({ error: 'Bad input' });
    expect(err.message).toBe('Bad input');
  });

  it('extracts message from body.message', () => {
    const err = new PortaValidationError({ message: 'Invalid data' });
    expect(err.message).toBe('Invalid data');
  });

  it('falls back to default message', () => {
    const err = new PortaValidationError({});
    expect(err.message).toBe('Validation failed');
  });

  it('extracts details from body.details', () => {
    const body = {
      error: 'Validation failed',
      details: [
        { path: 'name', message: 'Required', code: 'too_small' },
        { path: 'email', message: 'Invalid email' },
      ],
    };
    const err = new PortaValidationError(body);
    expect(err.details).toHaveLength(2);
    expect(err.details[0]).toEqual({ path: 'name', message: 'Required', code: 'too_small' });
    expect(err.details[1]).toEqual({ path: 'email', message: 'Invalid email' });
  });

  it('extracts details from body.errors', () => {
    const body = {
      errors: [{ path: 'slug', message: 'Already exists' }],
    };
    const err = new PortaValidationError(body);
    expect(err.details).toHaveLength(1);
    expect(err.details[0]).toEqual({ path: 'slug', message: 'Already exists' });
  });

  it('returns empty details for non-object body', () => {
    const err = new PortaValidationError(null);
    expect(err.details).toEqual([]);
  });

  it('returns empty details when no details/errors array', () => {
    const err = new PortaValidationError({ error: 'bad' });
    expect(err.details).toEqual([]);
  });

  it('handles malformed detail items gracefully', () => {
    const body = {
      details: [
        { path: 123, message: null },
        'not-an-object',
        null,
        { path: 'ok', message: 'valid' },
      ],
    };
    const err = new PortaValidationError(body);
    // Only objects are included; primitives and null are filtered
    expect(err.details).toHaveLength(2);
    expect(err.details[0].path).toBe('123');
    expect(err.details[1]).toEqual({ path: 'ok', message: 'valid' });
  });
});

// ── PortaAuthenticationError ────────────────────────────────────

describe('PortaAuthenticationError', () => {
  it('has status 401 and correct name', () => {
    const err = new PortaAuthenticationError();
    expect(err.status).toBe(401);
    expect(err.name).toBe('PortaAuthenticationError');
    expect(err).toBeInstanceOf(PortaHttpError);
  });

  it('extracts message from body', () => {
    const err = new PortaAuthenticationError({ error: 'Token expired' });
    expect(err.message).toBe('Token expired');
  });

  it('uses default message when body is empty', () => {
    const err = new PortaAuthenticationError();
    expect(err.message).toBe('Authentication required');
  });
});

// ── PortaForbiddenError ─────────────────────────────────────────

describe('PortaForbiddenError', () => {
  it('has status 403 and correct name', () => {
    const err = new PortaForbiddenError();
    expect(err.status).toBe(403);
    expect(err.name).toBe('PortaForbiddenError');
    expect(err).toBeInstanceOf(PortaHttpError);
  });

  it('extracts message from body', () => {
    const err = new PortaForbiddenError({ message: 'Insufficient role' });
    expect(err.message).toBe('Insufficient role');
  });
});

// ── PortaNotFoundError ──────────────────────────────────────────

describe('PortaNotFoundError', () => {
  it('has status 404 and correct name', () => {
    const err = new PortaNotFoundError();
    expect(err.status).toBe(404);
    expect(err.name).toBe('PortaNotFoundError');
    expect(err).toBeInstanceOf(PortaHttpError);
  });
});

// ── PortaConflictError ──────────────────────────────────────────

describe('PortaConflictError', () => {
  it('has status 409 and correct name', () => {
    const err = new PortaConflictError();
    expect(err.status).toBe(409);
    expect(err.name).toBe('PortaConflictError');
    expect(err).toBeInstanceOf(PortaHttpError);
  });

  it('extracts message from nested error.message', () => {
    const err = new PortaConflictError({ error: { message: 'ETag mismatch' } });
    expect(err.message).toBe('ETag mismatch');
  });
});

// ── PortaRateLimitError ─────────────────────────────────────────

describe('PortaRateLimitError', () => {
  it('has status 429 and correct name', () => {
    const err = new PortaRateLimitError();
    expect(err.status).toBe(429);
    expect(err.name).toBe('PortaRateLimitError');
    expect(err).toBeInstanceOf(PortaHttpError);
  });

  it('stores retryAfter value', () => {
    const err = new PortaRateLimitError(undefined, 30);
    expect(err.retryAfter).toBe(30);
  });

  it('defaults retryAfter to null', () => {
    const err = new PortaRateLimitError();
    expect(err.retryAfter).toBeNull();
  });
});

// ── PortaServerError ────────────────────────────────────────────

describe('PortaServerError', () => {
  it('stores the specific status code', () => {
    const err = new PortaServerError(502);
    expect(err.status).toBe(502);
    expect(err.name).toBe('PortaServerError');
    expect(err).toBeInstanceOf(PortaHttpError);
  });

  it('extracts message from body', () => {
    const err = new PortaServerError(500, { error: 'Internal error' });
    expect(err.message).toBe('Internal error');
  });

  it('uses default message when body is empty', () => {
    const err = new PortaServerError(503);
    expect(err.message).toBe('Server error');
  });
});

// ── mapResponseToError ──────────────────────────────────────────

describe('mapResponseToError', () => {
  it('maps 400 to PortaValidationError', () => {
    const err = mapResponseToError(makeResponse(400, { error: 'bad', details: [] }));
    expect(err).toBeInstanceOf(PortaValidationError);
    expect(err.status).toBe(400);
  });

  it('maps 401 to PortaAuthenticationError', () => {
    const err = mapResponseToError(makeResponse(401));
    expect(err).toBeInstanceOf(PortaAuthenticationError);
    expect(err.status).toBe(401);
  });

  it('maps 403 to PortaForbiddenError', () => {
    const err = mapResponseToError(makeResponse(403));
    expect(err).toBeInstanceOf(PortaForbiddenError);
    expect(err.status).toBe(403);
  });

  it('maps 404 to PortaNotFoundError', () => {
    const err = mapResponseToError(makeResponse(404));
    expect(err).toBeInstanceOf(PortaNotFoundError);
    expect(err.status).toBe(404);
  });

  it('maps 409 to PortaConflictError', () => {
    const err = mapResponseToError(makeResponse(409));
    expect(err).toBeInstanceOf(PortaConflictError);
    expect(err.status).toBe(409);
  });

  it('maps 429 to PortaRateLimitError with Retry-After', () => {
    const err = mapResponseToError(makeResponse(429, { error: 'slow down' }, { 'retry-after': '60' }));
    expect(err).toBeInstanceOf(PortaRateLimitError);
    expect((err as PortaRateLimitError).retryAfter).toBe(60);
  });

  it('maps 429 without Retry-After header', () => {
    const err = mapResponseToError(makeResponse(429));
    expect(err).toBeInstanceOf(PortaRateLimitError);
    expect((err as PortaRateLimitError).retryAfter).toBeNull();
  });

  it('maps 429 with non-numeric Retry-After to null', () => {
    const err = mapResponseToError(makeResponse(429, undefined, { 'retry-after': 'invalid' }));
    expect(err).toBeInstanceOf(PortaRateLimitError);
    expect((err as PortaRateLimitError).retryAfter).toBeNull();
  });

  it('maps 500 to PortaServerError', () => {
    const err = mapResponseToError(makeResponse(500));
    expect(err).toBeInstanceOf(PortaServerError);
    expect(err.status).toBe(500);
  });

  it('maps 502 to PortaServerError', () => {
    const err = mapResponseToError(makeResponse(502));
    expect(err).toBeInstanceOf(PortaServerError);
    expect(err.status).toBe(502);
  });

  it('maps 503 to PortaServerError', () => {
    const err = mapResponseToError(makeResponse(503));
    expect(err).toBeInstanceOf(PortaServerError);
    expect(err.status).toBe(503);
  });

  it('maps unknown 4xx to generic PortaHttpError', () => {
    const err = mapResponseToError(makeResponse(422, { message: 'Unprocessable' }));
    expect(err).toBeInstanceOf(PortaHttpError);
    // Should NOT be a more specific subclass
    expect(err).not.toBeInstanceOf(PortaValidationError);
    expect(err).not.toBeInstanceOf(PortaServerError);
    expect(err.status).toBe(422);
    expect(err.message).toBe('Unprocessable');
  });

  it('maps unknown 4xx without body message to HTTP status fallback', () => {
    const err = mapResponseToError(makeResponse(418));
    expect(err.message).toBe('HTTP 418');
  });

  // ── instanceof chain verification ──

  it('all errors are instanceof PortaError', () => {
    const errors = [
      mapResponseToError(makeResponse(400, {})),
      mapResponseToError(makeResponse(401)),
      mapResponseToError(makeResponse(403)),
      mapResponseToError(makeResponse(404)),
      mapResponseToError(makeResponse(409)),
      mapResponseToError(makeResponse(429)),
      mapResponseToError(makeResponse(500)),
      mapResponseToError(makeResponse(422)),
    ];

    for (const err of errors) {
      expect(err).toBeInstanceOf(PortaError);
      expect(err).toBeInstanceOf(PortaHttpError);
      expect(err).toBeInstanceOf(Error);
    }
  });
});

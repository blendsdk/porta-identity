/** Each unique recipient gets one sequential SDK attempt, with conservative outcome certainty. */
import {
  PortaAuthenticationError, PortaConflictError, PortaForbiddenError, PortaHttpError,
  PortaNotFoundError, PortaRateLimitError, PortaServerError, PortaValidationError,
} from '@portaidentity/sdk';
import type { InviteUserInput, InviteUserResult } from '@portaidentity/sdk';
import { describe, expect, it, vi } from 'vitest';
import { getBulkInviteExitCode, runBulkInvitations } from '../src/bulk-invite.js';

const org = '11111111-1111-4111-8111-111111111111';
const requestId = '22222222-2222-4222-8222-222222222222';
const marker = 'SENSITIVE_MARKER';
const prepared = {
  inputRecords: 3, duplicates: 1,
  recipients: ['Alice@example.com', 'bob@example.com'].map((email, index) => ({
    line: index === 0 ? 1 : 4, email, input: { organizationId: org, email },
  })),
};
const unknown = { code: 'OUTCOME_UNKNOWN', message: 'The invitation outcome is unknown.' };

/** Malformed acknowledgements have no promised classifier, but every diagnostic stays closed and fixed. */
const safeReasons = [
  ['VALIDATION_ERROR', 'The request failed validation.'], ['VALIDATION_ERROR', 'The command input is invalid.'],
  ['AUTHENTICATION_REQUIRED', 'Authentication is required.'], ['FORBIDDEN', 'This operation is not permitted.'],
  ['NOT_FOUND', 'The requested resource was not found.'], ['CONFLICT', 'The request conflicts with existing state.'],
  ['RATE_LIMITED', 'The request was rate limited.'], ['SERVER_ERROR', 'The server could not complete the request.'],
  ['HTTP_ERROR', 'The HTTP request failed.'], ['ARGUMENT_ERROR', 'Invalid command arguments.'],
  ['COMMAND_FAILED', 'The command failed.'], ['DIAGNOSTIC_FAILED', 'One or more checks failed.'],
  ['BATCH_INCOMPLETE', 'The operation did not complete successfully.'],
  ['OUTCOME_UNKNOWN', 'The invitation outcome is unknown.'],
].map(([code, message]) => ({ code, message }));

/** Build only public acknowledged fields; the caller chooses the recipient whose result it is. */
function acknowledged(input: InviteUserInput): InviteUserResult {
  return {
    invitationId: '33333333-3333-4333-8333-333333333333', email: input.email,
    invitationSent: true, emailDelivery: 'sent', expiresAt: '2026-12-01T12:00:00.000Z',
  };
}

/** Stop assertions distinguish a known rejection from a possibly committed invitation. */
async function expectStopped(error: Error, reason: object, outcome: 'rejected' | 'unknown', exit: number) {
  const invite = vi.fn<(input: InviteUserInput) => Promise<InviteUserResult>>().mockRejectedValue(error);
  const report = await runBulkInvitations(prepared, invite);
  const rowError = outcome === 'unknown'
    ? { ...unknown, ...('status' in reason ? { status: reason.status } : {}),
      ...('requestId' in reason ? { requestId: reason.requestId } : {}) }
    : reason;
  expect(report).toStrictEqual({
    summary: {
      inputRecords: 3, uniqueRecipients: 2, duplicates: 1, attempted: 1,
      created: 0, sent: 0, deliveryFailed: 0, deliveryUnknown: 0,
      rejected: outcome === 'rejected' ? 1 : 0, unknown: outcome === 'unknown' ? 1 : 0, unattempted: 1,
    },
    results: [
      { line: 1, email: 'Alice@example.com', outcome, error: rowError },
      { line: 4, email: 'bob@example.com', outcome: 'unattempted' },
    ],
    stopReason: reason,
  });
  expect(invite).toHaveBeenCalledExactlyOnceWith(prepared.recipients[0]!.input);
  expect(getBulkInviteExitCode(report)).toBe(exit);
  expect(JSON.stringify(report)).not.toContain(marker);
}

describe('sequential SDK ownership', () => {
  it('should await the first SDK promise before starting the next recipient', async () => {
    let release: (value: InviteUserResult) => void = () => { throw new Error('Promise not initialized'); };
    const first = new Promise<InviteUserResult>((resolve) => { release = resolve; });
    let active = 0;
    let maximum = 0;
    const invite = vi.fn(async (input: InviteUserInput) => {
      active += 1;
      maximum = Math.max(maximum, active);
      try { return input.email === 'Alice@example.com' ? await first : acknowledged(input); }
      finally { active -= 1; }
    });
    const snapshot = structuredClone(prepared);
    const pending = runBulkInvitations(prepared, invite);
    try {
      await Promise.resolve();
      expect(invite).toHaveBeenCalledExactlyOnceWith(prepared.recipients[0]!.input);
    } finally {
      release(acknowledged(prepared.recipients[0]!.input));
    }
    const report = await pending;
    expect(invite.mock.calls.map(([input]) => input.email)).toStrictEqual(['Alice@example.com', 'bob@example.com']);
    expect(invite.mock.calls[0]?.[0]).toBe(prepared.recipients[0]!.input);
    expect(invite.mock.calls[1]?.[0]).toBe(prepared.recipients[1]!.input);
    expect(maximum).toBe(1);
    expect(report.summary.attempted).toBe(2);
    expect(getBulkInviteExitCode(report)).toBe(0);
    expect(prepared).toStrictEqual(snapshot);
  });

  it('should continue after conflict without claiming why the conflict occurred', async () => {
    const invite = vi.fn<(input: InviteUserInput) => Promise<InviteUserResult>>()
      .mockRejectedValueOnce(new PortaConflictError({ error: marker, existingAccount: true }))
      .mockImplementation(async (input) => acknowledged(input));
    const report = await runBulkInvitations(prepared, invite);
    expect(report).toStrictEqual({
      summary: {
        inputRecords: 3, uniqueRecipients: 2, duplicates: 1, attempted: 2,
        created: 1, sent: 1, deliveryFailed: 0, deliveryUnknown: 0, rejected: 1, unknown: 0, unattempted: 0,
      },
      results: [
        { line: 1, email: 'Alice@example.com', outcome: 'rejected',
          error: { code: 'CONFLICT', message: 'The request conflicts with existing state.', status: 409 } },
        { line: 4, email: 'bob@example.com', outcome: 'created', invitation: acknowledged(prepared.recipients[1]!.input) },
      ],
      stopReason: null,
    });
    expect(invite.mock.calls.map(([input]) => input.email)).toStrictEqual(['Alice@example.com', 'bob@example.com']);
    expect(getBulkInviteExitCode(report)).toBe(1);
  });

  it('should call the SDK again on a separate normal run without a persistent skip cache', async () => {
    const invite = vi.fn(async (input: InviteUserInput) => acknowledged(input));
    const first = await runBulkInvitations(prepared, invite);
    const second = await runBulkInvitations(prepared, invite);
    expect(second).toStrictEqual(first);
    expect(invite.mock.calls.map(([input]) => input.email)).toStrictEqual([
      'Alice@example.com', 'bob@example.com', 'Alice@example.com', 'bob@example.com',
    ]);
  });
});

describe('terminal SDK failures', () => {
  it.each([
    [new PortaValidationError({ error: marker }), 'VALIDATION_ERROR', 'The request failed validation.', 400],
    [new PortaNotFoundError({ error: marker }), 'NOT_FOUND', 'The requested resource was not found.', 404],
    [new PortaHttpError(418, marker), 'HTTP_ERROR', 'The HTTP request failed.', 418],
  ] as const)('should stop after typed %s without treating the failure as recipient-local', async (error, code, message, status) => {
    await expectStopped(error, { code, message, status }, 'rejected', 1);
  });

  it('should retain bounded rate metadata and stop without waiting or retrying', async () => {
    await expectStopped(new PortaRateLimitError({ error: marker }, 30), {
      code: 'RATE_LIMITED', message: 'The request was rate limited.', status: 429, retryAfter: 30,
    }, 'rejected', 1);
  });

  it('should treat an opaque authentication failure after invocation as unknown without status', async () => {
    await expectStopped(new PortaAuthenticationError({ error: `${marker} status 401` }), {
      code: 'AUTHENTICATION_REQUIRED', message: 'Authentication is required.',
    }, 'unknown', 2);
  });

  it('should treat an actual forbidden response as rejected with authentication exit precedence', async () => {
    await expectStopped(new PortaForbiddenError({ error: marker }), {
      code: 'FORBIDDEN', message: 'This operation is not permitted.', status: 403,
    }, 'rejected', 2);
  });

  it('should not replay a server failure even when the external fixture has already committed', async () => {
    let committed = 0;
    const invite = vi.fn(async () => {
      committed += 1;
      throw new PortaServerError(503, { error: marker, request_id: requestId, retryAfter: 30 });
    });
    const report = await runBulkInvitations(prepared, invite);
    expect(report.results).toStrictEqual([
      { line: 1, email: 'Alice@example.com', outcome: 'unknown', error: { ...unknown, status: 503, requestId } },
      { line: 4, email: 'bob@example.com', outcome: 'unattempted' },
    ]);
    expect(report.stopReason).toStrictEqual({
      code: 'SERVER_ERROR', message: 'The server could not complete the request.', status: 503, requestId,
    });
    expect(report.summary).toMatchObject({ attempted: 1, created: 0, rejected: 0, unknown: 1, unattempted: 1 });
    expect(committed).toBe(1);
    expect(invite).toHaveBeenCalledOnce();
    expect(getBulkInviteExitCode(report)).toBe(1);
    expect(JSON.stringify(report)).not.toContain(marker);
  });

  it('should omit fabricated HTTP metadata for a network or ordinary exception', async () => {
    await expectStopped(new TypeError(`${marker}: HTTP 503`), {
      code: 'COMMAND_FAILED', message: 'The command failed.',
    }, 'unknown', 1);
  });

  it('should give a final authorization stop priority over an earlier conflict', async () => {
    const third = { line: 5, email: 'third@example.com', input: { organizationId: org, email: 'third@example.com' } };
    const invite = vi.fn<(input: InviteUserInput) => Promise<InviteUserResult>>()
      .mockRejectedValueOnce(new PortaConflictError()).mockRejectedValueOnce(new PortaForbiddenError());
    const report = await runBulkInvitations({ ...prepared, inputRecords: 4, recipients: [...prepared.recipients, third] }, invite);
    expect(report.summary).toStrictEqual({
      inputRecords: 4, uniqueRecipients: 3, duplicates: 1, attempted: 2,
      created: 0, sent: 0, deliveryFailed: 0, deliveryUnknown: 0, rejected: 2, unknown: 0, unattempted: 1,
    });
    expect(report.results.map((row) => row.outcome)).toStrictEqual(['rejected', 'rejected', 'unattempted']);
    expect(invite).toHaveBeenCalledTimes(2);
    expect(getBulkInviteExitCode(report)).toBe(2);
  });
});

describe('acknowledgement validation', () => {
  it.each([
    ['invitationId', 'not-a-uuid'], ['email', 'other@example.com'], ['email', ''],
    ['invitationSent', 'true'], ['emailDelivery', 'queued'], ['expiresAt', 'invalid'],
    ['expiresAt', Infinity], ['invitationSent', false], ['emailDelivery', 'failed'],
  ])('should stop with unknown certainty for malformed %s=%j', async (field, value) => {
    const response = acknowledged(prepared.recipients[0]!.input);
    Reflect.set(response, field, value);
    const invite = vi.fn<(input: InviteUserInput) => Promise<InviteUserResult>>().mockResolvedValue(response);
    const report = await runBulkInvitations(prepared, invite);
    expect(report.results).toStrictEqual([
      { line: 1, email: 'Alice@example.com', outcome: 'unknown', error: unknown },
      { line: 4, email: 'bob@example.com', outcome: 'unattempted' },
    ]);
    expect(safeReasons).toContainEqual(report.stopReason);
    expect(Object.keys(report.stopReason ?? {}).sort()).toStrictEqual(['code', 'message']);
    expect(report.summary).toMatchObject({ attempted: 1, created: 0, unknown: 1, unattempted: 1 });
    expect(invite).toHaveBeenCalledOnce();
    expect(getBulkInviteExitCode(report)).toBe(1);
  });

  it.each(['invitationId', 'email', 'invitationSent', 'emailDelivery', 'expiresAt'])
    ('should not conceal an absent %s behind a default creation value', async (field) => {
      const response = acknowledged(prepared.recipients[0]!.input);
      Reflect.deleteProperty(response, field);
      const invite = vi.fn<(input: InviteUserInput) => Promise<InviteUserResult>>().mockResolvedValue(response);
      const report = await runBulkInvitations(prepared, invite);
      expect(report.results).toStrictEqual([
        { line: 1, email: 'Alice@example.com', outcome: 'unknown', error: unknown },
        { line: 4, email: 'bob@example.com', outcome: 'unattempted' },
      ]);
      expect(safeReasons).toContainEqual(report.stopReason);
      expect(report.summary).toMatchObject({ attempted: 1, created: 0, unknown: 1, unattempted: 1 });
      expect(invite).toHaveBeenCalledOnce();
      expect(getBulkInviteExitCode(report)).toBe(1);
    });

  it('should accept acknowledgement email case differences', async () => {
    const invite = vi.fn(async (input: InviteUserInput) => ({ ...acknowledged(input), email: input.email.toUpperCase() }));
    const report = await runBulkInvitations(prepared, invite);
    expect(report.summary.created).toBe(2);
    expect(getBulkInviteExitCode(report)).toBe(0);
  });
});

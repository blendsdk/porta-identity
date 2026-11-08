/** Direct sequential invitation dispatch, preserving creation and delivery uncertainty. */
import { PortaAuthenticationError, PortaHttpError } from '@portaidentity/sdk';
import type { InviteUserInput, InviteUserResult } from '@portaidentity/sdk';
import { CliErrorCode, formatCliError, formatKnownCliError } from './error-format.js';
import type { CliErrorEnvelope } from './error-format.js';
import { isBulkInvitationEmail } from './bulk-invite-input.js';
import type { BulkRecipient, PreparedBulkInvitations } from './bulk-invite-input.js';

/** Closed report outcomes; creation certainty is independent of email delivery. */
export enum BulkInviteOutcome {
  /** The server acknowledged a valid invitation record. */
  Created = 'created',
  /** An observed client-error response establishes rejection. */
  Rejected = 'rejected',
  /** Dispatch began but no reliable creation acknowledgement exists. */
  Unknown = 'unknown',
  /** No SDK invitation method was invoked for this recipient. */
  Unattempted = 'unattempted',
}

/** One source recipient and only the fields appropriate to its outcome. */
export type BulkInviteResult =
  | (BulkRecipient & {
      /** Acknowledged creation. */
      readonly outcome: BulkInviteOutcome.Created;
      /** Only the existing public invitation fields. */
      readonly invitation: InviteUserResult;
    })
  | (BulkRecipient & {
      /** Rejection or uncertain creation. */
      readonly outcome: BulkInviteOutcome.Rejected | BulkInviteOutcome.Unknown;
      /** Closed safe diagnostic, never an external exception. */
      readonly error: CliErrorEnvelope;
    })
  | (BulkRecipient & {
      /** The loop stopped before this method invocation. */
      readonly outcome: BulkInviteOutcome.Unattempted;
    });

/** Counts derived from source identity and outcome rows, not independently incremented state. */
export interface BulkInviteSummary {
  /** Nonblank valid source lines, including duplicates. */
  readonly inputRecords: number;
  /** Distinct case-insensitive recipients. */
  readonly uniqueRecipients: number;
  /** Repeated source addresses collapsed before dispatch. */
  readonly duplicates: number;
  /** SDK method invocations, not proven HTTP dispatches. */
  readonly attempted: number;
  /** Valid acknowledged invitations, regardless of delivery state. */
  readonly created: number;
  /** Created invitations whose transport accepted delivery. */
  readonly sent: number;
  /** Created invitations with failed email delivery. */
  readonly deliveryFailed: number;
  /** Created invitations with unreported delivery certainty. */
  readonly deliveryUnknown: number;
  /** Recipients with observed rejection responses. */
  readonly rejected: number;
  /** SDK attempts without reliable creation certainty. */
  readonly unknown: number;
  /** Recipients for which no SDK method was invoked. */
  readonly unattempted: number;
}

/** Complete in-memory normal-run report; no persistence or resume guarantee is implied. */
export interface BulkInviteReport {
  /** Outcome-derived counters satisfying the report invariants. */
  readonly summary: BulkInviteSummary;
  /** One row per unique recipient in source order. */
  readonly results: readonly BulkInviteResult[];
  /** A safe terminal cause, or null when all eligible calls were completed. */
  readonly stopReason: CliErrorEnvelope | null;
}

/** Existing public SDK method shape; the loop does not construct clients or manage refresh. */
export type InviteBulkRecipient = (input: InviteUserInput) => Promise<InviteUserResult>;

/** UUID shape used for invitation acknowledgement validation. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validate acknowledgement identity, expiry and delivery consistency without inventing defaults. */
function isAcknowledged(value: unknown, email: string): value is InviteUserResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    'invitationId' in value &&
    typeof value.invitationId === 'string' &&
    UUID.test(value.invitationId) &&
    'email' in value &&
    typeof value.email === 'string' &&
    isBulkInvitationEmail(value.email) &&
    value.email.toLowerCase() === email.toLowerCase() &&
    'invitationSent' in value &&
    typeof value.invitationSent === 'boolean' &&
    'emailDelivery' in value &&
    (value.emailDelivery === 'sent' ||
      value.emailDelivery === 'failed' ||
      value.emailDelivery === 'unknown') &&
    value.invitationSent === (value.emailDelivery === 'sent') &&
    'expiresAt' in value &&
    typeof value.expiresAt === 'string' &&
    Number.isFinite(Date.parse(value.expiresAt))
  );
}

/** Build counters from the final rows, so partial stops cannot drift from the result schema. */
function createReport(
  prepared: PreparedBulkInvitations,
  results: BulkInviteResult[],
  stopReason: CliErrorEnvelope | null,
): BulkInviteReport {
  const count = (outcome: BulkInviteOutcome): number =>
    results.filter((row) => row.outcome === outcome).length;
  const created = results.filter((row) => row.outcome === BulkInviteOutcome.Created);
  const unattempted = count(BulkInviteOutcome.Unattempted);
  return {
    summary: {
      inputRecords: prepared.inputRecords,
      uniqueRecipients: prepared.recipients.length,
      duplicates: prepared.duplicates,
      attempted: results.length - unattempted,
      created: created.length,
      sent: created.filter((row) => row.invitation.emailDelivery === 'sent').length,
      deliveryFailed: created.filter((row) => row.invitation.emailDelivery === 'failed').length,
      deliveryUnknown: created.filter((row) => row.invitation.emailDelivery === 'unknown').length,
      rejected: count(BulkInviteOutcome.Rejected),
      unknown: count(BulkInviteOutcome.Unknown),
      unattempted,
    },
    results,
    stopReason,
  };
}

/**
 * Report client-construction failure without claiming an invitation method or mutation occurred.
 * @param prepared - Every validated request, still unattempted
 * @param error - Opaque construction failure, classified without its raw text
 * @returns An all-unattempted report with a safe terminal reason
 * @example createUnattemptedBulkReport(prepared, new Error('private diagnostics'))
 */
export function createUnattemptedBulkReport(
  prepared: PreparedBulkInvitations,
  error: unknown,
): BulkInviteReport {
  return createReport(
    prepared,
    prepared.recipients.map(({ line, email }) => ({
      line,
      email,
      outcome: BulkInviteOutcome.Unattempted,
    })),
    formatCliError(error),
  );
}

/**
 * Await exactly one SDK invocation per unique recipient; never retry, wait or replay at CLI level.
 * Authentication exceptions are opaque even when they arose before the SDK's HTTP dispatch.
 * A 5xx or malformed success can follow a committed invitation, so it must remain unknown.
 * @param prepared - All locally checked and encodable requests
 * @param invite - Existing SDK invitation method; its own authentication recovery is unchanged
 * @returns One ordered report, including unattempted rows after a terminal failure
 * @example await runBulkInvitations(prepared, client.users.invite)
 */
export async function runBulkInvitations(
  prepared: PreparedBulkInvitations,
  invite: InviteBulkRecipient,
): Promise<BulkInviteReport> {
  const results: BulkInviteResult[] = [];
  let stopReason: CliErrorEnvelope | null = null;
  for (const { line, email, input } of prepared.recipients) {
    if (stopReason) {
      results.push({ line, email, outcome: BulkInviteOutcome.Unattempted });
      continue;
    }
    try {
      const result = await invite(input);
      if (!isAcknowledged(result, email)) {
        stopReason = formatKnownCliError(CliErrorCode.Unknown);
        results.push({ line, email, outcome: BulkInviteOutcome.Unknown, error: stopReason });
        continue;
      }
      // Copy only current public fields; external extension properties cannot become report data.
      const invitation: InviteUserResult = {
        invitationId: result.invitationId,
        email: result.email,
        invitationSent: result.invitationSent,
        emailDelivery: result.emailDelivery,
        expiresAt: result.expiresAt,
      };
      results.push({ line, email, outcome: BulkInviteOutcome.Created, invitation });
    } catch (error) {
      const classified = formatCliError(error);
      const rejected =
        error instanceof PortaHttpError &&
        !(error instanceof PortaAuthenticationError) &&
        error.status >= 400 &&
        error.status < 500;
      results.push({
        line,
        email,
        outcome: rejected ? BulkInviteOutcome.Rejected : BulkInviteOutcome.Unknown,
        error: rejected
          ? classified
          : formatKnownCliError(CliErrorCode.Unknown, {
              status: classified.status,
              requestId: classified.requestId,
            }),
      });
      if (!rejected || classified.code !== CliErrorCode.Conflict) stopReason = classified;
    }
  }
  return createReport(prepared, results, stopReason);
}

/**
 * Derive normal-run exit status after building the report; an authentication stop has priority.
 * Local preflight errors are handled separately before a report exists.
 * @param report - Complete ordered normal-run report
 * @returns 0 only for all created/sent, 2 for authentication/authorization stop, otherwise 1
 * @example getBulkInviteExitCode(report)
 */
export function getBulkInviteExitCode(report: BulkInviteReport): 0 | 1 | 2 {
  if (
    report.stopReason?.code === CliErrorCode.Authentication ||
    report.stopReason?.code === CliErrorCode.Forbidden
  )
    return 2;
  return report.summary.created === report.summary.uniqueRecipients &&
    report.summary.sent === report.summary.created
    ? 0
    : 1;
}

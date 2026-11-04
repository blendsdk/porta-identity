/** Conventional email-file invitation command; preparation precedes client construction. */
import type { CommandModule } from 'yargs';
import type { GlobalOptions } from '../global-options.js';
import { createClient } from '../client-factory.js';
import { readBulkRecipients, prepareBulkInvitations } from '../bulk-invite-input.js';
import type { BulkInvitationOptions, PreparedBulkInvitations } from '../bulk-invite-input.js';
import {
  createUnattemptedBulkReport,
  getBulkInviteExitCode,
  runBulkInvitations,
  BulkInviteOutcome,
} from '../bulk-invite.js';
import type { BulkInviteReport, InviteBulkRecipient } from '../bulk-invite.js';
import {
  CliErrorCode,
  formatCliError,
  formatKnownCliError,
  LocalInputError,
} from '../error-format.js';
import { EXIT_VALIDATION_ERROR, writeJsonError } from '../error-handler.js';
import { error as printError, printJson, printTable, sanitizeTerminalText } from '../output.js';

/** Required local file plus existing global and shared invitation flags. */
interface BulkInviteArgs extends GlobalOptions, BulkInvitationOptions {
  /** Literal filename, never interpreted as a shell command. */
  file: string;
}

/** Emit one complete report and select its normal-run exit without terminating inside yargs. */
function finish(report: BulkInviteReport, json: boolean): void {
  const exit = getBulkInviteExitCode(report);
  if (json) {
    printJson(report);
    if (exit !== 0)
      writeJsonError(formatKnownCliError(CliErrorCode.Batch, report.stopReason ?? {}));
  } else {
    console.log(['Line', 'Email', 'Outcome', 'Email delivery'].join('\t'));
    for (const row of report.results) {
      // Never pad every recipient to the longest address: valid input may contain a very long
      // address. Unpadded rows retain complete values with output proportional to input bytes.
      const cells = [
        String(row.line),
        row.email,
        row.outcome,
        row.outcome === BulkInviteOutcome.Created ? row.invitation.emailDelivery : '—',
      ];
      console.log(cells.map(sanitizeTerminalText).join('\t'));
    }
    printTable(
      ['Count', 'Value'],
      Object.entries(report.summary).map(([name, value]) => [name, String(value)]),
    );
    if (report.stopReason) printError(report.stopReason.message);
  }
  process.exitCode = exit;
}

/** Validate everything locally, then construct one client and hand dispatch to the direct loop. */
async function inviteFromFile(argv: BulkInviteArgs): Promise<void> {
  let prepared: PreparedBulkInvitations;
  try {
    prepared = prepareBulkInvitations(await readBulkRecipients(argv.file), argv);
  } catch (error) {
    // Only bounded local prose is permitted even if a filesystem boundary fails unexpectedly.
    const local =
      error instanceof LocalInputError
        ? error
        : new LocalInputError('The bulk invitation input is invalid.');
    if (argv.json) writeJsonError(formatCliError(local));
    else printError(local.message);
    process.exitCode = EXIT_VALIDATION_ERROR;
    return;
  }
  let invite: InviteBulkRecipient;
  try {
    invite = createClient(argv).users.invite;
  } catch (error) {
    finish(createUnattemptedBulkReport(prepared, error), argv.json);
    return;
  }
  // Do not catch this together with construction: a dispatched failure is never unattempted.
  finish(await runBulkInvitations(prepared, invite), argv.json);
}

/**
 * Invite unique addresses from a bounded UTF-8 email file with no prompt, CLI retry or waiting.
 * @example porta bulk invite --file ./recipients.txt --org <organization-id> --json
 */
export const bulkInviteCommand: CommandModule<GlobalOptions, BulkInviteArgs> = {
  command: 'invite',
  describe: 'Invite addresses from a UTF-8 email file sequentially',
  builder: (yargs) =>
    yargs
      .option('file', {
        type: 'string',
        demandOption: true,
        description: 'UTF-8 file: one email per line; at most 1 MiB and 1,000 unique recipients',
      })
      .option('org', { type: 'string', demandOption: true, description: 'Organization UUID' })
      .option('role', {
        type: 'string',
        array: true,
        description: 'Role as <application-id>:<role-id>; repeat for more roles',
      })
      .option('claim', {
        type: 'string',
        array: true,
        requiresArg: true,
        description:
          'Claim as <application-id>:<claim-definition-id>:<json>; quote each value and repeat for more claims',
      })
      .option('locale', {
        type: 'string',
        description: 'Invitation locale (at most 10 characters)',
      })
      .option('personal-message', {
        type: 'string',
        description: 'Personal invitation message (at most 500 characters)',
      }),
  handler: inviteFromFile,
};

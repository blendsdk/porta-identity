# Bulk Email-File Invitations

> **Document**: 03-03-bulk-invitations.md
> **Parent**: [Index](00-index.md)
> **Authority**: AR-3/6/12/15/17 · requirements R5–R10

## Command

```text
porta bulk invite --file ./recipients.txt --org <organization-id> \
  --role <application-id>:<role-id> --locale nl --personal-message "Welcome"
```

Register `invite` alongside existing `bulk execute`, through focused
`src/commands/bulk-invite.ts`. Require `--file` and existing-style `--org`; support repeated roles
and claims plus locale/personal-message. No email/name/per-recipient settings, new concurrency
flag or confirmation prompt. Global JSON/server/verbose/insecure flags retain their existing
meaning. Use current CLI authentication and public `client.users.invite`; bundle C is not needed.

## Input bounds

`src/bulk-invite-input.ts` owns `readBulkRecipients(path)` and pure parsing/shared-input helpers.
Resolve the supplied local path without shell execution; open a regular readable file and close
the descriptor in finally. Reject directories, pipes/devices, unreadable files and invalid UTF-8
with bounded local errors, never paths or file contents in JSON errors. An explicit local file
path is not a server-side upload or a new filesystem authority.

On platforms providing O_NONBLOCK, open read-only with that flag, then immediately fstat the
owned descriptor and reject anything that is not a regular file before reading. A path precheck
may reject ordinary non-regular inputs earlier, but does not replace descriptor validation or
close the check/open race. Nonblocking open prevents a no-writer FIFO from hanging before fstat.
Qualify the platform's actual flag/open behaviour; do not claim POSIX flags give guarantees on
unsupported platforms. Keep this a focused file-reader mechanism, not a filesystem framework
(PF-003).

Enforce at most1,048,576 raw bytes during the actual descriptor read; a preceding stat alone
does not suffice. Decode UTF-8 strictly. Remove one leading U+FEFF, accept LF/CRLF, split into
physical source lines, trim surrounding whitespace and ignore empty lines. An interior BOM or
bare internal carriage return is not an address delimiter and fails lexical validation.

Validate every nonblank address using a local code-owned guard matching the installed server's
current Zod email grammar, without a runtime Zod dependency:

```text
^(?:[A-Za-z0-9_'+\-]+\.)*[A-Za-z0-9_'+\-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$
```

This approved workflow accepts ordinary ASCII email spelling, not a new internationalized-email
policy. Lowercase the full ASCII spelling for the duplicate key, but retain the first trimmed
email and its1-based physical line for the SDK and result. Do not merge different addresses or
drop plus tags. Count repeated nonblank valid lines as duplicates, not additional recipients.
Reject no unique recipients or more than1,000 unique recipients. Exactly either limit is valid.

Complete byte/encoding/line/address checks and shared organization UUID, role/claim syntax,
locale length≤10, and message length≤500 checks before creating a client or sending invitations.
Locale trimming/empty omission follows the single-invite convention. Server ownership, accepted
locale resolution and permission checks remain authoritative; local validation promises no
atomic server preflight or multi-recipient transaction. Any local preflight failure exits3,
produces no recipient report and performs zero SDK calls.

Require a value per claim occurrence and validate runtime element types as specified in03-02.
Before createClient, construct every complete plain invitation request and qualify its ordinary
JSON.stringify encodability, including all shared fields and recipient-specific wrapper nesting.
Discard encoded strings and dispatch the same prepared request objects. Encoding failure is a
bounded local validation error/exit3 with zero SDK invocations, not an unknown recipient outcome.
Use an explicit worklist for finite-number validation. No fixed depth policy, persistent encoded
copy or replacement SDK serializer is introduced (PF-005/006).

## Dispatch

`src/bulk-invite.ts` owns a direct sequential loop over immutable prepared recipients and shared
input. Its narrow dependency is an invitation function matching the current public SDK method.
The command passes `client.users.invite`; tests inject a true external boundary. One invocation
per unique recipient is awaited before the next starts, preserving source order. Do not inspect
or alter SDK refresh logic or retry a dispatched invitation at CLI level.

| Observation for current recipient                                                                      | Result                                                                     | Next action                        |
| ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- | ---------------------------------- |
| Valid acknowledged creation, delivery sent/failed/unknown                                              | created, with exact delivery state                                         | Continue; never resend             |
| Typed409                                                                                               | rejected with CONFLICT; do not infer existing-account versus race          | Continue                           |
| PortaAuthenticationError after invoking users.invite, including final401 or lazy local/refresh failure | unknown creation; no unproven status; stopReason AUTHENTICATION_REQUIRED   | Stop; remaining unattempted; exit2 |
| Typed403 from the invitation response                                                                  | rejected; safe error metadata                                              | Stop; remaining unattempted; exit2 |
| Typed other4xx, including400/404/429                                                                   | rejected; safe error metadata                                              | Stop; remaining unattempted        |
| Typed5xx                                                                                               | unknown creation, with known status and fixed SERVER_ERROR classification  | Stop; remaining unattempted        |
| Dispatched request throws non-HTTP error / malformed success                                           | unknown creation, no fabricated status                                     | Stop; remaining unattempted        |
| Client construction fails before invoking users.invite                                                 | Current first recipient and all others unattempted; classified stop reason | Stop; no mutation claimed          |

Authentication is lazy inside the existing SDK call. A caught SDK authentication exception does
not reliably tell the runner whether an invitation HTTP request ran. Do not label that row a
known rejection or read an error message to determine dispatch. Conservative unknown plus an
authentication stop follows AR-17 without claiming a mutation happened. Even when a test fixture
knows the auth provider made zero invitation requests, the public runner cannot infer that fact
from the overloaded class. No transport instrumentation or SDK contract expansion is authorized.

The runner validates an acknowledged result's public fields before calling it created: UUID
invitationId, nonempty valid email matching the recipient ignoring ASCII case, Boolean
invitationSent, exact delivery enum, finite parseable expiry, and invitationSent consistent with
delivery===sent. Do not use malformed data as proof that no invitation was committed. No server
request ID or email error text may become a new arbitrary output field.

## Result schema

`BulkInviteReport` has exactly `summary`, `results` and `stopReason`. `stopReason` is either null
or a03-01 safe envelope. Each result has `line`, `email` and `outcome`:

| Outcome     | Additional fields                                                                                |
| ----------- | ------------------------------------------------------------------------------------------------ |
| created     | `invitation` containing the current `InviteUserResult` only                                      |
| rejected    | `error` containing a03-01 safe envelope                                                          |
| unknown     | `error` containing OUTCOME_UNKNOWN, actual HTTP status if known and a safe requestId if supplied |
| unattempted | No invitation or error; report-level stopReason explains it                                      |

The summary contains integer counts `inputRecords`, `uniqueRecipients`, `duplicates`, `attempted`,
`created`, `sent`, `deliveryFailed`, `deliveryUnknown`, `rejected`, `unknown`, `unattempted`.
`inputRecords=uniqueRecipients+duplicates`; `uniqueRecipients=created+rejected+unknown+unattempted`;
`created=sent+deliveryFailed+deliveryUnknown`; `attempted=created+rejected+unknown`. SDK-internal
authentication recovery does not increment attempted. `attempted` means SDK method invocations,
not proved HTTP dispatches: a lazy authentication failure after invoking the method contributes
one attempt and one unknown row. These counts are derived from outcomes,
not separately incremented in ways that can drift. No zero/default values conceal missing data.

In JSON mode write one final report to stdout. If nonzero, write one BATCH_INCOMPLETE envelope on
stderr, carrying only safe HTTP/request/retry metadata from stopReason when available. Human mode
prints an ordered line/email/outcome table, delivery distinctions, counts and bounded stop text
through the existing sanitizing output helpers. Never print claims, tokens, raw exception text
or input-file paths in the report. Duplicate rows do not get a second invitation/result entry.

Recipient rows use a command-local unpadded delimiter table, sanitizing each cell before adding
delimiters. This preserves full addresses without multiplying the longest address width across
every row. Existing count-table and safe stop-text helpers remain unchanged. There is no new
input acceptance limit or rendering configuration (runtime AR-18).

## Exit policy

Evaluate after the complete normal report is built.0 requires every unique recipient created
with delivery sent.2 takes precedence for a final authentication/authorization stop, including
a client-construction authentication failure. Any other dispatched rejected/unknown/unattempted
or failed/unknown delivery yields1. Preflight invalid input uses3 before any report/request.
This new-command policy does not alter existing command exits in03-01.

## Internal test seams

These names expose the direct preparation/loop boundaries to independent tests, not a new SDK API
or execution framework. `bulk-invite-input.ts` exports `parseBulkRecipients(text)` and async
`readBulkRecipients(path)`, returning `{ inputRecords, duplicates, recipients }`; each recipient
is `{ line, email }`. `prepareBulkInvitations(recipientInput, options)` returns the same counters
and ordered recipient entries with an additional complete `input: InviteUserInput`. Options use
the command flag names `org`, `role`, `claim`, `locale` and `personal-message`. All entries are
prepared/encoded before the command creates its client.

`bulk-invite.ts` exports async `runBulkInvitations(prepared, invite)`, where `invite` matches the
existing SDK method, returning only the closed `BulkInviteReport`. A small direct helper
`createUnattemptedBulkReport(prepared, error)` handles client-construction failure without inventing
an SDK attempt. `getBulkInviteExitCode(report)` implements the existing exit table. These functions
share the same outcome-derived summary calculation. Tests for client-construction failure use the
real command and external factory boundary; the loop itself does not construct a client.

## Recovery

Do not wait on Retry-After, retry5xx, resend unknown deliveries, persist reports or implement
automatic resume. Documentation must tell operators to investigate unknown outcomes before
manually rerunning. The existing API can replace pending invitation links even on a later
otherwise-identical run. Do not add a lookup endpoint to decide whether replay is safe.

Native process termination remains native: no custom signal supervisor or durable checkpoint is
added. A process interrupted/killed during a request may have no final report, and no subsequent
recipient may be dispatched after process termination. Cross-process exactly-once delivery and
automatic reconciliation are not claimed. ST cases in07 own the concrete normal/failure examples.

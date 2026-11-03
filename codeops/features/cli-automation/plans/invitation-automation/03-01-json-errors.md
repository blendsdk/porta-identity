# JSON Error Contract and CLI Integration

> **Document**: 03-01-json-errors.md
> **Parent**: [Index](00-index.md)
> **Authority**: AR-2/7/12/13/16/17 · requirements R1–R3

## Wire contract

JSON-mode failures emit exactly one newline-terminated JSON object on stderr. Property order is
not contractual. Human output is unchanged. Existing command-owned stdout values are unchanged;
this is not a new result wrapper. Existing non-error warnings are not reclassified as failures.
The embedded Admin UI retains its current usage rejection and session behaviour.

```json
{ "code": "CONFLICT", "message": "The request conflicts with existing state.", "status": 409 }
```

`code` and `message` are mandatory. `status` is an integer100–599 only when an actual HTTP response
is known; local failures omit it. Optional `requestId` is a UUID validated by the existing safe
SDK boundary; `retryAfter` is a finite non-negative integer number of seconds no greater than
2,147,483,647. Invalid optional metadata is omitted. No arbitrary extension fields are allowed.

| Source                                                       | Code                    | Fixed message                                | Shared-handler exit  |
| ------------------------------------------------------------ | ----------------------- | -------------------------------------------- | -------------------- |
| SDK400                                                       | VALIDATION_ERROR        | The request failed validation.               | 3                    |
| SDK authentication error, including synthetic local failures | AUTHENTICATION_REQUIRED | Authentication is required.                  | 2                    |
| SDK403                                                       | FORBIDDEN               | This operation is not permitted.             | 2                    |
| SDK404                                                       | NOT_FOUND               | The requested resource was not found.        | 1                    |
| SDK409                                                       | CONFLICT                | The request conflicts with existing state.   | 1                    |
| SDK429                                                       | RATE_LIMITED            | The request was rate limited.                | 1                    |
| SDK5xx                                                       | SERVER_ERROR            | The server could not complete the request.   | 1                    |
| Other SDK HTTP failure                                       | HTTP_ERROR              | The HTTP request failed.                     | 1                    |
| New locally invalid input                                    | VALIDATION_ERROR        | The command input is invalid.                | 3                    |
| yargs failure                                                | ARGUMENT_ERROR          | Invalid command arguments.                   | 1                    |
| Unknown/SDK base/non-HTTP exception                          | COMMAND_FAILED          | The command failed.                          | 1                    |
| Known diagnostic failure                                     | DIAGNOSTIC_FAILED       | One or more checks failed.                   | Existing path        |
| Existing structured partial result / new incomplete batch    | BATCH_INCOMPLETE        | The operation did not complete successfully. | Existing path /03-03 |
| Uncertain dispatched invitation                              | OUTCOME_UNKNOWN         | The invitation outcome is unknown.           | 03-03                |

These messages never incorporate raw exception messages, cause chains, bodies, field details,
submitted flags, claim values or paths, including `--verbose`. Human mode continues to use its
existing messages/verbose handling; do not silently redesign it. JSON serialization escapes
controls. Do not echo arbitrary error names as codes or infer an HTTP status from an Error string.

**Authentication provenance (AR-17):** PortaAuthenticationError always carries status401, even
when the SDK creates it for a missing credential file or a refresh failure with a different or
unknown HTTP result. Its class/status therefore does not prove an observed401. Omit status for
that class when formatting an opaque SDK exception; retain AUTHENTICATION_REQUIRED and the
existing exit. A direct HTTP boundary may report a status it actually observed, but must not
infer the refresh endpoint's status or invitation dispatch from message/body/code strings.
Do not expand the SDK API to add provenance in this plan.

## Internal seams

Add `src/error-format.ts` with documented `CliErrorEnvelope`, closed code constants, a local
input/argument-error discriminator and `formatCliError(error: unknown): CliErrorEnvelope`.
Use type guards and fixed code/message mapping. Keep a validated formatter for known direct
diagnostic/aggregate summaries; it accepts only the closed vocabulary and safe optional metadata.

Extend `handleError(error, verbose = false, json = false): never` and
`withErrorHandling(handler, verbose = false, json = false)` additively. JSON writes the one formatted
error before exiting; false uses the existing code path. A small `writeJsonError` seam reports
without terminating or changing exitCode for direct-return/report paths. Do not monkeypatch
console/stderr or introduce process-global mutable output mode (AR-13).

Caller integration must retain `handleError(error, argv.verbose)` in human/false mode and use
`handleError(error, argv.verbose, true)` only in JSON mode. Do not pass an extra false argument:
existing frozen configuration/key specifications assert the exact two-argument human boundary.
Preserve those specifications rather than edit their expectations (PF-004).

## Parser boundary

Extract only CLI construction into `src/cli.ts` so tests can instantiate the real parser without
running the executable. `src/index.ts` remains the executable adapter. A small
`resolveJsonMode(args: readonly string[]): boolean` uses public yargs Boolean parsing with help,
version and automatic process exits disabled. It does not register commands or execute handlers.
Match installed semantics for placement, true/false, negation, repeated flags and `--`; never use
substring search or `argv.includes`. The probe's invalid Boolean spelling behaviour is not
reinterpreted as true.

Install a safe failure hook only when early parsing selects JSON mode. It writes ARGUMENT_ERROR
with exit1, without default help or yargs text containing values. Top-level uncaught failures use
the same safe format in JSON mode and their existing human/exit behaviour otherwise. Regular
handlers always pass their own parsed `argv.json`; the preparse is only for early failures.

## Integration matrix

| Existing paths                                                                                                                      | Required change                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Every conventional command `handleError(err, argv.verbose)`                                                                         | Keep the exact two-argument call for human/false mode; supply a third true argument only when parsed argv selects JSON.                       |
| `user`, `user-role`, `user-claim`; `org`; `app`, `app-role`, `app-permission`, `app-claim`, `app-module`; `client`, `client-secret` | Cover every handler, not just invitation paths.                                                                                               |
| `keys`, `sessions`, `audit`, `stats`, `config`, `bulk`, `exports`, `export`, `import`, `login`, `health`                            | Apply the same handler integration.                                                                                                           |
| `whoami` missing credentials                                                                                                        | JSON AUTHENTICATION_REQUIRED; retain exit1 and no stdout.                                                                                     |
| `config set` local invalid value                                                                                                    | JSON VALIDATION_ERROR; retain exit3.                                                                                                          |
| Legacy `bulk execute` direct validation                                                                                             | JSON VALIDATION_ERROR instead of human error; retain its current exit0/return and any existing prompt/order behaviour. No unrelated bug fix.  |
| Legacy `bulk execute` failed entries                                                                                                | Preserve result stdout and exact old exit; add one BATCH_INCOMPLETE stderr summary, not one error per item.                                   |
| `import manifest` rejection                                                                                                         | Preserve stdout result and exit1; add one BATCH_INCOMPLETE stderr summary.                                                                    |
| `doctor` failed checks                                                                                                              | Preserve stdout array and exit1; add one DIAGNOSTIC_FAILED stderr summary.                                                                    |
| `health` unhealthy response                                                                                                         | Preserve stdout body and legacy mode-specific exit, including current JSON return0; add a fixed safe summary using the known response status. |
| Admin UI, completion, logout/version success                                                                                        | No new output wrapper or authentication behaviour. Real parser argument failures still use the entry contract.                                |

The source audit at execution must account for every direct failure and handler in this matrix.
Do not change old stdout reports, warnings or success payloads merely to fit the new error shape.
Legacy exit0 failures remain a documented compatibility limitation, not a claim of healthy status.
Tests own exact examples in07; no legacy assertion may be weakened to make integration pass.

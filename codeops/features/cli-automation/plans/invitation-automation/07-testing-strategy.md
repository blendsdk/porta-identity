# Testing Strategy: CLI Invitation Automation

> **Document**: 07-testing-strategy.md
> **Parent**: [Index](00-index.md)
> **Authority**: AR-9/12/16 · R12

## Execution style

Specification authors receive the owning03 excerpts and the ST rows below, not the implementation
files they will judge. New `.spec.test.ts` files are immutable behaviour oracles. Observe intended
red before implementation, then green, then add `.impl.test.ts` tests. Existing specification and
security assertions cannot be weakened, skipped or retried away. Separate concerns before test
files exceed200–300 lines. Do not grow the existing oversized general user test.

Use real yargs, the real formatter and the real runner. Mock only the external SDK/HTTP/filesystem
boundary when needed. Actual executable tests cover parser failures using synthetic arguments,
isolated empty HOME and no credential files. Neither read real operator credentials nor create
new credential files without exact current approval. Use owned OS temporary space; no repository
scratch fixtures. Existing command helper tests that swallow errors cannot qualify entry failures.

## 🚨 Specification Test Cases

`A=11111111-1111-4111-8111-111111111111`,
`C=22222222-2222-4222-8222-222222222222` are synthetic UUIDs, not credentials. `SENSITIVE_MARKER`
is a non-secret assertion marker. Every case's expected behaviour is owned here and derives from
the cited approved requirement/specification, not the implementation.

### Phase1 — CLI-wide JSON errors

| Case  | Input / scenario                                                                                                                                           | Expected output / behaviour                                                                                                                                                                 | Source                                     |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| ST-1  | Typed SDK400/authentication/403/404/409/429/503/418 failures with JSON selected                                                                            | Exactly the03-01 code/message mapping, exits3/2/2/1/1/1/1/1, one JSON object on stderr, no stdout result. Actual status retained except ambiguous SDK authentication errors, which omit it. | R1–3;03-01 Wire contract;AR-17             |
| ST-2  | 503 with valid UUID requestId;429 retryAfter30; invalid UUID, negative/non-finite retry metadata                                                           | Safe valid metadata retained; invalid metadata omitted; no body or extra keys.                                                                                                              | R3;03-01 Wire contract                     |
| ST-3  | Non-HTTP Error and SDK base error containing SENSITIVE_MARKER                                                                                              | COMMAND_FAILED, fixed message, exit1, no status, marker or error name/cause.                                                                                                                | R3;03-01 Wire contract                     |
| ST-4  | JSON plus verbose; marker in HTTP message/body/details/cause/stack                                                                                         | One safe envelope only; none of those markers or payloads appears on either failure stream.                                                                                                 | R3;03-01 Wire contract                     |
| ST-5  | Actual parser: JSON before/after command, true/false, negation, repeated flags, tokens after `--`, invalid Boolean spelling                                | Mode matches the installed yargs Boolean semantics; tokens after `--` are not output flags; false/negated modes retain human output.                                                        | R1/2;03-01 Parser boundary                 |
| ST-6  | Unknown command/option or missing required argument with JSON selected, marker in submitted argument                                                       | ARGUMENT_ERROR, exit1, no help/raw argument/marker, stdout empty. Missing bulk required flags is a parser failure, not post-parse preflight.                                                | R1/3;03-01 Parser boundary                 |
| ST-7  | Human mode conflict with public message `Conflict` and JSON false                                                                                          | Existing human `Conflict: Conflict` error text/format and exit1 remain; no JSON wrapper. Existing frozen assertions remain intact.                                                          | R2;03-01 Integration matrix                |
| ST-8  | whoami JSON without credentials in isolated empty HOME                                                                                                     | AUTHENTICATION_REQUIRED, exit1, stdout empty; no credential file read outside isolation.                                                                                                    | R1/2;03-01 Integration matrix              |
| ST-9  | config set JSON with locally invalid value                                                                                                                 | VALIDATION_ERROR without HTTP status; exact existing exit3.                                                                                                                                 | R1/2;03-01 Integration matrix              |
| ST-10 | Existing bulk execute JSON validation branches: no IDs, incompatible action, missing organization                                                          | One fixed VALIDATION_ERROR; retain each branch's existing exit0 and existing ordering; no new mutation.                                                                                     | R2;03-01 Integration matrix                |
| ST-11 | Existing bulk execute JSON response has failed entries                                                                                                     | Exact original stdout result and legacy exit0; one safe BATCH_INCOMPLETE stderr summary.                                                                                                    | R1/2;03-01 Integration matrix              |
| ST-12 | Doctor failed-check JSON report / import rejected JSON result                                                                                              | Original stdout array/object retained; exit1 and one safe DIAGNOSTIC_FAILED / BATCH_INCOMPLETE stderr summary.                                                                              | R1/2;03-01 Integration matrix              |
| ST-13 | Health JSON receives known503 unhealthy body                                                                                                               | Original stdout body and legacy JSON exit0 retained; one fixed failure summary carrying status503; human mode retains its current exit1.                                                    | R1/2;03-01 Integration matrix              |
| ST-14 | Representative organization/application/client/user/infrastructure commands fail with403 under JSON                                                        | FORBIDDEN envelope and exit2 through the real handler boundary; all caller groups in03-01 are covered by the integration audit.                                                             | R1;03-01 Integration matrix                |
| ST-15 | Existing success JSON result; interactive Admin command rejects JSON                                                                                       | Success value is unchanged and no error emitted; Admin rejection still uses its original message and exit2, without new UI initialization.                                                  | R2;03-01 Integration matrix                |
| ST-47 | Real public createCliAuth/getToken with externally mocked filesystem/HTTP: missing credentials, rejected refresh400/500, unknown refresh transport outcome | Each produces AUTHENTICATION_REQUIRED without fabricated status401 or refresh status; no body/message/credential marker leaks. No real credential file is read or created.                  | R1/3;03-01 Authentication provenance;AR-17 |

ST-7/14 also retain the exact existing two-argument human handleError boundary for configuration
and key failures; JSON alone supplies the third true argument. Frozen specifications remain intact
(PF-004).

### Phase2 — Invitation claim input

| Case  | Input / scenario                                                                                                           | Expected output / behaviour                                                                                                                                                                                                                                                                              | Source                                        |
| ----- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| ST-16 | No claim flag / empty parser input                                                                                         | No claims property is added; existing invite payload/result preserved.                                                                                                                                                                                                                                   | R4;03-02 Parsing                              |
| ST-17 | Repeated `A:C:<json>` with distinct claim IDs; JSON string containing colon, object, array,0,false,null                    | Values are exact JSON.parse values in flag order, first two UUID separators only; one unchanged SDK invitation call.                                                                                                                                                                                     | R4;03-02 Parsing                              |
| ST-18 | Missing separators, malformed UUIDs, empty or invalid JSON; marker inside malformed JSON                                   | Local validation exit3 before client/SDK invocation; no raw value in JSON errors; no invented HTTP status.                                                                                                                                                                                               | R3/4;03-02 Parsing                            |
| ST-19 | Same application/claim pair repeated, including UUID case variants                                                         | Reject the entire input before any SDK call, including identical repeated values.                                                                                                                                                                                                                        | R4;03-02 Parsing                              |
| ST-20 | JSON number `1e309`, directly or nested                                                                                    | Local validation failure; no null coercion or SDK call.                                                                                                                                                                                                                                                  | R4;03-02 Parsing                              |
| ST-21 | Claim object contains `__proto__` and nested configuration-like properties                                                 | Retain nested JSON data; no prototype/argv/auth mutation and no value logged.                                                                                                                                                                                                                            | R3/4;03-02 Data and authority                 |
| ST-22 | Existing roles, locale and message plus valid claims                                                                       | Exactly the existing shared fields plus the ordered claims; no extra catalogue HTTP calls.                                                                                                                                                                                                               | R4;03-02 Integration                          |
| ST-23 | Single invite acknowledges sent/failed/unknown delivery                                                                    | Existing deferred result shape, stdout presentation and single-command exit behaviour unchanged.                                                                                                                                                                                                         | R2/4;03-02 Command                            |
| ST-49 | Actual single/bulk parser with bare `--claim`, valid assignment followed by bare `--claim`, `--claim ''`, and `--no-claim` | Missing values produce ARGUMENT_ERROR/exit1; explicit empty or non-string parsed assignments produce local VALIDATION_ERROR/exit3. Zero client/invite calls; no occurrence silently disappears. Direct helper undefined/[] still omits claims.                                                           | R3/4/6;03-02 Command/Parsing; PF-005          |
| ST-50 | A finite nested claim parses, but the complete invitation input fails normal runtime JSON.stringify; single and bulk paths | Local VALIDATION_ERROR/exit3 before createClient or any SDK invocation; bulk emits no recipient report. Qualify the counterexample under each verification runtime, including wrapper nesting, rather than freeze a universal depth. Finite-number traversal must not throw an unclassified stack error. | R4/6;03-02 Parsing;03-03 Input bounds; PF-006 |

### Phase3 — Bulk email-file invitation

| Case  | Input / scenario                                                                                                                           | Expected output / behaviour                                                                                                                                                               | Source                                       |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| ST-24 | BOM +`Alice@EXAMPLE.com` on line1, blank line2,`alice@example.com` on line3,`bob@example.com` on line4, LF/CRLF variants                   | Unique ordered recipients retain line1/original trimmed spelling and line4; inputRecords3,unique2,duplicates1.                                                                            | R5/6;03-03 Input bounds                      |
| ST-25 | First valid row followed by malformed email; invalid shared roles/claims/org/locale/message variants                                       | Local preflight exit3, no stdout recipient report and zero client/invite calls; no known-bad partial delivery.                                                                            | R6;03-03 Input bounds                        |
| ST-26 | Invalid UTF-8 byte sequence; interior BOM / bare interior CR; blank-only file                                                              | Local validation failure, exit3 and no requests.                                                                                                                                          | R6;03-03 Input bounds                        |
| ST-27 | Exactly1,048,576 raw bytes versus one byte more; file grows after initial stat                                                             | At-limit valid input accepted; over-limit rejected during bounded read, descriptor closed on both paths.                                                                                  | R6;03-03 Input bounds                        |
| ST-28 | 1,000 versus1,001 unique valid recipients; duplicate lines not increasing the unique count                                                 | 1,000 accepted,1,001 rejected before dispatch; duplicate count does not consume the unique limit.                                                                                         | R6;03-03 Input bounds                        |
| ST-29 | Unreadable/non-regular path, supplied literally as a local filename                                                                        | Safe local validation failure without a path/body echo, exit3; descriptor/resource cleanup; no SDK calls.                                                                                 | R3/6;03-03 Input bounds                      |
| ST-30 | Parsed bulk flags have valid shared settings; missing required file/org at parser boundary                                                 | Valid shared options forwarded once per recipient; missing flags use ST-6's argument exit1; no interactive prompt.                                                                        | R5/6;03-03 Command                           |
| ST-31 | Two recipients; first external invitation promise held unresolved                                                                          | Only the first call exists until resolved; second starts afterwards; never more than one in flight.                                                                                       | R7;03-03 Dispatch                            |
| ST-32 | First recipient typed409, second succeeds sent                                                                                             | Both attempted in order; first rejected(CONFLICT),second created; counts2 attempted,1 rejected,1 created/sent; exit1.                                                                     | R8/10;03-03 Dispatch                         |
| ST-33 | First recipient typed400 from invalid server pre-assignment; second valid address                                                          | Stop after first, rejected1/unattempted1,attempted1,exit1; do not misclassify shared failure as recipient-local.                                                                          | R8;03-03 Dispatch                            |
| ST-34 | First typed404 or429 with retryAfter30; second recipient remains                                                                           | Stop, report one rejection and one unattempted,exit1; no sleep/retry; safe status/retry metadata.                                                                                         | R7/8;03-03 Dispatch                          |
| ST-35 | SDK401 refresh succeeds then returns valid creation; versus final SDK authentication error / actual invitation403                          | Recovery may issue two HTTP requests but one runner attempt. Final authentication exception yields unknown with no fabricated status; actual403 yields rejected. Both stop with exit2.    | R7/8;03-03 Dispatch;AR-17                    |
| ST-36 | Dispatched request yields503, including simulated already-committed side effect                                                            | Current recipient unknown, not confirmed rejected; actual503 safe metadata; next unattempted,exit1; no replay/rollback claim.                                                             | R8;03-03 Dispatch                            |
| ST-37 | Dispatched request throws network/ordinary Error containing marker                                                                         | Current unknown with no invented HTTP status; next unattempted,exit1; marker omitted and no replay.                                                                                       | R3/8;03-03 Dispatch                          |
| ST-38 | Malformed/mismatched success fields or inconsistent invitationSent/delivery                                                                | Current unknown; stop and mark rest unattempted; no fabricated creation certainty.                                                                                                        | R8/9;03-03 Dispatch                          |
| ST-39 | Three acknowledged creations with delivery sent,failed,unknown                                                                             | Continue through all three,created3,sent1,deliveryFailed1,deliveryUnknown1,unknown0; exit1; no resend.                                                                                    | R9/10;03-03 Result schema                    |
| ST-40 | Duplicate file rows and repeated case spelling                                                                                             | Exactly one SDK call/result per unique address, first occurrence retained, no duplicate-send replacement inside one run.                                                                  | R6/7;03-03 Input bounds                      |
| ST-41 | Two successful creations, both delivery sent                                                                                               | One stdout report; all summary invariants hold; exit0 and no error on stderr.                                                                                                             | R10;03-03 Result schema / Exit policy        |
| ST-42 | Two independent normal runner invocations with the same prepared recipient                                                                 | Each calls the existing SDK again; no persistent skip cache/idempotency claim. Documentation warns that the API may replace pending links.                                                | R7/10/11;03-03 Recovery                      |
| ST-43 | One409 followed by final403, with a third recipient                                                                                        | rejected2,unattempted1,attempted2; final auth stop takes exit2; no third call.                                                                                                            | R8/10;03-03 Exit policy                      |
| ST-44 | Client construction fails before any invitation: typed auth versus ordinary Error                                                          | All recipients unattempted,attempted0; exit2 for auth or1 otherwise; no unknown mutation row or invented status.                                                                          | R8/10;03-03 Dispatch                         |
| ST-45 | Nonzero normal batch report with marker in external error data                                                                             | One stdout report and one BATCH_INCOMPLETE stderr envelope; safe metadata only; counts/reasons match, no claim values/body/marker.                                                        | R3/10;03-03 Result schema                    |
| ST-46 | Valid file whose literal filename contains spaces and shell metacharacters, under owned scratch root                                       | File is read as data; no shell invocation, side file or marker command execution.                                                                                                         | R6;03-03 Input bounds                        |
| ST-48 | Real public SDK users.invite with mocked external credential/HTTP boundary fails lazily from missing credentials or failed/unknown refresh | One SDK attempt/current unknown row, remaining unattempted, authentication stop/exit2, no status. Test knows zero invitation HTTP calls; runner does not invent that knowledge or replay. | R7/8/10;03-03 Dispatch / Result schema;AR-17 |

Extend ST-29 on platforms supporting FIFOs with an owned FIFO having no writer. Assert bounded
completion, local exit3, zero client calls and descriptor/fixture cleanup. Exercise descriptor-level
non-regular rejection, not only directory/path-stat failure; qualify nonblocking open on that
platform without claiming unsupported flags are portable guarantees (PF-003).

## Test files

All paths below are relative to packages/cli. Case ranges are references, not duplicated oracles.

| File                                               | Cases / purpose                                           |
| -------------------------------------------------- | --------------------------------------------------------- |
| `tests/json-errors.spec.test.ts`                   | ST-1–3,7                                                  |
| `tests/json-errors-entry.spec.test.ts`             | ST-5/6/15; real parser/executable failures                |
| `tests/security/json-error-redaction.spec.test.ts` | ST-4/47; malicious marker variants for ST-6/18/45         |
| `tests/commands/json-errors-legacy.spec.test.ts`   | ST-8–14                                                   |
| `tests/commands/user-invite-claims.spec.test.ts`   | ST-16–23/49/50, single-invite path                        |
| `tests/bulk-invite-input.spec.test.ts`             | ST-24–30/40/46/50, bulk preflight and owned FIFO          |
| `tests/bulk-invite.spec.test.ts`                   | ST-31–38/42–44/48                                         |
| `tests/commands/bulk-invite.spec.test.ts`          | ST-39/41/45/49 and real yargs command registration        |
| `tests/json-errors.impl.test.ts`                   | Internal classifier/format integration edges, after green |
| `tests/invitation-claims.impl.test.ts`             | Parser edge internals, after green                        |
| `tests/bulk-invite.impl.test.ts`                   | File-handle/loop/count implementation edges, after green  |

Split a listed concern into additional files only if needed to respect size; update the actual
structure inventory accordingly. No source-snapshot test is a substitute for behaviour coverage.

## Verification commands

Commands run from repository root. The user approved this selection policy in AR-12/16. Use
Node24 for active feature verification and packed P1 evidence, while preserving declared runtime
compatibility. No new package installation, config-policy change or release workflow is implied.

| Gate                                                 | Exact command / selection                                                                                                                                                                                              |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First local selection                                | `pnpm test:changed`                                                                                                                                                                                                    |
| Phase1 feedback                                      | `pnpm --filter @portaidentity/cli exec vitest run tests/json-errors.spec.test.ts tests/json-errors-entry.spec.test.ts tests/security/json-error-redaction.spec.test.ts tests/commands/json-errors-legacy.spec.test.ts` |
| Phase2 feedback                                      | `pnpm --filter @portaidentity/cli exec vitest run tests/commands/user-invite-claims.spec.test.ts tests/parsers.test.ts`                                                                                                |
| Phase3 feedback                                      | `pnpm --filter @portaidentity/cli exec vitest run tests/bulk-invite-input.spec.test.ts tests/bulk-invite.spec.test.ts tests/commands/bulk-invite.spec.test.ts`                                                         |
| Before every green checkpoint                        | `pnpm --filter @portaidentity/cli verify` and `pnpm test:structure`                                                                                                                                                    |
| Security phases1–3                                   | `pnpm test:pentest` and `pnpm assurance:harness --project security --profile production-security`                                                                                                                      |
| Packed contract adjunct after clean green checkpoint | `pnpm assurance:compat --select p1-admin`                                                                                                                                                                              |
| Public documentation changes                         | `pnpm docs:build`                                                                                                                                                                                                      |
| Plan-only validation                                 | Direct Markdown formatting/link/AR/ST/task checks and `pnpm test:structure`; no services required                                                                                                                      |
| CI authoritative merge gate                          | `pnpm verify` plus existing required jobs                                                                                                                                                                              |

### Bounded coverage evidence (PF-002)

The ordinary CLI verify command does not collect coverage and its configured includes omit these
modules. After each phase is green, use existing Vitest/V8 with invocation-only includes and an
owned external reports directory. Do not edit vitest.config.ts, change existing thresholds or
add an assurance campaign. Record affected-file line coverage against the existing goals:

| Classification | Goal | Feature modules                                                           |
| -------------- | ---- | ------------------------------------------------------------------------- |
| Business logic | 90%  | `src/parsers.ts`, `src/bulk-invite.ts`                                    |
| Support        | 80%  | `src/error-format.ts`, `src/error-handler.ts`, `src/bulk-invite-input.ts` |
| Glue           | 60%  | `src/cli.ts`, `src/index.ts`, each changed `src/commands/*.ts` module     |

Use only existing/new modules present in that phase. CLI include options replace the configured
collection set, so enumerate every affected file for that invocation and verify that its path
appears in coverage-summary.json. Missing collection is not evidence of sufficient coverage.
Use the complete CLI test selection for phase evidence; a narrow selector only qualifies flags.
The existing parser suite qualified these flags during preflight, without policy changes:

```bash
pnpm --filter @portaidentity/cli exec vitest run --coverage.enabled \
  --coverage.include src/parsers.ts --coverage.include src/error-format.ts \
  --coverage.reporter text --coverage.reporter json-summary \
  --coverage.reportsDirectory "$CODEOPS_TMPDIR/<owned-phase-coverage>"
```

Replace the two example include options with the exact phase file list. Retain existing configured
thresholds, inspect each recorded percentage rather than infer it from command success, and close
any goal shortfall before phase completion without weakening tests or thresholds. Keep generated
coverage output only in owned scratch space and remove it after durable non-sensitive metrics
are recorded.

### Clean-source assurance sequence (PF-001)

1. Finish source, specification/implementation tests, documentation and affected test inventory.
   Run changed selection, CLI verify, structure, bounded coverage, applicable pentest and docs
   checks; complete independent review/audit of the implemented change. Resolve findings first.
2. Record completed local tasks and outcomes, leaving clean-provenance security/packed tasks
   unchecked. Create an **unpublished local source commit** using git-commit without push. It is
   not a completed phase or assurance checkpoint. Never commit intended-red or known-failing tests.
3. Confirm the tree is clean. Run production-security assurance and packed compatibility against
   that committed source without tracked-file edits between or during the runs. Collect temporary
   evidence outside the repository and preserve normal harness-owned artifacts/cleanup. Do not
   update task checkboxes while a gate requires unchanged source provenance.
4. After both runs end and owned cleanup is checked, immediately record their exact source commit,
   artifact identities, exit taxonomy and authorized dispositions. Only then mark their tasks
   implemented/verified as justified. A gate task is not complete before its evidence is recorded.
   Accepted observer gaps remain incomplete, not passes; new failures/gaps still require rulings.
5. Verify the evidence/documentation changes and required checkpoint checks, then commit that
   evidence and push both commits only when all required gates/dispositions permit. If product
   source changes after a gate, make a new locally verified source commit and rerun the affected
   gates; old evidence does not qualify the changed source. Never test the previous revision merely
   to satisfy cleanliness or relax provenance checks.

This explicitly separates a verified local source commit from phase completion, preserving
auto-commit's no-failing-publication rule and immediate updates after each genuinely completed task.
The source-checkpoint and following assurance tasks form one narrowly scoped provenance group.
Record their pending state before the source commit. Defer tracked checkbox/evidence writes from
that commit until both gate runs end; use owned temporary continuity notes for observations during
the group. This is an explicit exception to per-task tracked writes during that interval, not an
exception to tests, review, truthful task verification or provenance. Do not write a second
authoritative task ledger. On interruption, the committed tasks remain pending and must be checked
against the actual source revision and available evidence before resuming.

The three security phases cover new error exposure, claim input and rate-aware mutation handling;
unchanged product security assertions remain mandatory. A registered harness result with accepted
gaps is not described as a full pass: inspect exact taxonomy and seek an authorized disposition
for any new failure/gap. Do not run assurance:all, mutation or control campaigns for this feature.
No browser UI or retained SPA/BFF behaviour changes, so browser and retained harness jobs are
CI regression coverage, not extra locally invented workflows.

`p1-admin` is a registered unchanged-administrative-contract adjunct, not direct proof of new
claim/bulk flows; the ST cases above supply that coverage. Run it from clean committed provenance
with Node24, a short socket TMPDIR, isolated homes/config and two distinct empty npm config files.
Never use the same /dev/null path for both npm configs. Obtain current protected-path approvals
before running; do not inherit authority from prior plans or print credentials. Baseline Docker
containers/networks/volumes/images and generated public files; normal owned lifecycle teardown
comes first, followed by exact owned-residue cleanup and restoration. Report any residue honestly.

## Review and rollback

Each phase requires independent correctness/maintainability/standards plus API-surface review.
Use a dedicated security auditor with owasp-web/auth-protocol/tenant-isolation coverage for the
changed boundaries; do not run duplicate security review lenses. Major/critical findings stop
under project policy and require an authorized resolution; auto-design never accepts reserved risk.

Rollback is a code-only revert through the normal integration route, with no data migration.
It does not unsend email or restore replaced invitation links. Existing authenticated consumers
and old stdout schemas remain valid across mixed CLI versions. Native SIGINT/SIGTERM behaviour
is unchanged; no report/completion guarantee is made after process termination.

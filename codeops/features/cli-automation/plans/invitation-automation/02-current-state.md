# Current State: CLI Invitation Automation

> **Document**: 02-current-state.md
> **Parent**: [Index](00-index.md)
> **Baseline**: clean develop after v1.16.0; planning branch plan/cli-invitation-automation

## Observed implementation

| File / line                                                                  | Current behaviour                                                                       | Governing change                                   |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `packages/cli/src/index.ts:69,119–129`                                       | Global JSON option; default yargs validation; top-level catch prints the raw error.     | 03-01                                              |
| `packages/cli/src/error-handler.ts:81–187`                                   | Typed SDK failures print human messages; exit0/1/2/3; verbose prints raw details.       | 03-01                                              |
| `packages/cli/src/output.ts:28,71,98`                                        | Existing terminal sanitization and stdout JSON helper; errors print human text.         | Reuse without global interception                  |
| `packages/cli/src/commands/bulk.ts:82–94,115–129`                            | Some validation failures return with exit0; JSON partial-result shape is command-owned. | Preserve exact legacy behaviour in03-01            |
| `packages/cli/src/commands/config.ts:174–177`                                | Local validation exits3 without shared handler.                                         | 03-01 direct branch                                |
| `packages/cli/src/commands/whoami.ts:41–43`                                  | Missing credentials warns and exits1.                                                   | 03-01 direct branch                                |
| `packages/cli/src/commands/doctor.ts:246–273`                                | JSON diagnostic array remains on stdout, with exit1 for failed checks.                  | Preserve report; safe stderr summary               |
| `packages/cli/src/commands/import.ts:59–74`                                  | Rejected operation JSON result on stdout, exit1.                                        | Preserve report; safe stderr summary               |
| `packages/cli/src/parsers.ts:125–179`                                        | Direct UUID-pair role parser; no claim-triple parser.                                   | 03-02                                              |
| `packages/cli/src/commands/user.ts:187–255`                                  | Single invite supports roles, locale and message; sends through SDK, no claim flag.     | 03-02                                              |
| `packages/sdk/src/types/users.ts:239–261`                                    | Existing claim inputs and three delivery outcomes.                                      | Reuse unchanged                                    |
| `packages/sdk/src/transport/node-transport.ts:78–88`                         | One internal refresh/retry on401; no CLI batch/retry mechanism.                         | Reuse unchanged; AR-15 distinction                 |
| `packages/sdk/src/auth/cli-auth.ts:86–92,214–223,260–265`                    | Authentication errors can be local or refresh-related while carrying synthetic401.      | Conservative no-status observation under AR-17     |
| `packages/server/src/users/invite-service.ts:280–299,361–395`                | Shared options checked server-side; commit precedes email delivery.                     | Server remains authority                           |
| `packages/server/src/auth/token-repository.ts:768–785`                       | A new invite replaces a pending invitation for the organization/email.                  | Repeat-run documentation/tests                     |
| `packages/server/migrations/033_invitation_deferred_user_creation.sql:14,33` | Case-insensitive email column and live-email uniqueness.                                | Local duplicate comparison                         |
| `packages/cli/src/client-factory.ts:58–65`                                   | Existing user-credential auth and Admin API transport.                                  | No dependency on bundle C                          |
| `packages/cli/tests/commands/user.test.ts:151–163`                           | General command helper swallows parser exceptions; file already749 lines.               | New actual-entry and focused specs                 |
| `repo-tests/monorepo/server-package.spec.test.mjs:433`                       | Exact CLI test-file inventory105.                                                       | Update to actual owned test count during execution |

## Dependencies and risks

No additional runtime dependency or server migration is needed. Existing yargs, public SDK,
Node filesystem primitives and Vitest are sufficient (AR-13–16). The installed yargs Boolean
probe is recorded in the ambiguity register; it is not an executable-integration pass.

| Risk                                                 | Treatment owner                    |
| ---------------------------------------------------- | ---------------------------------- |
| A direct error branch bypasses JSON serialization    | 03-01 §Integration matrix; ST-8–13 |
| Parser failure echoes a password/claim argument      | 03-01 §Parser boundary; ST-5–7     |
| Shared pre-assignment errors look recipient-specific | 03-03 §Dispatch; ST-33/34          |
| Network/5xx failure happens after commit             | 03-03 §Dispatch; ST-36/37          |
| Repeated run invalidates a previous pending link     | 03-03 §Recovery; ST-42             |
| File changes after stat / invalid UTF-8              | 03-03 §Input bounds; ST-26/27      |
| Existing test helper hides failures                  | 07 §Execution style                |

Current user source is583 lines and parsers211 lines. New claim integration fits those modules;
bulk work gets focused modules rather than push the user command over the project ceiling.
No unrelated extraction of existing oversized tests is authorized (AR-16).

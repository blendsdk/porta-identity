# Phase4 Quality Review: SDK, CLI and Packed Journey

> **Status**: All findings closed; final authoritative run passes; current-source CI pending
> **Baseline tree**: 3adb8ffe2feae9404ed9b0cd9d4c9ee40ad79643
> **Reviewed head**: 58d480f6d893527c57cd77d2e7ced0cde74d9a47
> **CodeOps Artifact Schema**: 1

## Scope

Twenty-seven Phase4 paths: public SDK types/methods, conventional CLI input/commands/error flow,
packed evidence validator/live driver/command wiring, new SDK/CLI/packed tests, inventories and
public/maintainer documentation. The server one-operation machine lane is unchanged.

| Review | Independent session | Result |
| --- | --- | --- |
| Correctness, API, maintainability, concurrency | ses_e4fe09cf4ffeKEUDQcMpq4hBSm | P4-01 critical; P4-02–P4-06 major; P4-07–P4-12 minor |
| Security: supply chain, secrets, traversal, exposure | ses_e4fe09cf2ffek2aMytXZPBVcRj | SA-4-001 critical; SA-4-002–006 major; SA-4-007–011 minor |

## Root findings and corrections

| Finding | Root cause | Correction |
| --- | --- | --- |
| P4-01 / SA-4-006 | Evidence assembly ran after consumer cleanup and rebuilt entrypoints from the deleted path | Entrypoints and local dependency basenames are captured while the consumer exists; assembly uses captured values |
| P4-02 | The shared `else` branch ran the feature journey for ST-69–73 and dropped their credential evidence | Only `compatibility` runs the journey; ST selectors keep their previous evidence shape |
| P4-03 | `.exitProcess(false)` made the executable print a second parser diagnostic with a stack | The executable recognizes the parser's `YError` and exits1 without repeating it |
| P4-04 / SA-4-001 | Replay probe mapped any non-HTTP exception to `401` | Probes write explicit failure markers; non-HTTP replay failures are execution failures |
| P4-05 | Replay reused the pending target without a positive control and could return `409` | A pre-revocation control must authorize (201/409); `409` after revocation is a hard failure |
| P4-06 / SA-4-002 | Evidence facts were constants | Client type/organization, account ownership, policy target, pre-binding secret retirement, token opacity, exact count, eager user and cleanup are observed |
| P4-07 / SA-4-003 | Cleanup was asserted, invitation retained, delete status ignored | Client delete status is checked, the invitation row is removed and verified, cleanup booleans derive from observations, exit60 on failure |
| P4-08 / SA-4-007 | Digest truncated at `|` and ignored pending state | Tab-separated exact projection including `used_at`; post-revocation pending/digest compared; UUID guards before SQL |
| P4-09 / SA-4-008 | SDK guards accepted extra fields and any 2xx revoke | Closed top-level/nested keys with policy bounds; revoke requires204 |
| P4-10 / SA-4-010 | Client ID not locally validated; email bound too high | UUID/dot-segment validation before SDK construction; email limited to255 |
| P4-11 | Parent help omitted the new group | Usage and demand message include `service-account` |
| P4-12 / SA-4-004 / SA-4-005 / SA-4-011 | Formatting churn; secrets in argv/stdout; broad TLS exception; absolute evidence paths | Formatting restored; probes use 0600 files and minimal env; owned endpoint host is required and probes trust the owned certificate; dependency specifiers are basenames |

## Verification after correction

SDK670, CLI1,834, packed validator11, assurance lint and typecheck, structure158 and affected
checks pass. The first authoritative selector run passes, and the scoped re-review closed every
Critical/Major plus all minors except failure-path cleanup. That residual (P4-07/SA-4-003) now
removes client, permanent account and both invitations unconditionally in `finally`. The final
selector run at 0bdd69e2 exits0 with artifact 1d359563 and all cleanup true; both original reviewers
closed P4-07/SA-4-003. Only current-source CI remains.

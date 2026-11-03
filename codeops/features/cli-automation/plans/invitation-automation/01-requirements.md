# Requirements: CLI Invitation Automation

> **Document**: 01-requirements.md
> **Parent**: [Index](00-index.md)
> **Source**: GitHub issues #180, #183 and #181, narrowed by approved AR-12
> **Ownership**: Standalone owning requirements; no upstream RD

## Functional Requirements

| ID  | Must-have requirement                                                                                                                                                                                                 | Authority                   |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| R1  | Non-interactive CLI failures, including parser/argument failures, support classified JSON errors on stderr when JSON mode is selected.                                                                                | #180; AR-2/12               |
| R2  | Keep existing human output, existing stdout report shapes and every existing command's path-specific exit behaviour. Keep the embedded Admin UI unchanged.                                                            | AR-2/12                     |
| R3  | JSON error output contains only bounded fixed public fields, never arbitrary exception/response/input data, including verbose mode.                                                                                   | AR-12/13                    |
| R4  | Single invitations accept repeated application-qualified JSON claim assignments, reject malformed or duplicate claim keys before calling the SDK, and preserve supported JSON values.                                 | #183; AR-12/14              |
| R5  | Provide the approved bulk command with one email per line and shared organization, roles, claims, locale and message. No recipient-specific names/settings are introduced.                                            | #181; AR-3/12               |
| R6  | Apply the approved file limits, normalization and duplicate collapse, and validate all locally checkable input before any invitation request. Server-side validation remains authoritative.                           | AR-12/15                    |
| R7  | Send sequentially in source order through the current SDK/API; preserve its existing authentication recovery. Do not add CLI retries or throttle waiting.                                                             | AR-12/15                    |
| R8  | Follow the approved continue/stop classification, report unknown mutation outcomes truthfully, and account for every unique recipient including unattempted recipients.                                               | AR-12/15                    |
| R9  | Distinguish acknowledged invitation creation from email sent/failed/unknown. Never resend to convert a failed/unknown delivery into success.                                                                          | AR-12/15                    |
| R10 | Emit the approved ordered bulk report, safe failure summary and new-command exit policy. Do not persist reports, input contents or credentials.                                                                       | AR-12/15                    |
| R11 | Document the public error contract, claim quoting, bulk input/results and repeat-run replacement semantics in public CLI documentation and the CLI README; update relevant maintainer documentation during execution. | #180/#183/#181; AR-12/16    |
| R12 | Verify spec-first, retain existing security assertions and require independent phase review and applicable security/compatibility gates. CI full verification remains the merge gate.                                 | AR-12/16; project AGENTS.md |

No optional functionality is included. Bundles C/D/E, Admin UI role selection, unrelated assurance
campaigns, new authentication grants, server/schema changes, fresh dependencies and publishing
are outside this plan (AR-4/12/16).

## Technical Requirements

| Area                  | Requirement                                                                                                                                                                                                   | Authority              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Compatibility         | New CLI only; existing SDK/server public contracts remain unchanged. Older CLIs retain their behaviour. Existing JSON stdout consumers need not adopt a new wrapper.                                          | AR-2/12/13             |
| Boundaries            | Use public SDK imports only; no server-internal imports. Keep new concerns in focused modules and new concern-specific tests rather than enlarge the existing 749-line general user test.                     | AR-14–16               |
| Resources             | Enforce 03-03 §Input bounds during actual reads, one invocation at a time, and one SDK request in flight. No new throughput/availability commitment.                                                          | AR-12/15               |
| Security              | JSON errors cannot expose credentials, claim values, bodies, stacks, filesystem paths or submitted parser values. Validate new local inputs; retain authoritative API authz, tenant isolation and validation. | AR-12–16               |
| Recovery              | No atomic multi-recipient guarantee. No cross-run deduplication or resume claim. Existing pending invitations can be replaced by a later invocation.                                                          | AR-12/15               |
| Coverage              | Retain project goals:90% business logic,80% support,60% glue; use existing tools and do not change coverage configuration solely for this feature.                                                            | AR-16                  |
| Files and credentials | Tests use isolated owned scratch space and synthetic inputs. Obtain exact current-conversation path approval before any protected file operation; this plan does not grant it.                                | AR-16; global guidance |

## Acceptance and completion

R1–R12 are satisfied only after the corresponding ST cases in [07](07-testing-strategy.md) pass,
all execution-plan tasks verify, independent findings are resolved under project policy, documentation is
updated and owned resources are cleaned up. Passing a planning validator or an unrelated packed
journey is not evidence that the new behaviours work. No release/merge is part of completion.

# Testing Strategy: User Management

> **Document**: 07-testing-strategy.md
> **Parent**: [Index](00-index.md)

## Testing Overview

Completion is behavioral rather than an invented coverage percentage (AR-8). Every ST case below
must have specification tests written before its production change, an expected-red checkpoint, an
unchanged-expectation green checkpoint, and focused implementation tests afterward.

| Boundary              | Required evidence                                                                   |
| --------------------- | ----------------------------------------------------------------------------------- |
| SDK/current consumers | SDK and CLI specifications, package verifies, clean packed `p1-admin` assurance     |
| User state/service    | Pure validation/service specifications plus hostile-response implementation tests   |
| JSVision UI           | Real control/view specifications plus focus, modal, and resize implementation tests |
| Application workflow  | Command/generation/session specifications plus packed PTY journey                   |
| Repository/docs       | Structure tests, Prettier, docs build, sensitive/generated-file inspection          |

Test names use `should [behavior] when [condition]`. Real JSVision objects and SDK domains are used;
only HTTP transport, process/session boundaries, and playground services are replaced or isolated.

## 🚨 Specification Test Cases

> These cases are the immutable behavioral oracle. If implementation differs, fix implementation;
> do not weaken or retry away the expectation.

### SDK contracts and current consumers

| #     | Input / Scenario                                                      | Expected Output / Behavior                                                                                                   | Source                                     |
| ----- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| ST-01 | `users.list(org,{page:2,pageSize:20,search:'alice',status:'active'})` | GET query contains `page=2&pageSize=20&search=alice&status=active` and no `limit`                                            | RD-03 UM-02, UM-15; 03-01 §List parameters |
| ST-02 | `users.list(org,{cursor:'next',pageSize:2,search:'alpha'})`           | GET query contains `cursor=next&limit=2&search=alpha` and no `page`/`pageSize`                                               | RD-03 AC-11; 03-01 §List parameters        |
| ST-03 | Create/update inputs compile with all server-supported fields         | Create excludes `phoneNumberVerified`; update excludes email and accepts nullable profile/address plus `phoneNumberVerified` | RD-03 UM-05, UM-07, UM-15                  |
| ST-04 | Invite response `{userId,email,created,invitationSent,expiresAt}`     | `users.invite()` returns that exact result, not a `User` projection                                                          | RD-03 UM-15; 03-01 §Input and result types |
| ST-05 | Suspend with no/500-char reason and lock with 1/500-char reason       | SDK sends optional `{reason}` for suspend and required `{reason}` for lock                                                   | RD-03 UM-09, AC-7                          |
| ST-06 | History response `{data:[entry],hasMore:true,nextCursor:'c'}`         | Both user domains return the complete envelope without array unwrapping                                                      | RD-03 UM-10, UM-15, AC-12                  |
| ST-07 | Current `porta user` and agent operations use corrected contracts     | Update exposes no email; reasons, invite result, history envelope, and metadata descriptions are truthful                    | RD-03 UM-15, AC-11; AR-3                   |

### Capabilities, validation, and service operations

| #     | Input / Scenario                                                                                 | Expected Output / Behavior                                                               | Source                                |
| ----- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | ------------------------------------- |
| ST-08 | Each exact `admin:user:*` permission supplied alone                                              | Only its corresponding user capability becomes true; legacy `porta-admin` enables all    | RD-03 UM-12, AC-9                     |
| ST-09 | Missing, malformed, unknown, or control-bearing role/permission claims                           | No user capability is granted from the invalid claim                                     | RD-03 UM-12, AC-9                     |
| ST-10 | Valid page 1, pageSize 20, two same-organization users                                           | Service returns one immutable page with both validated rows                              | RD-03 UM-02; 03-02 §User page and row |
| ST-11 | Page with bad UUID, duplicate ID, cross-org row, bad status/control text, or inconsistent totals | Entire result is `invalid-response`; no row is published                                 | RD-03 AC-2; 03-02 §Validation Rules   |
| ST-12 | Valid complete user response and ETag                                                            | Detail contains only approved profile/account fields and controller-owned ETag           | RD-03 UM-04, AC-5                     |
| ST-13 | Detail organization ID differs from selected organization                                        | Result is `invalid-response` and previous validated state remains unchanged              | RD-03 UM-14, Security Considerations  |
| ST-14 | Preview contains safe subject/text plus HTML                                                     | Service retains bounded subject/text only and discards HTML                              | RD-03 UM-06, AC-4                     |
| ST-15 | Create password lengths 8/128 versus 7/129, mismatch, invalid email/profile                      | Bounds pass or fail before dispatch exactly as RD-03 specifies; no password enters state | RD-03 AC-3; 03-02 §Input Validation   |
| ST-16 | Invite names 1/255, locale 0/10, message 0/500 and each over-bound value                         | In-range input dispatches without roles/claims; over-bound input dispatches nothing      | RD-03 AC-4                            |
| ST-17 | SDK throws final 401, 403, 404, 409, transport, or 5xx; success body malformed                   | Service returns the corresponding fixed category and never exposes raw error/body text   | RD-03 UM-13; 03-02 §Failure Mapping   |

### Users menu, workspace, and dialogs

| #     | Input / Scenario                                                     | Expected Output / Behavior                                                                                                       | Source                   |
| ----- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| ST-18 | Authenticated state without selected organization                    | Users remains visible, disabled with fixed organization reason, and dispatches nothing                                           | RD-03 UM-01              |
| ST-19 | Selected organization with only create, only invite, or only read    | Users parent opens and only the exact authorized child activates; create/invite need no read request                             | RD-03 UM-01, AC-9        |
| ST-20 | Browse from read-capable context                                     | Requests page 1/pageSize 20 and renders email, optional names, status, exact Previous/Next state                                 | RD-03 AC-1               |
| ST-21 | Search/page request fails after a validated page                     | Fixed failure and manual Retry appear over unchanged page; no malformed row becomes selectable                                   | RD-03 UM-03              |
| ST-22 | Select a validated row                                               | Detail renders approved profile, indicators, login summary, and timestamps with no excluded field                                | RD-03 UM-04, AC-5        |
| ST-23 | History has 20 entries and `hasMore=true`                            | Exactly 20 newest-first event/actor/time rows plus fixed more indicator; no metadata or paging control                           | RD-03 UM-10, AC-12       |
| ST-24 | Create valid complete input, then success/failure/cancel             | One request at most; non-secret inputs follow validation policy and password/confirmation are empty on every exit                | RD-03 UM-05, UM-13, AC-3 |
| ST-25 | Invite preview then send                                             | Preview shows only safe subject/plain text, returns to populated invite form, and send dispatches once without role/claim fields | RD-03 UM-06, AC-4        |
| ST-26 | Edit one field, clear another, leave a third untouched               | Request sends changed value, explicit null, and omits untouched field; email is read-only                                        | RD-03 UM-07, AC-5        |
| ST-27 | Set/clear password and verify email                                  | Set validates masked matching 8–128 values; clear/verify require explicit email confirmation; success reloads detail             | RD-03 UM-08, AC-6        |
| ST-28 | Active/suspended/locked/inactive user opened                         | Only status-valid lifecycle actions appear; suspend/lock bounds and destructive confirmations match RD-03                        | RD-03 UM-09, AC-7        |
| ST-29 | Purge dialog opens, Cancel activates, then deliberate purge succeeds | Cancel initially focused and sends nothing; deliberate action sends once, closes detail, and refreshes list                      | RD-03 UM-11, AC-8        |

### Workflow, isolation, and live proof

| #     | Input / Scenario                                                                                                                                        | Expected Output / Behavior                                                                            | Source                                                 |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| ST-30 | Submit activated twice or operation cancelled before dispatch                                                                                           | At most one request; pre-dispatch cancel sends zero and restores invoking focus                       | RD-03 UM-13, UM-16                                     |
| ST-31 | Organization switch, reauthentication, session invalidation, or dispose during a pending read                                                           | User view clears and late result cannot render or become selectable                                   | RD-03 UM-14, AC-10                                     |
| ST-32 | Resize below threshold during modal, then recover                                                                                                       | Modal operation is cancelled, late result ignored, validated same-context workspace redraws           | RD-03 UM-14, UM-16, AC-10                              |
| ST-33 | Final 401 after SDK refresh attempt                                                                                                                     | User UI closes and existing authentication gate opens; no second UI retry occurs                      | RD-03 UM-13; AR-4                                      |
| ST-34 | Create-only/invite-only mutation succeeds                                                                                                               | Fixed validated success appears without a read/reload request                                         | RD-03 UM-13, AC-9                                      |
| ST-35 | Any displayed remote field includes ASCII/C1 control or exceeds its bound                                                                               | Whole owning projection is rejected and terminal receives only fixed local text                       | RD-03 Security Considerations; 03-02 §Validation Rules |
| ST-36 | Packed Node 24 journey authenticates, selects an organization, opens Users and a user detail, performs one owned create/invite, cleans it up, and quits | Every observation succeeds, cleanup owns only its nonce user, and terminal restoration remains intact | RD-03 AC-13; 03-04 §Testing Requirements               |
| ST-37 | Completion gates run from the supported Node 24 workflow                                                                                                | SDK/CLI verify, structure/docs, packed journey, and clean committed `p1-admin` compatibility all pass | RD-03 AC-13; AR-6                                      |

## Test Categories

### Specification Tests

| Test file                                                   | ST cases covered   | Component                       |
| ----------------------------------------------------------- | ------------------ | ------------------------------- |
| `packages/sdk/tests/domains/users-contract.spec.test.ts`    | ST-01–ST-06        | SDK user domain/types           |
| `packages/cli/tests/commands/user-contract.spec.test.ts`    | ST-07              | Current CLI consumer            |
| `packages/cli/tests/admin/user-service.spec.test.ts`        | ST-08–ST-17, ST-35 | Capability and service boundary |
| `packages/cli/tests/admin/user-workspace.spec.test.ts`      | ST-18–ST-23        | Menu/workspace                  |
| `packages/cli/tests/admin/user-dialogs.spec.test.ts`        | ST-24–ST-29        | Modal operations                |
| `packages/cli/tests/admin/application.users.spec.test.ts`   | ST-30–ST-34        | Workflow and isolation          |
| `docker/admin-playground/tests/admin-cli.e2e.spec.test.mjs` | ST-36–ST-37        | Packed live journey             |

### Implementation Tests

| Test file                                                 | Description                                                              | Priority |
| --------------------------------------------------------- | ------------------------------------------------------------------------ | -------- |
| `packages/sdk/tests/domains/users-contract.impl.test.ts`  | Query omission/mapping, route/header regression, standalone parity       | High     |
| `packages/cli/tests/admin/user-service.impl.test.ts`      | Validators, lazy domain, ETag, hostile values, no secret state           | High     |
| `packages/cli/tests/admin/user-workspace.impl.test.ts`    | Geometry, selection, focus, redraw, menu rebuilding                      | High     |
| `packages/cli/tests/admin/user-dialogs.impl.test.ts`      | Signals, bounds, password clearing, modal teardown                       | High     |
| `packages/cli/tests/admin/application.users.impl.test.ts` | Generations, submit ownership, context sync, disposal                    | High     |
| Existing affected tests                                   | Current command, agent, session, application, packed cleanup regressions | High     |

### Integration and End-to-End Tests

| Test                           | Components                           | Description                                                                |
| ------------------------------ | ------------------------------------ | -------------------------------------------------------------------------- |
| Current consumer compatibility | Packed SDK + server                  | `p1-admin` proves current cursor and offset requests from a clean commit   |
| Admin application integration  | Session + controller + real JSVision | Authenticated selected-organization workflows with injected SDK operations |
| Packed Admin UI                | Packed CLI + SDK + playground        | Live Users journey, exact owned cleanup, Quit, and terminal restoration    |

## Test Data

Use deterministic UUIDs and complete bounded user fixtures in unit/specification tests. The packed
journey creates a high-entropy nonce email, proves it absent before creation, resolves its validated
UUID after creation, and removes only that user in an inner cleanup path. Passwords and tokens come
only from the existing runtime playground input and never enter fixtures, logs, or committed files.

## Verification Checklist

- [ ] All ST-01–ST-37 have concrete specification tests before implementation.
- [ ] Every new ST test is observed expected-red for missing behavior.
- [ ] Green implementation changes no ST expectation.
- [ ] Focused implementation and existing regression tests pass.
- [ ] `yarn workspace @portaidentity/sdk verify` passes.
- [ ] `yarn workspace @portaidentity/cli verify` passes.
- [ ] `yarn test:structure` and `yarn docs:build` pass.
- [ ] The existing packed Admin UI journey passes on Node 24 LTS.
- [ ] Clean committed `yarn assurance:compat --select p1-admin` passes.
- [ ] No generated, sensitive, server-implementation, dependency, workflow, or unrelated files enter the diff.

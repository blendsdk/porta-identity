# Testing Strategy: User Management

> **Document**: 07-testing-strategy.md
> **Parent**: [Index](00-index.md)

## Testing Overview

Completion is behavioral rather than an invented coverage percentage (AR-8). Every ST case below
must have specification tests written before its production change and an unchanged-expectation
green checkpoint. Assertions for missing or mismatched behavior must first be observed red;
preservation assertions for already-correct behavior are recorded as a green baseline instead.
Focused implementation tests follow the production change.

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

| #     | Input / Scenario                                                                                                                                                                                                                                     | Expected Output / Behavior                                                                                                                                                | Source                                                   |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| ST-01 | `users.list(org,{page:2,pageSize:20,search:'alice',status:'active'})`                                                                                                                                                                                | GET query contains `page=2&pageSize=20&search=alice&status=active` and no `limit`                                                                                         | RD-03 UM-02, UM-15; 03-01 §List parameters               |
| ST-02 | `users.list(org,{cursor:'next',pageSize:2,search:'alpha'})`                                                                                                                                                                                          | GET query contains `cursor=next&limit=2&search=alpha` and no `page`/`pageSize`                                                                                            | RD-03 AC-11; 03-01 §List parameters                      |
| ST-03 | Focused TypeScript oracle assigns every documented create/update/address/list field and exact user-domain result signature, and uses `@ts-expect-error` for removed fields, top-level update address null, bad nullability/sorts, and arbitrary keys | Existing TypeScript binary accepts the positive closed contracts and rejects every negative case; Vitest is not the compile oracle                                        | RD-03 UM-05, UM-07, UM-15; 03-01 §Input and result types |
| ST-04 | Invite response `{userId,email,created,invitationSent,expiresAt}`                                                                                                                                                                                    | `users.invite()` returns that exact result, not a `User` projection                                                                                                       | RD-03 UM-15; 03-01 §Input and result types               |
| ST-05 | Suspend with no/500-char reason and lock with 1/500-char reason                                                                                                                                                                                      | SDK sends optional `{reason}` for suspend and required `{reason}` for lock                                                                                                | RD-03 UM-09, AC-7                                        |
| ST-06 | Organization history wire result is `{data:[entry],hasMore:true,nextCursor:'c'}` and standalone wire result is `{data:{data:[entry],hasMore:true,nextCursor:'c'}}`                                                                                   | Organization preserves the direct envelope; standalone unwraps the outer `data` and preserves the same continuation metadata without a server change                      | RD-03 UM-10, UM-15, AC-12                                |
| ST-07 | Current `porta user` and agent operations use corrected contracts                                                                                                                                                                                    | Update exposes no email; reasons, invite result, and history envelope are truthful; user history agent declares only `orgId,userId`, and all executor calls match exactly | RD-03 UM-15, AC-11; AR-3                                 |

### Capabilities, validation, and service operations

| #     | Input / Scenario                                                                                                                                                                                             | Expected Output / Behavior                                                                                                                                                                | Source                                |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| ST-08 | Each exact `admin:user:*` permission supplied alone                                                                                                                                                          | Only its corresponding user capability becomes true; legacy `porta-admin` enables all                                                                                                     | RD-03 UM-12, AC-9                     |
| ST-09 | Missing, malformed, unknown, or control-bearing role/permission claims                                                                                                                                       | No user capability is granted from the invalid claim                                                                                                                                      | RD-03 UM-12, AC-9                     |
| ST-10 | Valid page 1, pageSize 20, two same-organization users                                                                                                                                                       | Service returns one immutable page with both validated rows                                                                                                                               | RD-03 UM-02; 03-02 §User page and row |
| ST-11 | Page with bad UUID, duplicate ID, cross-org row, bad status/control text, wrong requested page, too many rows for the remaining total, inconsistent formula, zero total, or an empty page after total shrink | Malformed cases are `invalid-response`; zero total and truthful empty out-of-range pages follow the exact formula and publish no row                                                      | RD-03 AC-2; 03-02 §Validation Rules   |
| ST-12 | Valid complete user response and ETag                                                                                                                                                                        | Detail contains exactly the documented allowlist, excludes password-change/method/lock/failed-login fields, and history state retains validated detail context plus controller-owned ETag | RD-03 UM-04, AC-5                     |
| ST-13 | Detail organization ID differs from selected organization                                                                                                                                                    | Result is `invalid-response` and previous validated state remains unchanged                                                                                                               | RD-03 UM-14, Security Considerations  |
| ST-14 | Preview subject at 255/256, text at 10,000/10,001, safe HTML, and control-bearing values                                                                                                                     | Exact maxima pass; over-bound/control values reject the projection; HTML is discarded                                                                                                     | RD-03 UM-06, AC-4                     |
| ST-15 | Create password 8/128 versus 7/129, URL 2,048/2,049, street 500/501, mismatch, invalid email/profile, and control-bearing profile text                                                                       | Exact bounds pass or fail before dispatch; control-bearing text dispatches nothing; no password enters state                                                                              | RD-03 AC-3; 03-02 §Input Validation   |
| ST-16 | Invite names 1/255, locale 0/10, message 0/500, each over-bound value, and control-bearing message                                                                                                           | In-range input dispatches without roles/claims; over-bound or control-bearing input dispatches nothing                                                                                    | RD-03 AC-4                            |
| ST-17 | Read SDK call returns 400, final 401, 403, 404, 409, 412, another 4xx, transport, 5xx, or malformed success                                                                                                  | Exact read category is returned, every 404 preserves validated state, transport/5xx are unavailable, malformed success is invalid-response, and no raw detail is exposed                  | RD-03 UM-13; 03-02 §Failure Mapping   |

### Users menu, workspace, and dialogs

| #     | Input / Scenario                                                                                          | Expected Output / Behavior                                                                                                                                 | Source                   |
| ----- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| ST-18 | Authenticated state without selected organization                                                         | Users remains visible, disabled with fixed organization reason, and dispatches nothing                                                                     | RD-03 UM-01              |
| ST-19 | Selected organization with only create, only invite, or only read                                         | Users parent opens and only the exact authorized child emits its command/intent; network behavior belongs to Phase 4                                       | RD-03 UM-01, AC-9        |
| ST-20 | Browse, empty list, no-match search, every status, search lengths 0/255/256, and previous/next activation | Fixed states render; empty search/All emit omitted filters; 255/status/enabled navigation emit exact typed intents; invalid/disabled controls emit nothing | RD-03 AC-1               |
| ST-21 | Search/page request fails after a validated page or page shrink returns an empty out-of-range page        | Fixed failure/manual Retry preserve the page; truthful empty shrink stays valid and permits deliberate Previous; no malformed row becomes selectable       | RD-03 UM-03              |
| ST-22 | Select a validated row                                                                                    | Detail renders approved profile, indicators, login summary, and timestamps with no excluded field                                                          | RD-03 UM-04, AC-5        |
| ST-23 | History has 20 entries and `hasMore=true`                                                                 | Exactly 20 newest-first event/actor/time rows plus fixed more indicator; no metadata or paging control                                                     | RD-03 UM-10, AC-12       |
| ST-24 | Create valid complete input, invalid input, or cancel                                                     | Dialog returns one bounded typed input or cancellation; password/confirmation are empty on every exit                                                      | RD-03 UM-05, UM-13, AC-3 |
| ST-25 | Invite form receives a validated preview, then send or cancel                                             | Preview shows only bounded subject/plain text, returns to populated form, and dialog returns typed input without role/claim fields                         | RD-03 UM-06, AC-4        |
| ST-26 | Edit one field, clear another, leave a third untouched                                                    | Dialog returns a typed result with changed value, explicit null, and no untouched field; email is read-only                                                | RD-03 UM-07, AC-5        |
| ST-27 | Set/clear password and verify email                                                                       | Set returns only matching masked 8–128 values; clear/verify return typed confirmation or cancellation; secret signals clear                                | RD-03 UM-08, AC-6        |
| ST-28 | Active/suspended/locked/inactive user opened                                                              | Only status-valid lifecycle intents appear; suspend/lock bounds and destructive confirmation results match RD-03                                           | RD-03 UM-09, AC-7        |
| ST-29 | Purge dialog opens, then Cancel or deliberate purge activates                                             | Cancel is initially focused and returns cancellation; distinct purge action returns one typed confirmation                                                 | RD-03 UM-11, AC-8        |

### Workflow, isolation, and live proof

| #     | Input / Scenario                                                                                                                                                                                                                                                                                           | Expected Output / Behavior                                                                                                                                                                                                                                 | Source                                                 |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| ST-30 | Table-driven browse/search/filter/page/detail intents plus representative create/invite/edit/credential/lifecycle/purge outcomes: duplicate submit, control-bearing reason, definite 4xx, super-admin 403, cancellation before/after SDK invocation, transport/5xx, malformed success, or modal contention | Read intents dispatch exact selected-organization SDK calls; local controls dispatch nothing; create/invite need no read; mutations call at most once; every post-invocation indeterminate case publishes outcome-unknown and requires deliberate recovery | RD-03 UM-13, UM-16                                     |
| ST-31 | Organization switch, same-subject/same-organization reauthentication, session invalidation, or dispose during a pending read                                                                                                                                                                               | Organization switch changes the organization context generation; reauthentication/invalidation changes sessionEpoch; every case clears user view and quarantines late results                                                                              | RD-03 UM-14, AC-10                                     |
| ST-32 | Resize below threshold before or after mutation SDK invocation, then recover                                                                                                                                                                                                                               | Pre-invocation cancel dispatches nothing; post-invocation resize records outcome-unknown and ignores the late result; validated same-context workspace redraws                                                                                             | RD-03 UM-14, UM-16, AC-10                              |
| ST-33 | Final 401 after SDK refresh attempt                                                                                                                                                                                                                                                                        | User UI closes and existing authentication gate opens; no second UI retry occurs                                                                                                                                                                           | RD-03 UM-13; AR-4                                      |
| ST-34 | Create-only/invite-only mutation succeeds                                                                                                                                                                                                                                                                  | Fixed validated success appears without a read/reload request                                                                                                                                                                                              | RD-03 UM-13, AC-9                                      |
| ST-35 | Any displayed remote field includes ASCII/C1 control or URL/street/event/preview value at maximum-plus-one                                                                                                                                                                                                 | Whole owning projection is rejected; exact maxima remain valid; terminal receives only fixed local text                                                                                                                                                    | RD-03 Security Considerations; 03-02 §Validation Rules |
| ST-36 | Packed Node 24 journey authenticates, selects an organization, opens Users and a user detail, performs one owned create/invite, cleans it up, and quits                                                                                                                                                    | Every observation succeeds, cleanup owns only its nonce user, and terminal restoration remains intact                                                                                                                                                      | RD-03 AC-13; 03-04 §Testing Requirements               |

### Completion Evidence

| #     | Evidence                                                 | Required result                                                                                                           | Source            |
| ----- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| EV-01 | Completion gates run from the supported Node 24 workflow | Required root/package verification, structure/docs, packed journey, and clean committed `p1-admin` compatibility all pass | RD-03 AC-13; AR-6 |

## Test Categories

### Specification Tests

| Test file                                                       | ST cases covered                               | Component                       |
| --------------------------------------------------------------- | ---------------------------------------------- | ------------------------------- |
| `packages/sdk/tests/domains/users-contract.spec.test.ts`        | ST-01–ST-02, ST-04–ST-06                       | SDK user runtime contracts      |
| `packages/sdk/tests/type-contracts/users-contract.spec.test.ts` | ST-03 and compile-time portions of ST-04–ST-06 | Focused TypeScript oracle       |
| `packages/cli/tests/commands/user-contract.spec.test.ts`        | ST-07                                          | Current CLI consumer            |
| `packages/cli/tests/admin/user-service.spec.test.ts`            | ST-08–ST-17, ST-35                             | Capability and service boundary |
| `packages/cli/tests/admin/user-workspace.spec.test.ts`          | ST-18–ST-23                                    | Menu/workspace                  |
| `packages/cli/tests/admin/user-dialogs.spec.test.ts`            | ST-24–ST-29                                    | Modal operations                |
| `packages/cli/tests/admin/application.users.spec.test.ts`       | ST-30–ST-34                                    | Workflow and isolation          |
| `docker/admin-playground/tests/admin-cli.e2e.spec.test.mjs`     | ST-36                                          | Packed live journey             |

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

- [ ] All ST-01–ST-36 have concrete specification tests before implementation; EV-01 is completion evidence, not an expected-red test.
- [ ] Every assertion for missing or mismatched behavior is observed red; already-correct preservation assertions have a recorded green baseline.
- [ ] Green implementation changes no ST expectation.
- [ ] Focused implementation and existing regression tests pass.
- [ ] `yarn workspace @portaidentity/sdk verify` passes.
- [ ] `node_modules/@typescript/native/bin/tsc --project packages/sdk/tests/type-contracts/tsconfig.json --noEmit` passes.
- [ ] `yarn workspace @portaidentity/cli verify` passes.
- [ ] `yarn verify` passes before every commit under the current project guidance.
- [ ] `yarn test:structure` and `yarn docs:build` pass.
- [ ] The existing packed Admin UI journey passes on Node 24 LTS.
- [ ] Clean committed `yarn assurance:compat --select p1-admin` passes.
- [ ] Security/protocol harness is recorded N/A only while server, authentication, protocol, and production-security behavior remain unchanged; any such change reactivates the applicable registered harness.
- [ ] No generated, sensitive, server-implementation, dependency, workflow, or unrelated files enter the diff.

# Execution Plan: SDK–Server Contract Truth

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Last Updated**: 2026-09-29 23:57
> **Progress**: 10/52 tasks (19%)
> **CodeOps Artifact Schema**: 1

## Overview

Align `@portaidentity/sdk` with the server Admin API and repair the GDPR export query across four
phases: the server export fix, the reserved slug, the SDK contract corrections (with the CLI and
docs), and integrated verification and delivery. Every phase follows the specification-first
ordering: spec tests, red-phase proof, implementation, green-phase proof, implementation tests,
verify.

**🚨 Update this document after EACH completed task!**

---

## Implementation Phases

| Phase | Title | Tasks |
| --- | --- | --- |
| 1 | Server — GDPR export and user-create ETag | 10 |
| 2 | Server — reserved `new` slug | 7 |
| 3 | SDK contract alignment + CLI + docs | 27 |
| 4 | Integrated verification and delivery | 8 |

**Total: 52 tasks across 4 phases** (no fabricated hour estimates — scope is bounded by the
task-size criteria in the make-plan quality checklist)

> **⚠️ EXECUTION RULE — APPLIES TO EVERY AGENT EXECUTING THIS PLAN:**
>
> The task checkboxes in the phase sections below are the **single source of truth** for progress.
> Every task line appears exactly once in this document. The executing agent MUST:
>
> 1. **On implementation:** mark the task `[~]` with a timestamp —
>    `- [~] 1.1.1 Task description ⏳ (implemented: YYYY-MM-DD HH:MM)`
> 2. **On verify pass:** promote it to `[x]` —
>    `- [x] 1.1.1 Task description ✅ (completed: YYYY-MM-DD HH:MM)`
> 3. **Update the Progress header** (`> **Progress**: X/Y tasks (Z%)`) and the Last Updated stamp
>    after EVERY task — never batch updates. Only `[x]` counts as complete.
> 4. **Resume** by scanning the phase sections top-to-bottom: the first `[~]` task is resumed
>    first, else the first `[ ]` task.
> 5. **On blocker:** mark the task `[!]` and append `Blocked: <short reason>` on the same line.
>    The plan lifecycle is `Ready`, `Executing`, `Done`, or `Blocked`, derived from these markers.
>
> Timestamps come from `date '+%Y-%m-%d %H:%M'` — never invented.

> **Delivery rule:** every commit in this plan goes through the **git-commit skill** (commit) or
> the **git-commit skill in push mode** when a push is authorized. The plan contains no raw git
> commands. Work happens on a feature branch created from an up-to-date `develop`.

---

## Phase 1: Server — GDPR export and user-create ETag

> **Phase baseline tree**: `80c171f3c55cd23a244e969e03c58a676e7d24af`
> **Scope**: strict · **Expected paths**: `packages/server/src/users/gdpr.ts`, `packages/server/src/routes/users.ts`, `packages/server/tests/integration/admin/{gdpr-user-export,users-create-etag}.spec.test.ts` (new), `packages/server/tests/unit/users/gdpr.test.ts`
> **Lenses**: [add-on lenses — informational; activation stays profile-driven]

### Step 1.1: Specification Tests

**Reference**: [03-01](03-01-server-gdpr-export.md) §Changed Query, §Changed Handler · AR-1, AR-17
**Objective**: Pin the real-schema export behavior and the create ETag before changing code.

- [x] 1.1.1 [spec-author] Write specification tests from ST-1, ST-2, ST-3 — `packages/server/tests/integration/admin/gdpr-user-export.spec.test.ts`. Use `truncateAllTables`, `seedBaseData`, `createTestOrganization`, `createTestApplication`, `createTestUser`, `createTestClaimDefinition`, and the custom-claims service/repository `setValue`/`upsertValue` helper. Cover ST-3 through the real admin router, following the router pattern in `packages/server/tests/integration/admin/system-config-api.spec.test.ts`. ✅ (completed: 2026-09-29 23:42)
- [x] 1.1.2 [spec-author] Write the create-ETag spec test from ST-24 — `packages/server/tests/integration/admin/users-create-etag.spec.test.ts`, following the router pattern in `packages/server/tests/integration/admin/system-config-api.spec.test.ts` (substituted admin authority, real PostgreSQL). ✅ (completed: 2026-09-29 23:42)
- [x] 1.1.3 Verify the red phase. Run `yarn docker:up`, then `yarn workspace @portaidentity/server test:integration tests/integration/admin/gdpr-user-export.spec.test.ts` and confirm ST-1/ST-3 fail with `relation "user_claim_values" does not exist`; run `yarn workspace @portaidentity/server test:integration tests/integration/admin/users-create-etag.spec.test.ts` and confirm ST-24 fails on the missing header. Record both failures in the task marks. ✅ (completed: 2026-09-29 23:42; red: 5/5 export failures with `relation "user_claim_values" does not exist`; 3/3 create failures with missing `ETag` header)

**Deliverables**:
- [ ] New spec files exist and fail for the expected reason
- [ ] Red-phase evidence recorded

**Verify**: targeted integration commands above (services running)

---

### Step 1.2: Implementation

**Reference**: [03-01](03-01-server-gdpr-export.md) §Implementation Details · AR-1, AR-17
**Objective**: Correct the SQL and add the missing create ETag.

- [x] 1.2.1 Fix the custom-claim query in `packages/server/src/users/gdpr.ts` to `custom_claim_values ucv JOIN custom_claim_definitions ccd ON ccd.id = ucv.claim_id` with `SELECT ccd.claim_name, ucv.value, ccd.application_id` and `ORDER BY ccd.claim_name`. Update the module JSDoc and the `exportUserData` doc comment to name the real tables (remove the stale `user_claim_values`/`claim_definitions` wording). ✅ (completed: 2026-09-29 23:43)
- [x] 1.2.2 Add `setETagHeader(ctx, 'user', user.id, user.updatedAt)` between the `createUser` call and the response assignment in the `POST /` handler of `packages/server/src/routes/users.ts` (around line 226). ✅ (completed: 2026-09-29 23:43)
- [x] 1.2.3 Verify the green phase: rerun both targeted integration commands from 1.1.3; all ST-1, ST-2, ST-3, ST-24 cases pass. If any spec test fails, fix the implementation, never the test. ✅ (completed: 2026-09-29 23:43; green: 5/5 export, 3/3 create-ETag)

**Deliverables**:
- [ ] `gdpr.ts` query corrected
- [ ] Create route emits the ETag
- [ ] Targeted integration tests green

**Verify**: targeted integration commands above

---

### Step 1.3: Implementation Tests & Hardening

**Reference**: [03-01](03-01-server-gdpr-export.md) §Testing Requirements · AR-1
**Objective**: Keep the failure-path contract and prove no stale table names remain.

- [x] 1.3.1 Keep the mapping tests in `packages/server/tests/unit/users/gdpr.test.ts` passing and add the failure-path case: make one `mockQuery` call reject and assert `exportUserData` propagates the error. If the mock asserts the old SQL text, update only the SQL-string expectation (not behavior expectations) and note it. ✅ (completed: 2026-09-29 23:43; no SQL-text expectation existed; 5/5 unit tests pass)
- [x] 1.3.2 Record the RD-02 R2 disposition: the repository review confirmed that only `packages/server/src/users/gdpr.ts` used the old table names and that all portability hits are manifest JSON keys, not SQL. No mechanical source scan is added; R2 is covered by the corrected query plus the passing real-schema test (ST-1). ✅ (completed: 2026-09-29 23:43; disposition recorded here: corrected query + real-schema ST-1 cover R2; no scanner added)
- [x] 1.3.3 Run `yarn workspace @portaidentity/server test:unit tests/unit/users/gdpr.test.ts` and the two targeted integration files; all pass. ✅ (completed: 2026-09-29 23:43; unit 5/5, integration 8/8)
- [x] 1.3.4 Full server verification: `yarn workspace @portaidentity/server verify`. ✅ (completed: 2026-09-29 23:57; unit 3749, integration 499, e2e 133, pentest 273)

**Deliverables**:
- [ ] Failure-path unit test passing
- [ ] Server verification passing

**Verify**: `yarn workspace @portaidentity/server verify`

---

## Phase 2: Server — reserved `new` slug

> **Phase baseline tree**: _(recorded by the exec-plan skill)_
> **Lenses**: [informational]

### Step 2.1: Specification Tests

**Reference**: [03-02](03-02-server-reserved-slug.md) §Testing Requirements · AR-11
**Objective**: Pin the reservation and the no-false-positive rule.

- [ ] 2.1.1 [spec-author] Add cases to `packages/server/tests/unit/organizations/slugs.test.ts`: ST-4 (`validateSlug('new')` → `isValid: false` with an error naming the reservation) and ST-5 (`validateSlug('new-york')` and `validateSlug('renew')` → `isValid: true`); extend the expected reserved-word list and update the `RESERVED_SLUGS.size` assertion from 22 to 23 in this task.
- [ ] 2.1.2 Verify the red phase: `yarn workspace @portaidentity/server test:unit tests/unit/organizations/slugs.test.ts`; ST-4 fails. Record the failure.

**Deliverables**:
- [ ] New unit cases present and failing for the expected reason

**Verify**: targeted unit command above

---

### Step 2.2: Implementation

**Reference**: [03-02](03-02-server-reserved-slug.md) §Changed Constant · AR-11
**Objective**: Reserve the word.

- [ ] 2.2.1 Add `'new'` to the "Application paths" group in `RESERVED_SLUGS` (`packages/server/src/organizations/slugs.ts`) with a one-line comment explaining that `new` is a reserved create-action segment. Update the module JSDoc example list if needed.
- [ ] 2.2.2 Verify the green phase: rerun the targeted unit command; ST-4 and ST-5 pass.
- [ ] 2.2.3 Regression sweep: `yarn workspace @portaidentity/server test:unit tests/unit/organizations/` and confirm no existing slug or service test regresses.

**Deliverables**:
- [ ] Reserved word added
- [ ] Organization unit suite green

**Verify**: `yarn workspace @portaidentity/server test:unit tests/unit/organizations/`

---

### Step 2.3: Implementation Tests & Hardening

**Reference**: [03-02](03-02-server-reserved-slug.md) §Error Handling · AR-11
**Objective**: Cover the API-level boundary where the slug is submitted.

- [ ] 2.3.1 Add or extend an integration/unit case that exercises `organizationSlugSchema` (or the create route) with `slug: 'new'` answering `400`. Place it with the existing organization validator tests; if none exists, add it to `packages/server/tests/unit/organizations/slugs.test.ts` through `organizationSlugSchema.safeParse`. Mark this as the implementation test.
- [ ] 2.3.2 Full server verification: `yarn workspace @portaidentity/server verify`.

**Deliverables**:
- [ ] Boundary case passing
- [ ] Server verification passing

**Verify**: `yarn workspace @portaidentity/server verify`

---

## Phase 3: SDK contract alignment + CLI + docs

> **Phase baseline tree**: _(recorded by the exec-plan skill)_
> **Lenses**: [informational]

### Step 3.1: Specification Tests

**Reference**: [03-03](03-03-sdk-organizations.md), [03-04](03-04-sdk-users-claims-roles.md),
[03-05](03-05-sdk-history-two-factor-cli.md) · AR-2…AR-10, AR-12, AR-14, AR-15
**Objective**: Pin every corrected SDK and CLI contract before code changes.

- [ ] 3.1.1 [spec-author] Organizations cases ST-6–ST-10 — `packages/sdk/tests/domains/organizations.test.ts`: slug result shape, 400 error path, `sortBy`/`sortOrder` forwarding, update ETag, history parameters and envelope. Add the type-level red oracles for `SlugValidationResult` and the renamed `ListParams` keys in `packages/sdk/tests/type-contracts/common-contract.spec.test.ts` and list that file in `packages/sdk/tests/type-contracts/tsconfig.json`.
- [ ] 3.1.2 [spec-author] Users cases ST-11, ST-12, ST-14 — `packages/sdk/tests/domains/users.test.ts`: create/update ETag wrappers, history parameter mapping.
- [ ] 3.1.3 [spec-author] Standalone users cases ST-13, ST-15 — `packages/sdk/tests/domains/standalone-users.test.ts`: update ETag, history envelope unwrap (ST-15 is reclassified as a pinning test; it already passes pre-change).
- [ ] 3.1.4 [spec-author] 2FA case ST-22 — `packages/sdk/tests/domains/two-factor.test.ts`: policy ETag plus a second call forwarding the returned token as `If-Match`. ST-16/ST-17 are withdrawn with the application/client deferral; no app/client spec tests are written.
- [ ] 3.1.5 [spec-author] Claims and roles cases ST-18–ST-21 and ST-28 — `packages/sdk/tests/domains/custom-claims.test.ts`, `packages/sdk/tests/domains/user-roles.test.ts`: value routes (including `getValue`), definition types, effective permissions, and the documented non-filtering of `getValuesForUser`.
- [ ] 3.1.6 [spec-author] Export typing case ST-23 — `packages/sdk/tests/type-contracts/users-contract.spec.test.ts` (extend the exact-type oracle for `UserDataExport`).
- [ ] 3.1.7 [spec-author] CLI cases ST-25–ST-27 — `packages/cli/tests/commands/user.test.ts`: rewrite the `claims` block to the `customClaims` surface and required `--app`.
- [ ] 3.1.8 Verify the red phase: `yarn workspace @portaidentity/sdk test`, `yarn workspace @portaidentity/sdk typecheck`, and `yarn workspace @portaidentity/cli test tests/commands/user.test.ts`; record which cases fail. The type-level oracles are red under typecheck (the new types do not exist yet); runtime pinning cases (ST-5, ST-7, ST-15) are expected green and are recorded as such; the CLI/typecheck failures are expected (removed types still present pre-change). Do not implement yet.

**Deliverables**:
- [ ] Spec cases added across SDK and CLI suites
- [ ] Red-phase evidence recorded

**Verify**: `yarn workspace @portaidentity/sdk test` (expected red)

---

### Step 3.2: Implementation — types and organizations

**Reference**: [03-03](03-03-sdk-organizations.md) §Implementation Details · AR-2, AR-3
**Objective**: Correct shared parameter types and the organizations domain.

- [ ] 3.2.1 Update `packages/sdk/src/types/common.ts`: rename `ListParams.sort`/`order` to `sortBy`/`sortOrder`; add `HistoryParams`; keep the index signature so entity-specific filters still compile.
- [ ] 3.2.2 Add `SlugValidationResult` to `packages/sdk/src/types/organizations.ts`; export it plus `HistoryParams` from `packages/sdk/src/types/index.ts`. Remove the old `SlugValidation` export from `packages/sdk/src/domains/index.ts` and from the public barrel `packages/sdk/src/index.ts`.
- [ ] 3.2.3 Update `packages/sdk/src/domains/organizations.ts`: `update` → `ETagResponse<Organization>` via `unwrapWithEtag`; `validateSlug` → `SlugValidationResult`; `getHistory` → `HistoryParams` mapped to `limit`/`after`/`event_type`, returning `HistoryResult`.
- [ ] 3.2.4 Verify the green phase for ST-6–ST-10 and run `yarn workspace @portaidentity/sdk typecheck`; fix fallout from the renamed types in other domains before proceeding (mechanical call-site updates only).

**Deliverables**:
- [ ] Shared types corrected
- [ ] Organizations domain green and typechecking

**Verify**: `yarn workspace @portaidentity/sdk test tests/domains/organizations.test.ts && yarn workspace @portaidentity/sdk typecheck`

---

### Step 3.3: Implementation — users, claims, roles

**Reference**: [03-04](03-04-sdk-users-claims-roles.md) §Implementation Details · AR-5, AR-6, AR-7, AR-8, AR-9, AR-15, AR-17
**Objective**: Correct the user, claim, roles, and export surfaces and remove the phantom domain.

- [ ] 3.3.1 Update `packages/sdk/src/domains/users.ts`: create/update return `ETagResponse<User>`; org-scoped `getHistory` accepts `HistoryParams`; `exportData` returns `UserDataExport` and the old `UserExportData` alias is removed. Add `UserDataExport` to `packages/sdk/src/types/users.ts`.
- [ ] 3.3.2 Replace `packages/sdk/src/types/user-claims.ts` with `UserClaimValue` and `UserClaimWithDefinition`; update `packages/sdk/src/types/custom-claims.ts` to `CustomClaimDefinition`/`CreateCustomClaimInput`/`UpdateCustomClaimInput` and remove the stale same-named `UserClaimValue`/`SetUserClaimInput`; export all through `types/index.ts`. Tasks 3.3.2–3.3.5 are one atomic edit — do not run an intermediate gate between them.
- [ ] 3.3.3 Update `packages/sdk/src/domains/custom-claims.ts`: adopt the new definition types and add the four value methods with the exact routes and `applicationId` signatures from 03-04.
- [ ] 3.3.4 Add `getEffectivePermissions` to `packages/sdk/src/domains/user-roles.ts`.
- [ ] 3.3.5 Delete `packages/sdk/src/domains/user-claims.ts` and its test file; remove `UserClaimsDomain`/`createUserClaimsDomain`/`UserClaimEntry`/`SetUserClaimValueInput` from `domains/index.ts`, `types/index.ts`, `packages/sdk/src/client.ts`, and the public barrel `packages/sdk/src/index.ts`; refresh the `client.ts` module docstring namespace count.
- [ ] 3.3.6 Update `packages/sdk/src/agent.ts`: `users.create` → `ETagResponse<User>`, `users.exportData` → `UserDataExport`, `customClaims.*` types, and add `customClaims.getValuesForUser`/`setValue`/`deleteValue` and `userRoles.getEffectivePermissions` entries.
- [ ] 3.3.7 Verify the green phase for ST-11–ST-21 and ST-23: `yarn workspace @portaidentity/sdk test`; then `yarn workspace @portaidentity/sdk typecheck`.
- [ ] 3.3.8 Refresh any type-contract oracles that pin changed keys (`packages/sdk/tests/type-contracts/`) and the `client.test.ts` namespace list that must no longer contain `userClaims`. Repair `packages/sdk/tests/type-compatibility/types.test.ts` (server import paths into `packages/server/src`, renamed `CustomClaimDefinition`) and register it in a typechecked program — either add it to `packages/sdk/tests/type-contracts/tsconfig.json` or move its comparison there — then confirm with `yarn workspace @portaidentity/sdk typecheck` that the comparison actually compiles.

**Deliverables**:
- [ ] User/claims/roles/export corrections complete
- [ ] Phantom domain removed
- [ ] SDK test suite and typecheck green

**Verify**: `yarn workspace @portaidentity/sdk verify`

---

### Step 3.4: Implementation — history, 2FA, CLI, docs

**Reference**: [03-05](03-05-sdk-history-two-factor-cli.md) §Implementation Details · AR-4, AR-10, AR-12, AR-14
**Objective**: Finish the history and 2FA contracts, fix the CLI, and document the migration.

- [ ] 3.4.1 Do not change `packages/sdk/src/domains/applications.ts` or `clients.ts`: application/client history is deferred to a separate server defect (their routes answer `500`). Confirm no spec test pins them.
- [ ] 3.4.2 Update `packages/sdk/src/domains/two-factor.ts`: `setPolicy(orgId, policy, etag?)` returns `ETagResponse<TwoFactorPolicyResult>` via `unwrapWithEtag` and sends `etagHeaders(etag)`.
- [ ] 3.4.3 CLI consumer alignment: (a) `user-claim.ts` — required `--app`, `customClaims.getValuesForUser`/`getValue`/`setValue`/`deleteValue`, print `definition.id`/`definition.claimName`/`value.value`; (b) `app-claim.ts` — `--name`→`claimName`, `--type`→`claimType`, drop `--slug`/`applicationId`, print `claimName`/`claimType`; (c) `org.ts`/`user.ts` — unwrap `ETagResponse` from update/create; (d) `org.ts`/`client.ts`/`app.ts` — adapt history output to `HistoryResult`; (e) `admin/user-service.ts` and `admin/organization-service.ts` — unwrap `.data` for user create/update, organization update, and 2FA policy; (f) `test-harness/consumers/tenant-admin-sdk-probe.mjs` — read `.data.id` from `users.update`.
- [ ] 3.4.4 Verify the green phase: `yarn workspace @portaidentity/sdk test`, `yarn workspace @portaidentity/cli test tests/commands/`, then `yarn workspace @portaidentity/cli typecheck`.
- [ ] 3.4.5 Update `packages/sdk/CHANGELOG.md` under `Unreleased` with the changed/removed/added list and a short migration example (per AR-10). Do not touch version constants.
- [ ] 3.4.6 Update `docs/guide/sdk.md`: sort parameter names, history parameters/envelope for the supported methods, write-ETag behavior (including the 2FA `etag` argument), the `customClaims` value methods and their documented non-filtering, and the removed `userClaims`/old type names. Update the tool counts in `docs/guide/sdk-agent.md` and `packages/sdk/README.md`, and add the required `--app` to `docs/cli/users.md` and `docs/concepts/custom-claims.md`.
- [ ] 3.4.7 Update `docs/api/organizations.md`: add the slug-validation section (400 vs 200 semantics), the reserved `new` word, UUID access for an existing tenant, and the direct-database slug-change note. Update `docs/cli/applications.md` for the claim-definition fields. Run `yarn docs:build`.

**Deliverables**:
- [ ] Application/client history and 2FA policy contracts corrected
- [ ] CLI operational against real routes
- [ ] Changelog and docs updated; docs build passes

**Verify**: `yarn workspace @portaidentity/sdk verify && yarn workspace @portaidentity/cli verify && yarn docs:build`

---

## Phase 4: Integrated verification and delivery

> **Phase baseline tree**: _(recorded by the exec-plan skill)_
> **Lenses**: [informational]

### Step 4.1: Cross-workspace verification

**Reference**: [RD-01](../../requirements/RD-01-sdk-admin-contract-alignment.md),
[RD-02](../../requirements/RD-02-gdpr-export-schema-repair.md) · AR-16
**Objective**: Prove the three workspaces agree and nothing regressed.

- [ ] 4.1.1 Run `yarn docker:up`, then `yarn verify`; all structure tests and Turbo verification for server, SDK, and CLI must pass.
- [ ] 4.1.2 Run `yarn test:integration`; all integration suites, including the new export and create-ETag specs, must pass.
- [ ] 4.1.3 End-to-end confirmation of the issue acceptance criteria: with the dev stack running, exercise (a) `users.create` → `users.update` at the HTTP layer, reusing the created ETag, and (b) the export endpoint for a user with and without claims, through the integration specs in 4.1.2; record the evidence. If a manual curl-level proof is chosen, use a scratch database and remove it afterwards.
- [ ] 4.1.4 Run `yarn docs:build` if it was not run in 3.4.7 after the last docs edit.
- [ ] 4.1.5 Run the registered `tenant-admin` selector of `yarn assurance:compat` from a clean committed revision (use the selector syntax documented by the assurance CLI) and record the result. This is the mandated compatibility gate for the SDK contract change; the retained probe consumes `users.update` and must pass.

**Deliverables**:
- [ ] `yarn verify` green
- [ ] `yarn test:integration` green
- [ ] Docs build green
- [ ] Registered `yarn assurance:compat` tenant-admin selector green

**Verify**: `yarn docker:up && yarn verify && yarn test:integration && yarn docs:build && yarn assurance:compat`

---

### Step 4.2: Cleanup and delivery

**Reference**: `AGENTS.md` prime directive · AR-16
**Objective**: Leave the machine clean and deliver the change.

- [ ] 4.2.1 Cleanup: stop the development stack with `yarn docker:down` (only if this session started it), drop any scratch database created for acceptance evidence, and confirm `docker ps -a`, `docker network ls`, and `docker volume ls` show nothing task-created. Never remove resources the session did not create.
- [ ] 4.2.2 Deliver through the **git-commit skill in push mode** with three Conventional Commits — for example `fix(server): query the real custom-claim tables in the GDPR export`, `fix(sdk): align admin domain contracts with the server API`, and `docs(sdk): document the contract corrections and reserve the new slug` (the executor may split the SDK and CLI changes differently as long as each commit is coherent and verified). Open a pull request to `develop` that closes #159, #160, and #161.
- [ ] 4.2.3 Post-completion: open the follow-up server defect for application/client history (their routes answer `500`; the SDK guards also drop pagination metadata), update the feature roadmap row to Done, and confirm the issue closures; the exec-plan skill owns the post-completion re-analysis.

**Deliverables**:
- [ ] Clean environment evidence recorded
- [ ] Pull request to `develop` opened with the three issue references

**Verify**: cleanup evidence + PR link in the execution marks

---

## Dependencies

```
Phase 1 (export + create ETag)
    ↓
Phase 2 (reserved slug)
    ↓
Phase 3 (SDK + CLI + docs)
    ↓
Phase 4 (integrated verification + delivery)
```

Phase 2 is independent of Phase 1 and may run in either order. Phase 3 must follow Phase 1 only
for the create-ETag server emission (ST-24/ST-11). Phase 4 requires every prior phase complete.
Application/client history is not part of any phase; it is tracked as a follow-up server defect.

---

## Success Criteria

**Feature is complete when:**

1. ✅ All phases completed
2. ✅ All verification passing (`yarn verify`, `yarn test:integration`, `yarn docs:build`, registered
   `yarn assurance:compat` tenant-admin selector)
3. ✅ No warnings/errors
4. ✅ No dead code — the deleted `userClaims` domain leaves no unused exports or imports
5. ✅ Security hardened — permissions documented on every new method; the export stays parameterized
   and organization-scoped; no new input path is introduced unvalidated
6. ✅ Documentation updated (`docs/guide/sdk.md`, `docs/api/organizations.md`, `packages/sdk/CHANGELOG.md`)
7. ✅ Code reviewed per the repository quality policy
8. ✅ Post-completion project re-analysis (handled by the exec-plan skill)

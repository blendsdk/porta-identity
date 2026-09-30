# Preflight Report: SDK–Server Contract Truth (plan set)

> **Status**: ✅ PREFLIGHT PASSED — 24/24 findings resolved (all Option A), fixes applied, iteration 2 verified
> **Iteration**: 2 (fix verification; iteration 1 = original 13-dimension scan)
> **Artifact**: Implementation plan at `codeops/features/sdk-server-contract-drift/plans/sdk-contract-truth/` (12 documents; audit target)
> **Context documents**: `codeops/features/sdk-server-contract-drift/requirements/` (RD-01, RD-02, README) — read to test claims, not audited
> **Codebase Grounded**: 45+ source/test/config files examined; ~65 references verified against `develop` @ `079c56c9`
> **Scope mode**: strict (normal mode; no `--auto-design`, no `--explore-scope`)
> **Last Updated**: 2026-09-29

### Same-agent bias

The artifact was authored before this session; this scan is independent of the authoring context. No same-session bias note required. Standard-first checks: the audit cites `packages/server/**` and `packages/**` source directly; no external RFC conformance claim is made by this plan.

### Codebase Context Summary

**Repository:** porta-identity — TypeScript ESM monorepo (Yarn workspaces + Turbo), Node 22/24.
**Tech Stack (observed):** Koa + `@koa/router` server, `oidc-provider`, PostgreSQL + node-pg-migrate, Redis, Vitest (unit/integration/e2e/pentest projects), ESLint + TypeScript 7, VitePress docs.
**Architecture:** `packages/server` exposes an admin API under `/api/admin` with `{ data }` envelopes, weak ETags (`W/"<md5-16>"` from `entityType:id:updatedAt`), and `{ data, hasMore, nextCursor }` history envelopes; `packages/sdk` wraps it in domain namespaces over an `HttpTransport`; `packages/cli` consumes the SDK for both classic commands and the embedded `porta admin` TUI.
**Key files examined:** `packages/server/src/users/gdpr.ts`, `routes/{users,organizations,custom-claims,user-roles,two-factor-admin,applications,clients}.ts`, `organizations/{slugs,validators,service,repository}.ts`, `lib/{entity-history,etag}.ts`, `custom-claims/{types,repository,service}.ts`, `migrations/007_custom_claims.sql`, `migrations/009_audit_log.sql`; `packages/sdk/src/{index,client,agent}.ts`, `domains/*.ts`, `types/*.ts`, `package.json`, `tsconfig.json`, `tests/type-compatibility/types.test.ts`, `tests/type-contracts/tsconfig.json`, `tests/domains/*`; `packages/cli/src/commands/*.ts`, `admin/{user-service,organization-service}.ts`; `test-harness/consumers/tenant-admin-sdk-probe.mjs`; docs referenced by the plan.

### Summary by Dimension

| # | Dimension | Findings | Highest Severity |
|---|---|---|---|
| 1 | Ambiguities | 3 | 🟠 |
| 2 | Implicit Assumptions | 3 | 🟠 |
| 3 | Logical Contradictions | 5 | 🟡 |
| 4 | Completeness Gaps | 6 | 🔴 |
| 5 | Dependency Issues | 2 | 🟠 |
| 6 | Feasibility Concerns | 2 | 🔴 |
| 7 | Testability | 5 | 🟠 |
| 8 | Security Blind Spots | 0 (no authorized behavior change) | — |
| 9 | Edge Cases | 2 | 🟡 |
| 10 | Scope Creep Indicators | 0 | — |
| 11 | Ordering & Sequencing | 2 | 🟠 |
| 12 | Consistency | 7 | 🟠 |
| 13 | Codebase Alignment | 8 | 🔴 |

### Summary by Severity

| Severity | Count | Status |
|---|---|---|
| CRITICAL | 1 | resolved — fix applied and verified |
| MAJOR | 9 | resolved — fixes applied and verified |
| MINOR | 12 | resolved — fixes applied and verified |
| OBSERVATION | 2 | resolved — fixes applied and verified |

**Verification state:** ✅ all findings resolved. Iteration 2 verified every applied fix and corrected residual stale phrases from partial fixes (AR-4 note, `02-current-state` reserved-slug and claims paragraphs, `00-index`/`01-requirements`/`03-04` application-scoping wording, RD-01 static-route wording, `03-01` ST reference). No new critical/major finding. The plan's own execution gates (`yarn verify`, `yarn test:integration`, `yarn docs:build`, `yarn assurance:compat`) remain the delivery-time verification.

---

## PF-001: Application/client history cannot be fixed SDK-side [🔴 CRITICAL]

**Dimension:** 6 Feasibility · 4 Completeness · 13 Codebase Alignment
**Location:** `02-current-state.md` §Code Analysis (lines 72–83); `03-05-sdk-history-two-factor-cli.md` §Current Architecture (22–26); `00-ambiguity-register.md` AR-4 (line 34); `07-testing-strategy.md` ST-16/ST-17 (67–68); `99-execution-plan.md` 3.1.4, 3.4.1.
**Codebase Evidence:** `packages/server/src/lib/entity-history.ts:57-60` maps only `organization` and `user`; `:132-135` throws `Unsupported entity type for history`. `packages/server/src/routes/applications.ts:317-325` and `routes/clients.ts:436-443` pass `'application'`/`'client'` with no `try/catch` → 500 via the global handler. `packages/server/migrations/009_audit_log.sql:5-17` has only `organization_id`/`user_id` columns; app/client events are recorded in `metadata` keys (`applications/service.ts:124-128`, `clients/service.ts:253-264`).
**The Problem:** The plan states the server answers `{ data, hasMore, nextCursor }` for applications/clients and that only the SDK guard rejects it. In reality both server endpoints throw before answering; an SDK-only change cannot make them work. ST-16/ST-17 use mock transports, so the green phase would pin a contract the real server cannot satisfy — the mock-hides-defect failure mode that motivated RD-02.

**Options:**

| Option | Description | Pros | Cons |
|---|---|---|---|
| A | Descope application/client `getHistory` from this plan; correct `02-current-state`/AR-4/RD-01 R3 wording; record the server defect (plus the SDK guard) as a separate issue | Smallest viable; no false closure; no new machinery; matches "no schema migration" | R3's "every `getHistory` method" becomes 5 of 7 |
| B | Add server-side application/client history support (audit mapping/columns, writer and backfill, real-schema tests) | True full drift closure | Migration + audit-writer work; explicit complexity escalation the register says is unnecessary; touches versioned audit data |

**Recommendation:** Option A — the smallest truthful fix; B requires explicit scope approval (Complexity Escalation Gate) because it adds schema/writer surface the plan excludes.

**User Decision:** Resolved — User chose Option A (descope; separate server issue; correct analysis)

---

## PF-002: SDK public-surface migration set is incomplete and self-contradictory [🟠 MAJOR]

**Dimension:** 4 Completeness · 13 Codebase Alignment · 11 Ordering
**Location:** `99-execution-plan.md` 3.2.2 (line 203), 3.3.2/3.3.5 (221, 224); `03-04-sdk-users-claims-roles.md` lines 37 vs 51–75 and 201; `00-index.md` Related Files (110–119).
**Codebase Evidence:** `packages/sdk/src/index.ts:35,46` re-export `UserClaimsDomain` and `SlugValidation` from `domains/index.js` — no task lists this file, so removing them from `domains/index.ts` breaks the public barrel (TS2305) at gate 3.2.4. `packages/sdk/src/types/custom-claims.ts:42-53` already exports `UserClaimValue`/`SetUserClaimInput` (re-exported at `types/index.ts:74-81`) while the plan adds a same-named new type in `types/user-claims.ts`; the plan never says to remove the old copies (duplicate barrel export). `03-04:37` says delete `types/user-claims.ts` while `:51-75` and task 3.3.2 put the new types there. Tasks 3.3.2–3.3.5 leave a broken intermediate barrel with no verify step between.
**The Problem:** Executing the tasks as written fails the SDK's own typecheck gates and leaves ambiguity about which file hosts the claim value types.

**Options:**

| Option | Description | Pros | Cons |
|---|---|---|---|
| A | Enumerate exact removals/additions in 3.2.2 and 3.3.5: `src/index.ts`, `domains/index.ts`, `types/index.ts`, old `UserClaimValue`/`SetUserClaimInput` in `custom-claims.ts`; fix `03-04:37` to delete only `domains/user-claims.ts`; mark 3.3.2–3.3.5 atomic | Restores a passing gate; removes the contradiction | Plan edit only |
| B | Rely on typecheck gates to surface omissions | No plan edit | Gates 3.2.4/3.3.7 fail mid-phase; contradiction remains |

**Recommendation:** Option A.

**User Decision:** Resolved — User chose Option A

---

## PF-003: Return-type changes break omitted CLI and admin consumers [🟠 MAJOR]

**Dimension:** 13 Codebase Alignment (Impact Blindness) · 2 Implicit Assumptions
**Location:** `99-execution-plan.md` 3.4.3/3.4.4; `00-index.md` Related Files (line 123); `03-05` §Integration Points (88–92); `02-current-state.md` line 35.
**Codebase Evidence:** Compile-time breaks from `ETagResponse`/`HistoryResult`: `packages/cli/src/commands/org.ts:258-271` (`updated.name`), `:377-392` (`history.length/.map`); `commands/user.ts:154-170` (`user.email`), `:360-372` (`updated.email`); `commands/client.ts:472-486`; `commands/app.ts:329-344`. Silent runtime breaks (validators take `unknown`, typecheck blind): `packages/cli/src/admin/user-service.ts:621,645` (`userListItem(await create/update)`), `admin/organization-service.ts:611,639,666` (`validateOrganizationSettings`/policy check) → the Admin TUI reports `outcome-unknown`. Existing tests mock bare entities (`cli/tests/admin/user-service.spec.test.ts:514,597,625`, `organization-service.impl.test.ts`), so `yarn verify` stays green.
**The Problem:** The plan only tasks `user-claim.ts`. As written, the CLI typecheck gate 3.4.4 cannot pass, and the embedded Admin UI's user-create/update, org settings, and 2FA-policy mutations silently regress even after `yarn verify` passes.

**Options:**

| Option | Description | Pros | Cons |
|---|---|---|---|
| A | Add a CLI consumer-alignment task naming all seven files plus their tests; unwrap `.data` in admin services and add impl tests feeding wrappers | Restores passing gates and protects runtime behavior | Adds ~1 plan task |
| B | Document them as "mechanical fallout" and let gates find them | Shorter plan | Silent admin regressions survive all verification |

**Recommendation:** Option A.

**User Decision:** Resolved — User chose Option A

---

## PF-004: Claim-definition rename breaks `porta app claim` (code, tests, docs) [🟠 MAJOR]

**Dimension:** 13 Codebase Alignment (Impact Blindness) · 4 Completeness
**Location:** `99-execution-plan.md` 3.4.3; `03-04` §Proposed Changes (40–42); `00-index.md` line 123.
**Codebase Evidence:** `packages/cli/src/commands/app-claim.ts:75-95,119-141,168-180,210-219` sends `{ applicationId, name, slug, valueType }` and prints `claim.name/slug/valueType`; registered at `commands/app.ts:20,359`. Server `createDefinitionSchema` requires `claimName`/`claimType` (`routes/custom-claims.ts:39-45`), so the command already 400s today. Tests: `packages/cli/tests/commands/app.test.ts:416-446`; docs: `docs/cli/applications.md:178-211`. After the rename it cannot typecheck (old types removed).
**The Problem:** The plan fixes the sibling `user-claim.ts` but omits the definition-side CLI, which shares the same phantom contract and will break the CLI build.

**Options:**

| Option | Description | Pros | Cons |
|---|---|---|---|
| A | Include `app-claim.ts`, `app.test.ts`, and `docs/cli/applications.md` in the CLI task; map `--name`→`claimName`, `--type`→`claimType`, drop the bogus `slug`/`applicationId` payload fields | Closes a real broken CLI surface with the same root cause | Modest extra work |
| B | Defer to a separate issue | Smaller plan | CLI typecheck still fails (deferral needs aliases, forbidden by AR-10) — not viable |

**Recommendation:** Option A (only viable path under AR-10).

**User Decision:** Resolved — User chose Option A

---

## PF-005: `twoFactor.setPolicy` cannot send `If-Match` despite returning an ETag [🟠 MAJOR]

**Dimension:** 9 Edge Cases · 4 Completeness
**Location:** `03-05` lines 64–68, 110; RD-01 R4 and AC1.
**Codebase Evidence:** Server `PUT /organizations/:orgId/two-factor/policy` honors `If-Match` (`routes/two-factor-admin.ts:328`) and emits a fresh ETag (`:360`). The plan's signature `setPolicy(orgId, policy): Promise<ETagResponse<TwoFactorPolicyResult>>` (`03-05:67`) has no `etag` parameter; the current SDK signature is the same (`packages/sdk/src/domains/two-factor.ts:33,72-76`). `etagHeaders()` already exists (`domains/helpers.ts:117-120`).
**The Problem:** RD-01 R4/AC1 require the next `If-Match` write to succeed without a re-read. For 2FA the returned token can never be passed back, so the acceptance criterion and the 03-05 stale-`If-Match` error row are unreachable.

**Options:**

| Option | Description | Pros | Cons |
|---|---|---|---|
| A | Add `etag?: string` to `setPolicy`, send `etagHeaders(etag)`, and add an ST case performing the second `If-Match` call with the returned token | Makes AC1 real; mirrors every other update method | One-line signature plus one ST case |
| B | Drop the 2FA If-Match claim and 409 row from RD-01/03-05 | No code change | An authorized acceptance criterion is silently weakened |

**Recommendation:** Option A.

**User Decision:** Resolved — User chose Option A

---

## PF-006: `new`-slug rationale and operator remediation do not match the codebase [🟠 MAJOR]

**Dimension:** 2 Implicit Assumptions · 3 Logical Contradictions · 9 Edge Cases
**Location:** `00-ambiguity-register.md` AR-11 (18, 48, 60); `03-02-server-reserved-slug.md` lines 9, 25–27, 39, 49–52, 65; `02-current-state.md` lines 118–120, 176; `99-execution-plan.md` 2.2.1.
**Codebase Evidence:** The update schema accepts only `name`, `defaultLocale`, `defaultLoginMethods`, `branding` (`routes/organizations.ts:70-75`); `FIELD_TO_COLUMN` has no `slug` (`organizations/repository.ts:185-196`); CLI `org update` has no slug option (`cli/src/commands/org.ts:227-242`). No static `/organizations/new` route exists anywhere in the active tree (the GUI workspace is retired; `porta admin` is a terminal app).
**The Problem:** AR-11/03-02 promise an existing tenant named `new` can be "renamed through the ordinary update path"; no such path exists, so the required operator documentation would describe an impossible procedure. The `RESERVED_SLUGS` comment the plan adds preserves a stale shadowing rationale. The reservation itself is authorized and harmless.

**Options:**

| Option | Description | Pros | Cons |
|---|---|---|---|
| A | Correct the plan text: UUID access works; no Admin API slug-rename exists (direct DB change or delete/recreate if acceptable); use a durable rationale (reserved control word / future static routes) in the code comment and docs | Truthful docs; validation-only stays | None material |
| B | Add slug rename to the update path | Full operator path | New validation/uniqueness/cache/audit work; contradicts RD-01 "Won't Have: server route changes"; needs escalation |

**Recommendation:** Option A.

**User Decision:** Resolved — User chose Option A

---

## PF-007: The claimed claim-type oracle is dead; promised type oracles are unwired [🟠 MAJOR]

**Dimension:** 7 Testability · 5 Dependency Issues · 13
**Location:** `03-04` Integration Points (203–206); `99-execution-plan.md` 3.3.8; `07-testing-strategy.md` lines 117, 119.
**Codebase Evidence:** `packages/sdk/tsconfig.json` includes only `src` and excludes `tests`; `yarn workspace @portaidentity/sdk typecheck` runs that plus `tests/type-contracts/tsconfig.json`, whose explicit include list omits `../type-compatibility/types.test.ts`. That file imports `../../../../src/custom-claims/types.js` (resolves to a nonexistent repo-root `src/`) and `ClaimDefinition`, which the server module does not export (it exports `CustomClaimDefinition`). Vitest erases type-only imports and `expectTypeOf` is compile-time, so the test can never fail. The promised exact-key oracles for `ListParams`, `HistoryParams`, and `CustomClaimDefinition` name no included file.
**The Problem:** The plan claims the server↔SDK structural comparison "stays enforced" and "will pin every field"; it never has. Renaming the import in that file changes nothing, and R6 would ship with no effective field-level oracle.

**Options:**

| Option | Description | Pros | Cons |
|---|---|---|---|
| A | Repair the file (paths → `../../../server/src/...`, `CustomClaimDefinition`) and register it in a typechecked program, or move the comparison into an already-included `tests/type-contracts/` file; add the other promised oracles with explicit include entries | Restores real enforcement; least new art | Touches test config |
| B | Drop the file and the enforcement claims; rely on domain tests | Smallest | R6 type truthfulness gets no structural pin |

**Recommendation:** Option A.

**User Decision:** Resolved — User chose Option A

---

## PF-008: The mandatory "fails pre-change" red gate is unsatisfiable for several ST cases [🟠 MAJOR]

**Dimension:** 7 Testability · 3 Logical Contradictions
**Location:** `07-testing-strategy.md` lines 89–92, 155; ST-5/6/7/8/15; `99-execution-plan.md` 3.1.8; `01-requirements.md` line 42 (AC8); `02-current-state.md` line 82 vs AR-14 line 54.
**Codebase Evidence:** Pre-change `validateSlug` returns the raw server body (`sdk/src/domains/organizations.ts:84-87`), so a mock returning `{ isValid:false, error }` makes ST-6 pass. ST-7 (400 → `PortaValidationError`) is transport behavior already covered (`tests/transport/node-transport.test.ts`), and the domain adds no status handling. ST-8 passes because `toQueryParams` forwards `sortBy`/`sortOrder` verbatim (`domains/helpers.ts:125-140`). ST-15 is already pinned by `tests/domains/standalone-users.test.ts:70-97` (contradicting `02-current-state.md:82`'s "unpinned by tests"). ST-5 is a regression case. AC1's "each proven by a test that fails on the pre-change code" also literally covers RD-01 AC9 (documentation), which no test can prove.
**The Problem:** The plan's non-negotiable red-phase rule and RD-01 AC8 cannot hold as written; the real defects for R1/R2 are type-level (`SlugValidation.available` vs `isValid`, `sort`/`order` names), so runtime-only spec tests are vacuous.

**Options:**

| Option | Description | Pros | Cons |
|---|---|---|---|
| A | Reclassify ST-5 as regression, ST-7/ST-15 as pinning tests, and convert ST-6/ST-8 to type-level red oracles (exact-type/`@ts-expect-error`), recording red evidence from `yarn typecheck`; scope AC8's wording to functional criteria and docs verification to `docs:build` | Truthful red evidence; pins the actual defects | Plan/test-strategy edits |
| B | Amend the mandatory rule to "red or paired with a red-capable oracle" without adding type oracles | Smaller edit | R1/R2 still have no failing oracle |

**Recommendation:** Option A (with B's wording fix where the rule is absolute).

**User Decision:** Resolved — User chose Option A

---

## PF-009: Retained compat probe breaks and the mandated `assurance:compat` run is omitted [🟠 MAJOR]

**Dimension:** 13 (Dependency Reality, Migration & Compatibility) · 7
**Location:** `99-execution-plan.md` Phase 4 (271–281); AR-16 (23, 58); `02-current-state.md` line 158.
**Codebase Evidence:** `test-harness/consumers/tenant-admin-sdk-probe.mjs:23-27` does `const updated = await client.users.update(...); targetIds = [updated.id]`. It is invoked by `test-harness/assurance/tests/packed-tenant-admin.impl.test.ts:92,101` and `test-harness/assurance/compat/tenant-admin-live.ts:149`; the live driver validates `targetIds` as non-empty strings (`:37`) so `[null]` fails. `AGENTS.md` mandates a registered `yarn assurance:compat` selector for SDK/CLI contract changes. The plan's verification set is `yarn verify`, `yarn test:integration`, `docs:build`.
**The Problem:** The probe (plain `.mjs`, invisible to typecheck) breaks after the return-type change, and the plan never runs the repository-mandated compatibility gate, so the regression ships unnoticed.

**Options:**

| Option | Description | Pros | Cons |
|---|---|---|---|
| A | Update the probe to `.data.id` and add the registered `tenant-admin` compat selector to Phase 4 | Fixes the break; satisfies AGENTS.md | Requires a clean committed revision for provenance (already the repo rule) |
| B | Exclude with a recorded rationale | Shorter | Violates AGENTS.md and hides a real break |

**Recommendation:** Option A.

**User Decision:** Resolved — User chose Option A

---

## PF-010: Claim-value methods are documented as application-scoped though the server ignores `appId` [🟠 MAJOR]

**Dimension:** 1 Ambiguities · 8 Security Blind Spots (contract truthfulness)
**Location:** `00-index.md` lines 77–79, 93; AR-6 (line 38); `03-04` lines 172–186; `07-testing-strategy.md` ST-18.
**Codebase Evidence:** `routes/custom-claims.ts:147-153` calls `getValuesForUser(ctx.params.userId)` — `appId` unused; `custom-claims/repository.ts:492-501` documents "Returns values across all applications"; service get/set/delete take only `(userId, claimId)` (`service.ts:262,303,317`) and never verify the claim belongs to `:appId`. The app-scoped `getValuesForUserByApp` (`repository.ts:514-525`) is used only by the OIDC token path.
**The Problem:** The plan's headline claim ("the real routes are application-scoped") is false for values. Authorization remains server-side `admin:claim:read/update`, so this is a truthfulness/isolation-contract defect, not a permission bypass — but it is precisely the class of silent mismatch (cf. the `sort` defect in AR-3) the feature exists to eliminate, and no ST case pins the actual behavior.

**Options:**

| Option | Description | Pros | Cons |
|---|---|---|---|
| A | Keep signatures; state the real semantics in the plan, SDK JSDoc, and `docs/guide/sdk.md` (path scopes the definition surface; the list returns the user's values across applications); pin the cross-application inclusion in ST-18; file server-side scoping as a separate issue if desired | Truthful contract; no server change | Callers must filter by `definition.applicationId` themselves |
| B | Make the server filter/validate by `appId` | True app scoping | Server behavior change outside RD-01's declared scope; needs approval and tests |

**Recommendation:** Option A.

**User Decision:** Resolved — User chose Option A

---

## PF-011: AR-5 resolution note contradicts AR-17 on the user-create ETag [🟡 MINOR]

**Dimension:** 3 Logical Contradictions · 12 Consistency
**Location:** `00-ambiguity-register.md` AR-5 note line 36 vs AR-17 lines 24, 60; repeated framing in `02-current-state.md` lines 85–93.
**Codebase Evidence:** `packages/server/src/routes/users.ts:220-232` (create) sets no ETag; `:279` is the `GET /:userId` handler.
**The Problem:** AR-5's note claims ETag emission was "verified at `:279` (create)", which AR-17 corrects. An executor reading only AR-5 could skip the one-line addition ST-11/ST-24 depend on.

**Options:** A — rewrite AR-5's note to list the four pre-existing sites and attribute the create emission to AR-17. B — add an explicit "superseded by AR-17" pointer. **Recommendation:** A.

**User Decision:** Resolved — User chose Option A

---

## PF-012: ST-number references in component docs disagree with the testing strategy [🟡 MINOR]

**Dimension:** 12 Consistency
**Location:** `03-01` line 105 (calls create ETag ST-19; actual ST-24); `03-04` line 249 ("ST-11–ST-18 and ST-20" — omits ST-19/ST-21/ST-23); `03-05` line 118 ("ST-16–ST-18 (history), ST-20 (2FA), ST-21–ST-23 (CLI)" — actual history ST-16/17, 2FA ST-22, CLI ST-25–27); `02-current-state.md` line 143 ("ST-4–ST-20" omits ST-21–27).
**Codebase Evidence:** `07-testing-strategy.md` lines 39–82 is the ST authority; the execution plan's 3.1.x tasks use the correct numbers.
**The Problem:** A test author following a component doc writes the wrong cases or misses surfaces; traceability links are broken.

**Options:** A — replace component-doc references with explicit ST lists matching 07. B — cite 07 sections instead of numbers. **Recommendation:** A.

**User Decision:** Resolved — User chose Option A

---

## PF-013: "Existing failure-path expectation" for the GDPR export does not exist [🟡 MINOR]

**Dimension:** 13 (Phantom Reference)
**Location:** `03-01` lines 37–39, 103; `99-execution-plan.md` Step 1.3 objective and 1.3.1; `07-testing-strategy.md` line 116; RD-02 R4/AC4.
**Codebase Evidence:** `packages/server/tests/unit/users/gdpr.test.ts` has four success-path tests (lines 96–129) and no rejecting mock. No other export failure test exists; the route has no `try/catch` and no export-specific fixed error message.
**The Problem:** Task 1.3.1 tells the executor to confirm a retained failure-path contract that does not exist, and RD-02 AC4 is vacuous as written.

**Options:** A — add the missing failure-path unit case (mock one query to reject; assert the service rejects/propagates) and keep R4. B — reword R4/03-01 to "mapping tests remain passing; the failure path is unprotected". **Recommendation:** A.

**User Decision:** Resolved — User chose Option A

---

## PF-014: The `RESERVED_SLUGS.size` assertion update is not scheduled [🟡 MINOR]

**Dimension:** 13 (Test Impact)
**Location:** `03-02` lines 42–43, 71–75; `99-execution-plan.md` 2.1.1/2.2.1/2.2.3.
**Codebase Evidence:** `packages/server/tests/unit/organizations/slugs.test.ts:148-165` asserts the exact expected word list and `RESERVED_SLUGS.size === 22`. Adding `new` makes it 23.
**The Problem:** The server unit suite deterministically fails after the change; the plan's "no other code path changes" and regression sweep do not authorize the assertion update, and 2.2.3 expects no regression.

**Options:** A — name "update size to 23 and extend the expected list" in 2.2.1. B — replace the brittle size assertion with membership assertions. **Recommendation:** A.

**User Decision:** Resolved — User chose Option A

---

## PF-015: The cited route-level test pattern is service-level [🟡 MINOR]

**Dimension:** 13 (Convention Violation) · 7 Testability
**Location:** `99-execution-plan.md` 1.1.2; `07-testing-strategy.md` line 98; new directories `tests/integration/users/`, `tests/integration/routes/`.
**Codebase Evidence:** `packages/server/tests/integration/two-factor-admin.test.ts:13-16` states "These tests exercise the service layer directly (not HTTP endpoints)". No `tests/integration/routes/` or `tests/integration/users/` directory exists; integration tests are grouped by subsystem. Real router-level patterns: `tests/integration/admin/system-config-api.spec.test.ts` (real router + Koa context + substituted admin state) and `tests/integration/clients/client-secret-overlap.spec.test.ts` (live HTTP).
**The Problem:** Following the cited file produces a service-level test that cannot assert the `ETag` header (ST-24) or route-level `200`s (ST-3); the new directories drift from the established layout.

**Options:** A — cite the system-config router pattern and place the specs in existing subsystem homes (or keep `users/` and justify it). B — keep paths, fix only the pattern reference. **Recommendation:** A.

**User Decision:** Resolved — User chose Option A

---

## PF-016: Keeping the `ListParams` index signature defeats the compile-time-prompt claim [🟡 MINOR]

**Dimension:** 2 Implicit Assumptions · 1 Ambiguities
**Location:** `03-03` lines 60, 126–128; `99-execution-plan.md` 3.2.1; RD-01 R2.
**Codebase Evidence:** `packages/sdk/src/types/common.ts:28` has `[key: string]: string | number | boolean | undefined | null`; the plan keeps it. `{ sort: 'name' }` therefore still compiles after the rename and is forwarded and ignored (`helpers.ts:125-140`; server reads only `sortBy`/`sortOrder`, `routes/organizations.ts:84-95`).
**The Problem:** R2's "no public list method silently drops a sort preference" is not enforced for legacy callers; the plan's stated compile-time protection does not exist.

**Options:** A — correct the claim and document that unknown params are forwarded and ignored (accepted residual). B — drop/narrow the index signature (larger churn across entity filter types). **Recommendation:** A.

**User Decision:** Resolved — User chose Option A

---

## PF-017: Consumer docs, agent catalog strings, and README counts are not updated [🟡 MINOR]

**Dimension:** 4 Completeness · 12 Consistency
**Location:** `99-execution-plan.md` 3.3.6, 3.4.5–3.4.7; `03-04` 207–209; `03-05` 44–46, 79–85.
**Codebase Evidence:** `packages/sdk/src/agent.ts:116` (`organizations.update` → `'Organization'`) and `:553` (`twoFactor.setPolicy` → `'TwoFactorPolicyResult'`) become stale; there are no `userClaims.*` entries to "remove" (`03-04:207`). `docs/guide/sdk-agent.md:41` says 69 tools (actual 70; +4 planned), and its domain counts (`:205-221`) change (`customClaims` 3→6, `userRoles` 3→4). `packages/sdk/README.md:129-136` still lists `userClaims`. `docs/cli/users.md:133-149` and `docs/concepts/custom-claims.md:125-129` document claim commands without the required `--app`.
**The Problem:** Public docs and the machine-readable agent catalog advertise a surface the SDK no longer exposes (or omit required options); R11's parity goal is only partially met.

**Options:** A — enumerate these files in 3.3.6/3.4.6/3.4.7 and correct the counts. B — record as accepted doc debt with a follow-up. **Recommendation:** A (A is small).

**User Decision:** Resolved — User chose Option A

---

## PF-018: Portability restore of a pre-change manifest containing slug `new` now fails [🟡 MINOR]

**Dimension:** 9 Edge Cases
**Location:** `03-02` lines 49–52; `02-current-state.md` line 176.
**Codebase Evidence:** Portability manifest schemas parse organization slugs through the shared `organizationSlugSchema` (`packages/server/src/portability/schema.ts:105,133`); the manifest is parsed at plan time (`portability/plan.ts:65`). The plan claims existing rows are untouched, which is true for rows but not for imports of older manifests.
**The Problem:** A restore of a backup containing an organization named `new` fails schema validation after the change — a real operational edge case the plan does not document.

**Options:** A — document the restore limitation and workaround (edit the manifest slug or use a direct DB path) alongside the UUID/remediation note. B — special-case import to accept pre-existing reserved slugs (new conditional logic in a versioned manifest contract; scope escalation). **Recommendation:** A.

**User Decision:** Resolved — User chose Option A

---

## PF-019: New history parameters have no error contract for malformed cursors [🟡 MINOR]

**Dimension:** 9 Edge Cases
**Location:** `03-03` §Error Handling (150–161); `07-testing-strategy.md` line 118.
**Codebase Evidence:** `packages/server/src/lib/entity-history.ts:90-103` throws a plain `Error('Invalid pagination cursor')` for a malformed `after`; `:128` clamps `limit` but a non-numeric value becomes `NaN`; the global handler maps the error to a 500 (`middleware/error-handler.ts`).
**The Problem:** The SDK now exposes caller-supplied `after`/`limit`; the plan documents only the empty-page case, so consumers get an opaque `PortaServerError` for bad input.

**Options:** A — document the opaque-cursor contract (malformed cursor surfaces as `PortaServerError`) and pin it with an implementation test. B — add server-side 400 validation (server change outside the plan). **Recommendation:** A.

**User Decision:** Resolved — User chose Option A

---

## PF-020: Task 1.3.2 adds and skips the same test; RD-02 AC2 has no owner [🟡 MINOR]

**Dimension:** 1 Ambiguities · 3 Logical Contradictions
**Location:** `99-execution-plan.md` 1.3.2; `01-requirements.md` line 43; RD-02 R2/AC2.
**The Problem:** 1.3.2 says "Add a repository-wide guard assertion … Skip mechanical source scans … Record `no additional test` with the reason" — self-contradictory and yielding no artifact, while AC2 ("no source query references the old names") is verified by nothing. (The repository-wide review finding is correct: only `gdpr.ts` used the wrong names; other hits are portability JSON keys.)

**Options:** A — rewrite 1.3.2 as a single explicit disposition ("R2 satisfied by the corrected query and the real-schema test; no scan added") or promote AC2 to a Phase 4 checklist item. B — add a source-scan structure test (against the plan's stated preference). **Recommendation:** A.

**User Decision:** Resolved — User chose Option A

---

## PF-021: `02-current-state` minor factual slips [🔵 OBSERVATION]

**Dimension:** 12 Consistency · 13
**Location/Evidence:** `02-current-state.md:12` says "19 domain namespaces"; `packages/sdk/src/client.ts:64-87` exposes 20 members including `userClaims` (the module docstring at `:2` and `docs/guide/sdk.md:97` say 20). Citation ranges are off by a few lines (`routes/applications.ts:315-325` ends at 326; `routes/clients.ts:434-441` ends at 443; `rbac/user-role-service.ts:177-183` spans 176–181). `usersById.getHistory` is reported "unpinned by tests" while a pin exists — covered by PF-008.
**The Problem:** Small factual drift in the verified current-state analysis; no behavioral impact.

**Options:** A — correct the count and ranges during execution; also refresh the `client.ts` docstring. B — leave as-is. **Recommendation:** A (trivial).

**User Decision:** Resolved — User chose Option A

---

## PF-022: `UserExportData` dead-type cleanup is unscheduled [🔵 OBSERVATION]

**Dimension:** 12 Consistency
**Location:** `03-04` lines 34–36, 119–145; `99-execution-plan.md` 3.3.1/3.3.6; Success criterion 4 ("No dead code").
**Codebase Evidence:** `packages/sdk/src/domains/users.ts:77,96,198` defines and uses `UserExportData = Record<string, unknown>`; `agent.ts:286` references it by string. The plan replaces the return type with `UserDataExport` but never removes the old alias.
**The Problem:** A second export-document type survives, conflicting with the plan's no-dead-code success criterion and the no-alias policy.

**Options:** A — add "remove `UserExportData`" to 3.3.1/3.3.6. B — retain deliberately and record the exception. **Recommendation:** A.

**User Decision:** Resolved — User chose Option A

---

## PF-023: `customClaims.getValue` has no specification test case [🟡 MINOR]

**Dimension:** 7 Testability · 4 Completeness
**Location:** `07-testing-strategy.md` ST-18–ST-20 (69–71); `03-04` lines 174, 184; `99-execution-plan.md` 3.1.5; RD-01 R5.
**The Problem:** RD-01 R5 and 03-04 define four claim-value methods; the spec table pins list (`getValuesForUser`), set, and delete, but never `getValue` (`GET /:claimId/users/:userId`, returning `UserClaimValue`). Task 3.1.5 claims the claims/roles domain is covered.

**Options:** A — add an ST case for `getValue` (route + resolved `UserClaimValue`) mapped to `customClaims.test.ts`. B — record it as covered only by an implementation test with the reason. **Recommendation:** A.

**User Decision:** Resolved — User chose Option A (applied as ST-28 in 07-testing-strategy and task 3.1.5)

---

## PF-024: Execution-plan task counts contradict the checkbox inventory [🟡 MINOR]

**Dimension:** 12 Consistency
**Location:** `99-execution-plan.md` header (`Progress: 0/34 tasks`) and the phase table (Phase 1: 8, Phase 2: 5, Phase 3: 15, Phase 4: 6).
**Codebase/artifact Evidence:** The document contains 51 ID'd task checkboxes (Phase 1: 10, Phase 2: 7, Phase 3: 27, Phase 4: 7). The execution rule states the checkboxes are the single source of truth for progress.
**The Problem:** Progress tracking cannot converge (a completed plan would still read `X/34`), and the phase table misstates the work.

**Options:** A — reconcile the header and phase table to the actual task inventory (and to 52 after the PF-009 compat task is added). B — leave and let the checkbox inventory govern. **Recommendation:** A.

**User Decision:** Resolved — User chose Option A (applied: 0/52 tasks; 10/7/27/8)

---

## Pass determination (iteration 2)

✅ **PASSED** — all 24 findings resolved: 1 critical, 9 major, 12 minor, and 2 observations were decided, applied, and verified within the unchanged audit target. No unresolved critical/major finding remains and no new defect was introduced by the fixes.

### Applied-fix index

| PF | Applied fix | Primary locations |
|---|---|---|
| PF-001 | Application/client history descoped; server failure recorded as a follow-up; analysis and RD-01 R3 corrected | AR-4; 02; 03-05; 07 (ST-16/17 withdrawn); 99 3.1.4/3.4.1/4.2.3; 00-index; 01; RD-01 |
| PF-002 | SDK surface change set completed; 3.3.2–3.3.5 marked atomic; barrel and stale types enumerated | 99 3.2.2/3.3.2/3.3.5; 03-04; 00-index; 02 |
| PF-003 | CLI consumer-alignment task added (five command files, two admin services, tests) | 99 3.4.3/3.4.4; 03-05; 02; 00-index |
| PF-004 | `porta app claim` included (field mapping, tests, docs) | 99 3.4.3; 03-05; 00-index |
| PF-005 | `twoFactor.setPolicy` gains `etag?` + If-Match; ST-22 round-trip | 03-05; 07; 99 3.4.2; RD-01 R4 |
| PF-006 | `new` rationale and real remediation (UUID / direct DB) corrected | AR-11; 03-02; 02; 99 2.2.1; RD-01 R9 |
| PF-007 | Type oracles repaired/wired; new type-contract file registered | 03-04; 99 3.3.8; 07; 02 |
| PF-008 | Red-phase reclassification + type-level oracles; AC8 scoped to tests/typecheck; docs via docs:build | 07; 03-03; 99 3.1.1/3.1.3/3.1.8; RD-01 AC8 |
| PF-009 | Compat probe updated; registered `assurance:compat` gate added to Phase 4 | 99 3.4.3/4.1.5; AR-16; 01; 07; 02 |
| PF-010 | Claim-value application scoping documented as non-filtering (plan, JSDoc, ST-18) | AR-6; 03-04; 07; 00-index; 01; 02; RD-01 AC2 |
| PF-011 | AR-5 note corrected (get vs create) | AR-5 |
| PF-012 | ST references aligned to 07 | 03-01; 03-04; 03-05; 02 |
| PF-013 | GDPR export failure-path unit case added | 03-01; 99 1.3.1; 07 |
| PF-014 | `RESERVED_SLUGS.size` 22→23 scheduled | 03-02; 99 2.1.1 |
| PF-015 | Real router pattern and subsystem test paths | 99 1.1.1–1.1.3; 07 |
| PF-016 | Index-signature compile-time claim corrected | 03-03 |
| PF-017 | Consumer docs, README, agent-catalog counts tasked | 99 3.4.3/3.4.6/3.4.7; 03-04; 03-05; 00-index; 02 |
| PF-018 | Portability-restore limitation documented | 03-02; AR-11 |
| PF-019 | Malformed-cursor contract documented + impl test | 03-03; 07 |
| PF-020 | Task 1.3.2 reduced to one disposition; AC2 ownership recorded | 99 1.3.2 |
| PF-021 | Namespace count and citation ranges corrected; docstring task added | 02; 99 3.3.5 |
| PF-022 | `UserExportData` removal applied | 03-04; 99 3.3.1 |
| PF-023 | ST-28 for `customClaims.getValue` added | 07; 99 3.1.5; 03-04 |
| PF-024 | Task counts reconciled to 0/52 (10/7/27/8) | 99 header + phase table |

**Iteration 2 re-scan scope:** all 13 dimensions re-checked within the unchanged audit target after the edits; residual phrases from partial fixes (PF-001, PF-006, PF-010, PF-017, PF-021) were found by grep and corrected; no new root cause was identified.

**Next step before execution consumes this plan:** none for the audit. Execute with the exec-plan skill; specification-first ordering and the red-phase/type-oracle rules are preserved.

## Iteration history

- Iteration 1 (this report): full 13-dimension scan, 5 clustered auditor dispatches, 1 independent hardening challenger for the critical/major batch; the challenger upheld all 10 critical/major findings.
- Iteration 2: verified every accepted fix in the plan set and in the RD-01 context; corrected residual partial-fix phrases; re-scanned all 13 dimensions; no new critical/major finding. Finding identity preserved: the residuals reopened PF-001/PF-006/PF-010 and were closed within this iteration.

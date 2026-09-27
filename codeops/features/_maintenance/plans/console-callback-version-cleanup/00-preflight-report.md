# Preflight Report: Task T-01 mini-plan

> **Status**: ✅ PREFLIGHT PASSED — all 6 findings resolved
> **Iteration**: 2 (bounded re-scan after fixes)
> **Previous Iteration**: 6 findings (1 major, 4 minor, 1 observation) — all resolved
> **This Iteration**: 0 new root causes; 1 PF-003 residual fixed (dev-stack prerequisite)
> **Artifact**: Implementation plan (lightweight task mini-plan) at
> `codeops/features/_maintenance/plans/console-callback-version-cleanup/99-execution-plan.md`
> **Artifact hash (sha256)**: `5e53dac37c5cf5680084569b8ce876d68dac91a5a75c2210d719869e1e11af06`
> **Codebase Grounded**: 25+ source/test/config files examined, 22 artifact references verified
> **Last Updated**: 2026-09-27 19:36

> SAME-SESSION REVIEW: This artifact was created in the current session. Same-agent bias risk is
> elevated. The required independent challenger was dispatched for the MAJOR finding (PF-001) and
> converged. Consider a fresh-session audit if this plan later becomes security-critical.

### Audit scope

| Term                  | Value                                                                              |
| --------------------- | ---------------------------------------------------------------------------------- |
| Audit target          | The mini-plan file named above                                                     |
| Context documents     | `AGENTS.md`, `codeops/.codeops.yml`, `codeops/00-roadmap.md`, roadmaps of features |
| Modification set      | The mini-plan file only (fixes require explicit user instruction)                  |
| Product-scope mode    | Strict (no `--explore-scope`); optional additions are not reported as findings     |
| Domain lenses applied | Web application; Data and migration (existing-install path)                        |

### Codebase Context Summary

**Tech Stack:** TypeScript ESM, Node.js 22+, Koa, `node-oidc-provider` 9.11.2, PostgreSQL, Redis,
Vitest, Yarn Classic + Turbo, pino.

**Architecture:** one server package with an OIDC provider per organization, a direct-DB bootstrap
CLI (`porta init`), a standalone admin CLI, a VitePress docs tree, and a nested CodeOps artifact
layout.

**Key files examined:** `packages/server/src/cli/commands/init.ts`,
`packages/server/src/server.ts`, `packages/server/src/clients/validators.ts`,
`packages/server/src/middleware/health.ts`, `packages/server/src/index.ts`,
`packages/server/src/config/schema.ts`, `packages/server/tests/unit/cli/commands/init.test.ts`,
`packages/server/tests/integration/cli/init.test.ts`, `scripts/sync-versions.js`,
`repo-tests/monorepo/release.spec.test.mjs`, `repo-tests/monorepo/server-tokens.spec.test.mjs`,
`node_modules/oidc-provider/lib/models/client.js`, `docs/cli/bootstrap.md`,
`docs/api/authentication.md`, `docs/guide/deployment.md`, `AGENTS.md`,
`test-harness/scripts/lifecycle.ts`, `test-harness/docker-compose.yml`.

**Reference verification:** 22 references mapped — 22 verified, 0 unverifiable. The plan's code
citations (`init.ts:343-347`, `server.ts:232-244`, `validators.ts:92,145-154`,
`client.js:444-466`, `health.ts:39-43`, `index.ts:60`, `release.spec.test.mjs:70-79`,
`release.yml:96-115`) all match the current tree.

**Notable constraints verified during reconnaissance:**

- The harness stack allocates its own ports (`--base-port`, `test-harness/docker-compose.yml` uses
  `HARNESS_*_PORT` variables), so it does not conflict with the dev compose stack.
- `validateProductionSafety` only fires when `NODE_ENV=production`
  (`packages/server/src/config/schema.ts:97-98`), so a `development` live probe on `http://` is
  feasible.
- `workspace-layout.spec.test.mjs:280` pins only the `## Security invariants` heading, not the
  wording; pentest version-disclosure tests cover HTTP responses only — the invariant text can be
  scoped without breaking an existing contract.

### Summary by Dimension

| #   | Dimension              | Findings | Highest Severity |
| --- | ---------------------- | -------- | ---------------- |
| 1   | Ambiguities            | 1        | 🟡               |
| 2   | Implicit Assumptions   | 0        | —                |
| 3   | Logical Contradictions | 1        | 🟠               |
| 4   | Completeness Gaps      | 2        | 🟡               |
| 5   | Dependency Issues      | 0        | —                |
| 6   | Feasibility Concerns   | 0        | —                |
| 7   | Testability            | 1        | 🟡               |
| 8   | Security Blind Spots   | 1        | 🟠               |
| 9   | Edge Cases             | 1        | 🟡               |
| 10  | Scope Creep Indicators | 0        | —                |
| 11  | Ordering & Sequencing  | 1        | 🟡               |
| 12  | Consistency            | 1        | 🟡               |
| 13  | Codebase Alignment     | 0        | —                |

### Summary by Severity

| Severity    | Count | Status                        |
| ----------- | ----- | ----------------------------- |
| CRITICAL    | 0     | —                             |
| MAJOR       | 1     | ✅ resolved (PF-001)          |
| MINOR       | 4     | ✅ resolved (PF-002 … PF-005) |
| OBSERVATION | 1     | ✅ resolved (PF-006)          |

---

### PF-001: Startup version log contradicts the literal AGENTS.md security invariant 🟠 MAJOR

**Dimension:** 3 (Logical Contradictions), 8 (Security Blind Spots)
**Location:** Objective item 2; Out-of-scope bullet 3; decision D-4
**Codebase Evidence:** `AGENTS.md:149-151` — "Never log or return passwords, tokens, client
secrets, keys, stack traces, SQL errors, internal paths, infrastructure details, or
product-version fingerprints." The prohibition is not scoped to public responses. The repository's
enforced controls are scoped to public surfaces only: `middleware/root-page.ts:17-18`,
`repo-tests/monorepo/server-tokens.spec.test.mjs:31-33`, pentest version-disclosure cases in
`packages/server/tests/pentest/infrastructure/`. The plan itself paraphrases the invariant as
forbidding fingerprints "in public responses" — a misquote of the current text.

**The Problem:** After execution the repository will ship a startup log containing the running
version while its own injected agent guidance says such logging is never allowed. Future agents,
reviewers, or security audits must guess which text wins; a strict reading would treat the shipped
feature as a violation.

**Options:**

| Option | Description                                                                                                  | Pros                                                                      | Cons                                                                                |
| ------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| A      | Surgically scope the product-version clause of the invariant to public/unauthenticated responses and headers | Source text matches the enforced boundary; one clause; no behavior change | Narrowly edits a security invariant; wording must not weaken the other prohibitions |
| B      | Keep the invariant text and add a narrow exception line for the operator-only startup log                    | Invariant reads as append-only; exception is explicit                     | Institutionalizes "Never X, except X" in the guidance agents obey                   |
| C      | Drop the startup version log                                                                                 | Satisfies the invariant literally                                         | Removes the capability the product owner explicitly requested                       |

**Recommendation:** Option A — one surgical clause scoped to public/unauthenticated responses;
leave every other prohibition untouched. This is the only option that satisfies the requested
capability and keeps the guidance self-consistent. The independent challenger converged on A with a
refinement: never restructure the sentence's other items, and note `porta version` as the supported
operator surface.

`Confidence: High — High` on the need to reconcile; `Med` on exact wording.
`Hardening: challenger converged on A-as-refined (surgical clause only); no pick change.`
`Challenger: converged.`

**User Decision:** ✅ Resolved — User chose Option A (surgically scope the product-version clause; fold into the planned AGENTS.md edit and correct the plan's paraphrase).

---

### PF-002: The live probe observes the version log before the version feature exists 🟡 MINOR

**Dimension:** 11 (Ordering & Sequencing)
**Location:** T-01.7 (Phase 1), compared with T-01.9 (Phase 2)
**Codebase Evidence:** `packages/server/src/index.ts:60` currently logs only `{ port, host }`; the
`version` field is added by T-01.9.

**The Problem:** T-01.7 requires recording a startup log entry containing `version`, but it runs
before T-01.9 implements that field, so the task cannot be completed as written and would either be
silently skipped or force out-of-order implementation.

**Options:**

| Option | Description                                                                                        | Pros                                          | Cons                            |
| ------ | -------------------------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------- |
| A      | Remove the version-log observation from T-01.7 and add it to a post-implementation check (T-01.12) | Task order becomes satisfiable; no extra work | One-line plan edit              |
| B      | Keep as-is                                                                                         | No edit                                       | A task that cannot be completed |

**Recommendation:** Option A — the probe in T-01.7 covers issue #141 only; observe the version log
after Phase 2 in the integrated verification.

**User Decision:** ✅ Resolved — User chose Option A (move the version-log observation to the post-implementation verification).

---

### PF-003: Live-probe steps are underspecified for direct execution 🟡 MINOR

**Dimension:** 1 (Ambiguities), 7 (Testability)
**Location:** T-01.7
**Codebase Evidence:** `packages/server/src/config/schema.ts:11-24` requires `DATABASE_URL`,
`REDIS_URL`, `ISSUER_BASE_URL`, `COOKIE_KEYS`, `SMTP_HOST`/`SMTP_FROM`, and
`SIGNING_KEY_ENCRYPTION_KEY`; `packages/server/src/cli/bootstrap.ts:31-57` shows the flag/env
override order; `packages/server/src/cli/commands/init.ts:22-27` documents the non-interactive
flags.

**The Problem:** The probe does not pin the exact environment values, how the scratch database is
created and dropped, or the exact authorization request/negative-control request. An executor must
rediscover these details, and two runs could diverge.

**Options:**

| Option | Description                                                                                       | Pros                             | Cons                            |
| ------ | ------------------------------------------------------------------------------------------------- | -------------------------------- | ------------------------------- |
| A      | Add the exact env set, database create/drop steps, authorize query shape, and expected error code | Reproducible acceptance evidence | Slightly longer task text       |
| B      | Keep as-is                                                                                        | Shorter plan                     | Execution friction and variance |

**Recommendation:** Option A — pin `NODE_ENV=development`, `ISSUER_BASE_URL=http://127.0.0.1:3210`,
the dev database/Redis URLs, cookie/signing keys, MailHog SMTP values, the full authorize query
(`response_type=code`, `client_id`, `scope=openid`, S256 `code_challenge`), and the expected
`303`/`400 invalid_redirect_uri` outcomes.

**User Decision:** ✅ Resolved — User chose Option A (pin the probe specifics).

---

### PF-004: Existing-installation tip does not warn that `--redirect-uris` replaces the list 🟡 MINOR

**Dimension:** 9 (Edge Cases), 4 (Completeness Gaps)
**Location:** T-01.4
**Codebase Evidence:** `packages/cli/src/commands/client.ts:355-356` — the update path sets
`redirectUris: parseCommaSeparated(argv['redirect-uris'])`, replacing the stored array entirely.

**The Problem:** An operator with custom redirect URIs who copies the documented command verbatim
will silently drop those URIs, potentially breaking an existing integration.

**Options:**

| Option | Description                                                                             | Pros                                         | Cons                       |
| ------ | --------------------------------------------------------------------------------------- | -------------------------------------------- | -------------------------- |
| A      | State that the flag replaces the full list and instruct operators to append custom URIs | Prevents accidental removal of existing URIs | One extra sentence in docs |
| B      | Keep as-is                                                                              | Shorter docs                                 | Silent breakage risk       |

**Recommendation:** Option A.

**User Decision:** ✅ Resolved — User chose Option A (document that `--redirect-uris` replaces the full list; append custom URIs).

---

### PF-005: The sync-script registration is not pinned by a test 🟡 MINOR

**Dimension:** 4 (Completeness Gaps), 7 (Testability)
**Location:** T-01.8, T-01.9
**Codebase Evidence:** `scripts/sync-versions.js` holds the `derivedVersions` list;
`repo-tests/monorepo/release.spec.test.mjs:70-79` pins the SDK/CLI constants but would not detect a
missing server entry. A missing entry means `node scripts/sync-versions.js --check` never compares
the server constant, so release-time drift is silent.

**The Problem:** The plan pins the constant's current value and the log wiring but not the fact
that the sync script owns the server file, leaving a silent release-drift path.

**Options:**

| Option | Description                                                                                             | Pros                                 | Cons                  |
| ------ | ------------------------------------------------------------------------------------------------------- | ------------------------------------ | --------------------- |
| A      | Extend the T-01.8 structure assertion to require `packages/server/src/version.ts` in `sync-versions.js` | Closes the drift path; one assertion | None material         |
| B      | Keep as-is                                                                                              | Fewer assertions                     | Silent drift possible |

**Recommendation:** Option A.

**User Decision:** ✅ Resolved — User chose Option A (pin the sync-script registration in the T-01.8 structure assertion).

---

### PF-006: Exact heading for the AGENTS.md cleanup directive is not pinned 🔵 OBSERVATION

**Dimension:** 12 (Consistency)
**Location:** T-01.11
**Codebase Evidence:** `AGENTS.md:1-3` — `# Project guidance` is followed immediately by the
CODEOPS marker; hand-authored sections live outside the markers (`## Technical documentation
automation` at the end).

**The Problem:** The task specifies the placement and the content bullets but not the section
heading, so the resulting document could drift from the repo's heading style.

**Options:**

| Option | Description                                                                      | Pros                          | Cons        |
| ------ | -------------------------------------------------------------------------------- | ----------------------------- | ----------- |
| A      | Pin the heading, e.g. `## Prime directive — leave no test infrastructure behind` | Consistent, reviewable result | None        |
| B      | Keep as-is                                                                       | No edit                       | Minor drift |

**Recommendation:** Option A.

**User Decision:** ✅ Resolved — User chose Option A (pin the heading `## Prime directive — leave no test infrastructure behind`).

---

### Context note (not a finding)

`docs/guide/deployment.md:644-670` documents `GET /health` responses as `status: "ok"`/`"error"`
while `packages/server/src/middleware/health.ts:40` returns `"healthy"`/`"unhealthy"`. This
pre-existing drift is outside this audit target (the plan touches only the same file's Logging
section) and is related to the open issue #47 on the CLI side. Recommend a separate audit if the
team wants it corrected.

---

### Iteration 2 — bounded verification (2026-09-27)

| Finding | Fix applied to the mini-plan                                                                    | Verified |
| ------- | ----------------------------------------------------------------------------------------------- | -------- |
| PF-001  | Objective, In-scope, and D-4 corrected; T-01.11(b) requires the surgical invariant clause scope | ✅       |
| PF-002  | Version-log observation removed from T-01.7 and added to T-01.12 after implementation           | ✅       |
| PF-003  | T-01.7 pins dev stack, scratch DB, env set, authorize query, and 303 / 400 expectations         | ✅       |
| PF-004  | T-01.4 documents that `--redirect-uris` replaces the full list                                  | ✅       |
| PF-005  | T-01.8(c) pins the `scripts/sync-versions.js` registration                                      | ✅       |
| PF-006  | T-01.11(a) pins the `## Prime directive — leave no test infrastructure behind` heading          | ✅       |

Iteration 2 also found and fixed one residual of PF-003: the probe and integration tasks did not
state the dev-stack prerequisite. T-01.3 and T-01.7 now name `yarn docker:up`. No other residual or
regression was found across the 13 dimensions; the corrected artifact is self-consistent and its
references still map to the tree.

**Outcome:** ✅ PREFLIGHT PASSED — all 6 findings resolved. Task rows do not use Plan-Preflight
roadmap stages, so the T-01 row remains `Backlog` until execution starts.

---

### Post-preflight targeted edit (2026-09-27)

The Out-of-scope migration bullet was expanded to state the migration assessment explicitly:
`clients.redirect_uris` is already `TEXT[]` (`packages/server/migrations/004_clients.sql:16`) with
an application-level ten-URI maximum (`packages/server/src/clients/validators.ts:92`); no schema or
data migration is required, and existing installations use `porta client update`. T-01.15 was then
extended so the fix commit body carries the existing-installation upgrade note that feeds the
generated release notes. Targeted re-check of both changed sections: no new ambiguity,
contradiction, or reference failure. **Pass remains valid**; the artifact hash above is the current
revision.

# Preflight Report: Security Scan Remediation (#227–#237)

> **Status**: ✅ PASSED WITH NOTES — design findings resolved; category verification in progress
> **Iteration**: 1 (retrospective design gate recorded after user authorization)
> **Artifact**: maintenance task plan and ambiguity register at
> `codeops/features/_maintenance/plans/security-scan-remediation/`
> **Codebase Grounded**: 40+ source, test, documentation and installer files examined
> **Last Updated**: 2026-11-08

## Audit scope

| Term              | Value                                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------ |
| Audit target      | The remediation package and execution plan recorded in the register and `99-execution-plan.md`               |
| Context documents | Supplied scan report/findings/provenance, repository `AGENTS.md`, affected source and tests, docs, installer |
| Modification set  | The affected implementation, tests and documentation listed in the execution plan                            |
| Excluded          | `scripts/pending-invitations.sql`, real credentials/deployments, #127 mutation/CI promotion, release/main    |

This report is a retrospective design gate: implementation began only after the user authorized the
bounded package. It does not claim a pre-implementation document review that did not occur. The
independent design challenge ran before implementation and its evidence is recorded below.

## Codebase context

**Tech stack:** TypeScript ESM, Koa, `oidc-provider`, PostgreSQL, Redis, Handlebars, Zod, Vitest.
**Architecture:** organization-scoped OIDC routes over a shared provider; opaque tokens resolved
through PostgreSQL/Redis adapters; Admin API authorization derives live canonical roles; bulk
operations own per-item transactions; installer generates Compose and `.env` outside the app.

**Key files examined:** `middleware/admin-auth.ts`, `clients/service.ts`, `users/service.ts`,
`rbac/admin-role-delegation.ts`, `lib/bulk-operations.ts`, `oidc/account-finder.ts`,
`routes/interactions.ts`, `routes/two-factor.ts`, `two-factor/service.ts`,
`routes/password-reset.ts`, `auth/token-repository.ts`, `lib/authority-revocation.ts`,
`cli/src/commands/exports.ts`, `install-porta.sh`, affected tests and deployment docs.

## Findings

### PF-001: The proposed protected bootstrap client does not exist 🟠 MAJOR

**Dimension:** Implicit assumption / codebase alignment.
**Evidence:** `cli/commands/init.ts:340–419` creates a random Admin client but stores only the
bootstrap user ID. No durable client identity is persisted.
**Problem:** Restricting Admin tokens to a nonexistent bootstrap client would break every Admin
login.
**Resolution:** Require an active client in the canonical Admin application and super-admin
organization; reserve creation/update of those clients for full Super Admin. The historical
client-admission policy remains an operator rollout decision, not a repository test prerequisite.

### PF-002: Fail-closed MFA migration would strand the bootstrap administrator 🟠 MAJOR

**Dimension:** Edge cases / security.
**Evidence:** `lib/super-admin-protection.ts:34–38` forbids 2FA reset for the bootstrap user.
**Problem:** Requiring administrative reset for an incompatible enrolled factor can leave the only
bootstrap administrator unable to complete login.
**Resolution:** Verify the existing factor, then require the policy method before login completes.
No password-only replacement path exists.

### PF-003: Export sanitization could corrupt CSV structure 🟡 MINOR

**Dimension:** Edge cases / compatibility.
**Evidence:** `cli/src/output.ts:28–40` replaces all C0 controls, including line breaks.
**Problem:** Passing the whole document through the existing sanitizer would destroy CSV rows.
**Resolution:** Dedicated interactive-export sanitizer preserves LF, CR and tab; file and
noninteractive bytes remain exact.

### PF-004: Installer `umask` alone does not close the existing-file race 🟠 MAJOR

**Dimension:** Security blind spot.
**Evidence:** `install-porta.sh:676–707` redirected into `.env` before `chmod`.
**Resolution:** Restrictive process umask, exclusive private same-directory temporary file,
explicit `0600`, atomic rename, and rejection of linked/nonregular destinations.

### PF-005: Recovery revocation alone does not address pending factor continuations 🟠 MAJOR

**Dimension:** Security blind spot.
**Evidence:** `oidc/adapter-factory.ts:63–65` collected only top-level account references.
**Resolution:** Add `twoFactor.pendingAccountId`; consume the reset token conditionally; retire
other reset links; revoke durable authority, sessions and grants; audit in the same transaction.

### PF-006: Cross-tenant SSO remains an unproven runtime path 🟡 MINOR (accepted uncertainty)

**Dimension:** Feasibility / testability.
**Evidence:** The scanner itself rated confidence medium; provider cookie/session reuse was not
executed.
**Resolution:** Enforce account/client/issuer organization agreement at claim and consent
boundaries. Same-organization SSO remains supported. A retained-cookie browser test remains the
runtime proof; until then the original exploit claim is not reproduced and the limitation stays in
the issue.

### PF-007: Protected-fixture execution lacks exact-path approval ⏸ DEFERRED

**Dimension:** Security / verification.
**Evidence:** `repo-tests/monorepo/install-script.spec.test.mjs:52–58,138–163` creates synthetic
`.env` files in randomized temp directories.
**Resolution:** AR-08 named deferral. Installer tests were written and updated but not executed;
structure/`pnpm verify` remain blocked until the user approves the exact synthetic fixture root.

### PF-008: Existing Admin integrations must not be silently broken 🟠 MAJOR

**Dimension:** Compatibility.
**Evidence:** The user confirmed existing installations and custom Admin API consumers.
**Resolution:** Current client IDs are not required for implementation. Synthetic canonical clients
exercise the compatibility path; operator selection of real clients belongs to a separately
authorized rollout. Ordinary application tokens are rejected by design.

## Verification evidence

| Gate                          | Result                                                                                                                 |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Server unit                   | 4,490 passed (259 files)                                                                                               |
| CLI                           | 1,864 passed (128 files)                                                                                               |
| SDK                           | 670 passed (60 files)                                                                                                  |
| Server CLI builds             | Server and CLI builds passed                                                                                           |
| Server/CLI lint and typecheck | Passed                                                                                                                 |
| Installer syntax/shellcheck   | `bash -n` passed; shellcheck reported one pre-existing informational SC2094                                            |
| Structure                     | 179/179 contracts passed, including 9 installer fixture tests under the approved private root                          |
| Integration (affected)        | 221 tests passed across service-account, security/TOTP, recovery, admin bulk, RBAC authority and tenant-binding suites |
| E2E                           | 139 passed (23 files)                                                                                                  |
| Pentest                       | 331 passed (49 files)                                                                                                  |

The complete integration category was not finished locally because this host runs it sequentially at
roughly one file per several minutes. Affected integration files were run directly; CI's full
`pnpm verify` remains the authoritative category gate.

## Verdict

**PASSED WITH NOTES.** All design-blocking findings have a bounded implementation. The first
independent final review found four blocking gaps (client-create actor omission, Redis recovery
cleanup, stale MFA completion state, and consent POST bypass). All four were fixed and re-reviewed;
the second review returned **PASS WITH NOTES** with no blocking findings. Remaining notes are
runtime cross-tenant SSO proof, full integration category, and test depth for a few narrow
lifecycle/reset paths. No finding is marked remediated until its tests pass
and the issue is updated.

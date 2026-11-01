# Testing Strategy: Tenant Invitation Revocation

> **Parent**: [Index](00-index.md)

## 🚨 Specification Test Cases

These cases derive from the confirmed requirements, component contracts and AR entries only. Specification authors receive these and signatures, not production implementation. Expectations are immutable; a failure after implementation requires a code correction or explicit user ruling.

| ID | Input / scenario | Expected output / behavior | Source |
| --- | --- | --- | --- |
| ST-1 | Upgrade existing schema with an unused invitation | Nullable application_id exists; old row, expiry and used_at unchanged; no owner inferred | R3/R8, AR #7 |
| ST-2 | Insert app-owned row; delete its application; down/up migration | Delete sets owner null and preserves artifact; down removes only ownership, up restores null | R8, AR #7 |
| ST-3 | New tenant invite without roles; admin invite | Tenant owner equals authenticated application; admin owner null; ownership in input cannot spoof it | R3, AR #2 |
| ST-4 | Authorized service actor revokes live own-app invitation | Empty 204; token unusable; one durable user.invite.revoked event with client actor and ids, no sensitive recipient/token fields | R1/R2/R5 |
| ST-5 | Tenant user with live invite permission in same application | Empty 204; token revoked; event records user actor | R2/R5 |
| ST-6 | Missing/invalid bearer, missing scope, revoked/inactive client or lost user permission | Existing 401/403; no token mutation | R2 |
| ST-7 | Other organization token or control-plane caller | Existing 403; no mutation, no revocation success audit | R2 |
| ST-8 | Valid actor targets foreign-app UUID in its own org | Empty 204; foreign artifact unchanged; no success audit | R2/R6 |
| ST-9 | Valid actor targets random or other-org UUID | Empty 204; no artifact changed; no success audit | R2/R6 |
| ST-10 | Revoke used, expired, already-revoked or null-owned invitation | Same empty 204 for each; historical fields unchanged; no success audit | R3/R6 |
| ST-11 | Malformed UUID/injection-like invitation segment after valid auth | Fixed 400; no SQL mutation or internal details | R7, AR #8 |
| ST-12 | Revoke commits before real acceptance | Existing generic expired-invite result; account count remains zero | R4, AR #5 |
| ST-13 | Real acceptance commits before revoke | Revoke empty 204; accepted account remains; no revocation event | R4, AR #5 |
| ST-14 | Two concurrent revocations of one live invitation | Both complete normally; exactly one mutation/audit | R4/R5 |
| ST-15 | Acceptance and revocation overlap in each controlled row-lock order | Revoke-first produces no user; accept-first produces one user; no dual successful transition | R4, 03-01 concurrency |
| ST-16 | Re-invite same address, then revoke old UUID (including overlapping replacement) | Replacement remains usable; old target cannot revoke it | R4/R8 |
| ST-17 | Audit storage fails during actual revocation | Sanitized failure; token remains usable; zero committed revocation audit | R5/R6 |
| ST-18 | Shared strict budget exhausted, vary target IDs | 429/Retry-After across variations; no mutation | R7, AR #8 |
| ST-19 | Strict limiter Redis check fails | 503, no mutation | R7, AR #8 |
| ST-20 | SDK revoke with valid input and transport 204 | DELETE exact tenant-relative invitation path, no body; resolves undefined | R9, 03-02 SDK |
| ST-21 | SDK path input contains slashes/query fragments; transport rejects | Each path segment escaped; rejection propagates, no retry | R7/R9 |
| ST-22 | Type-check valid/missing fields and result usage | Exported input requires both string IDs; result Promise<void> | R9 |
| ST-23 | Cookie only / default admin-prefix call / invitation GET | No new authority/read surface; no mutation | R2, AR #1/#9 |
| ST-24 | Full create via real token endpoint → SDK revoke → public acceptance attempt | Real service client revokes; generic rejection; zero recipient user, durable client-attributed audit | R1/R2/R4/R9 |

## Test placement

| Files | Cases |
| --- | --- |
| `packages/server/tests/integration/migrations/036-invitation-application-owner.spec.test.ts` | ST-1–2 |
| `packages/server/tests/integration/services/invitation-revocation.spec.test.ts` and `.concurrency.spec.test.ts` | ST-3–4, ST-8–17; real PostgreSQL services/transactions |
| `packages/server/tests/pentest/admin-security/tenant-invitation-revocation.spec.test.ts` | ST-5–11, ST-18–19, ST-23, real auth middleware with only provider token lookup substituted where needed |
| `packages/sdk/tests/domains/invitation-revocation.spec.test.ts` and `tests/type-contracts/invitation-revocation.spec.test.ts` | ST-20–22 |
| `packages/server/tests/e2e/api/tenant-invitation-revocation.spec.test.ts` | ST-24 via existing E2E app/token/MailHog helpers |

Ordinary small fixture helpers may be split per concern. Do not create a new runner/harness or alter frozen assurance oracles. Test-only external DB/network adapters may be mocked in unit error-path tests; live persistence and race assertions must use real PostgreSQL. Use barriers/observed lock waiting, not sleeps as proof of overlap. Add `.impl.test.ts` cases after green for transaction failure mapping and route wiring; no production-code-derived oracle.

Register ST-22's new filename in the existing SDK type-contract compiler project before recording typecheck red/green (PF-002). Reconcile actual exact inventory counts after each test addition, preserving all retained files and strict assertions (PF-001). ST-24 invokes the SDK method and must be red before that method exists; an HTTP-only substitute does not qualify (PF-005).

## Verification

Start `pnpm test:changed`. Phase 1: focused migration/service/concurrency specs, relevant invite/localization regressions, server lint/typecheck/build, structure and pentest. Phase 2: SDK tests/typecheck/lint/build, focused real E2E, docs build, existing invitation UI cases (`pnpm test:ui` category if no narrower credible selector). Run registered `pnpm assurance:harness --project security --profile production-security` and `pnpm assurance:compat --select tenant-admin` on a clean committed checkpoint (AR #4). Capture exact commit/tree/run/outcome; do not silently retry failed security assertions or discard diagnostic causes. Preserve only secret-free durable summaries before removing owned runner artifacts.

Full `pnpm verify` is CI's gate under the project narrow-local policy. Push feature branch only via git-commit skill in push mode; confirm full workflow and separate UI/OIDC/docs/Docker/audit jobs before completion. No merge/release. Existing security assurance does not replace direct new endpoint specifications.

## Ownership and cleanup

Use only existing runners and task-owned compose projects/fixtures; inspect resource IDs before starting and remove only owned resources with their lifecycle. Protected runner .env/credentials/TLS paths require exact current-conversation approval before access. No secrets in captured output. Before completion confirm `docker ps -a`, `docker network ls`, `docker volume ls` and remove owned scratch logs/fixtures. Record any blocked approval or failure honestly instead of marking a task complete.

# Ambiguity Register: Deferred Invitation Creation

> **Status**: ✅ GATE PASSED — all 27 items resolved
> **Last Updated**: 2026-09-26 20:40

This register gates the plan that stops creating a user account at invite time. The invitation
becomes a pure token-flow record keyed by organization and email, and the user is created only when
the recipient accepts. The goal is that an unaccepted invitation never leaves a stale user row that
an administrator must clean up.

Decisions marked "user confirmed" are the explicit answers given during planning. Technical
decisions marked "recommended" are the plan author's recommendation made under the user's
instruction to "go with the best option possible"; they await the user's bulk confirmation below.

| #   | Category | Ambiguity / Gap | Options Presented | User Decision | Status |
| --- | -------- | --------------- | ----------------- | ------------- | ------ |
| AR-1 | Naming / Scope | Where the work lives | (A) new feature `user-invitations`; (B) existing `admin-ui`; (C) existing `production-readiness` | (A) new feature — user confirmed | ✅ Resolved |
| AR-2 | Scope | Core goal | (A) stop creating the user at invite time, create on acceptance; (B) keep creation and add a pending flag + purge; (C) Redis-only invitation state | (A) — user rejected B and C | ✅ Resolved |
| AR-3 | Data & state | Invitation storage | (A) reuse `invitation_tokens` with nullable `user_id` plus `organization_id`/`email`; (B) a dedicated `invitations` table | (A) reuse `invitation_tokens` — recommended (smallest surface, existing token flow) | ✅ Resolved |
| AR-4 | Data & state | Where the invite profile snapshot lives | (A) explicit columns `given_name`, `family_name`, `locale`; (B) inside the existing `details` JSONB | (A) explicit columns — recommended (clarity) | ✅ Resolved |
| AR-5 | Behavioral | Inviting an email that already has a user | (A) return `409` (current code); (B) re-invite the existing user | (A) `409` — derived from `routes/users.ts:487`; docs currently claim `200`, docs will be corrected | ✅ Resolved |
| AR-6 | Behavioral | Inviting an email that already has a pending invitation | (A) invalidate the previous active invitation and issue a new one; (B) allow multiple live invitations | (A) replace previous — recommended | ✅ Resolved |
| AR-7 | Integration | Invite API result shape | (A) `{ invitationId, email, invitationSent, expiresAt }` (drop `userId`/`created`); (B) keep fields as optional/null | (A) new shape — recommended (no user exists to identify) | ✅ Resolved |
| AR-8 | Behavioral | Email becomes a real user between invite and accept | (A) generic "invalid or expired" page + audit; (B) merge into the existing user | (A) generic rejection — recommended (enumeration-safe, no silent merge) | ✅ Resolved |
| AR-9 | Security | Token lookup tenant authority | (A) store `organization_id` on the invitation and match it directly; (B) join `users` as today | (A) direct organization column — recommended; hash is SHA-256, token 256-bit, errors generic | ✅ Resolved |
| AR-10 | Security / Edge | Single-use under concurrent acceptance | (A) one transaction locks the invitation row, re-checks validity, creates the user, links `user_id`, sets `used_at`; (B) separate statements | (A) transactional consume — recommended | ✅ Resolved |
| AR-11 | UX | Link click must not accept | (A) non-mutating confirmation page before the password form, POST still accepts; (B) keep the single password form | (A) confirmation page — user requested | ✅ Resolved |
| AR-12 | Behavioral | Invitation lifetime default | (A) `86400` seconds (24h), bounds unchanged (300..2592000); (B) keep `604800` | (B) keep `604800` — user reversed the earlier 24h choice on 2026-09-26; no code, migration, or docs default change | ✅ Resolved |
| AR-13 | Data & state | Existing pending invitations in live data | (A) none, clean migration; (B) migrate/keep working | (A) no live data — user confirmed "no one is using Porta at this moment" | ✅ Resolved |
| AR-14 | Behavioral / Integration | Audit events | (A) `user.invited` at invite with null `user_id` and `invitationId` metadata; `user.created` + `user.invite.accepted` at acceptance; (B) keep `user.invited` bound to a user | (A) — recommended | ✅ Resolved |
| AR-15 | Behavioral | Pre-assigned roles/claims | Retain current behavior: validate at invite, store in `details`, apply best-effort at acceptance | Derived from existing behavior | ✅ Resolved |
| AR-16 | Edge cases | Expired, used, invalid, or foreign-tenant token | Render `invite-expired` and audit `user.invite.failed`, identical for every cause | Derived from existing behavior; extended to email-conflict | ✅ Resolved |
| AR-17 | Non-functional | Cleanup of expired invitation rows | (A) no new purge worker/scheduler; expired rows are inert and bounded by TTL; (B) add a purge job | (A) — recommended; avoids a complexity escalation | ✅ Resolved |
| AR-18 | Security | Login/auth gating for unaccepted invites | No change needed: no account exists until acceptance, so password, magic-link, and OIDC paths cannot see it | Derived | ✅ Resolved |
| AR-19 | Integration | SDK / CLI / Admin UI contract | Update `InviteUserResult` and the CLI/Admin UI invite result handling to the AR-7 shape | Derived from AR-7 | ✅ Resolved |
| AR-20 | UX | Confirmation page presentation | New page template plus new i18n keys for title, description, and accept button; password form unchanged | Recommended | ✅ Resolved |
| AR-21 | Naming | Migration file name | `033_invitation_deferred_user_creation.sql` (latest applied is `032`) | Recommended | ✅ Resolved |
| AR-22 | Integration | Documentation set | Update `docs/api/users.md`, `docs/guide/sdk.md`, `docs/cli/users.md`, `docs/api/audit.md`, TTL rows in `docs/guide/environment.md` and `docs/guide/deployment.md`, `techdocs/reference/configuration.md`, and `techdocs/architecture/data-model.md` | Derived | ✅ Resolved |
| AR-23 | Scope | Explicitly out of scope | Listing/revoking pending invitations, a resend UI, Redis, any new purge worker/scheduler, any `UserStatus` change, import/export of invitations | Recommended | ✅ Resolved |
| AR-24 | Technical (complexity escalation) | Does this add a material support surface? | (A) no — reuses the existing token table, route, mail service, and release workflow; (B) new table/worker/Redis | (A) none added — no material machinery, so no complexity escalation packet is required | ✅ Resolved |
| AR-25 | Behavioral | Release inclusion | (A) the plan includes `develop` → `main` integration and the manual Release dispatch as a final gated phase; (B) stop at release-ready | (A) — user confirmed "develop->main" | ✅ Resolved |
| AR-26 | Technical | Verification commands | `yarn verify`; `yarn test:ui`; `yarn assurance:harness --project security --profile production-security`; `yarn assurance:compat --select tenant-admin` from a clean committed revision; `yarn test:structure` | Derived from `package.json` and `AGENTS.md` | ✅ Resolved |
| AR-27 | Technical (runtime) | ST-24 test placement | (A) move ST-24 to the Phase 2 route spec, where pre-assignment application runs; (B) keep it in the Phase 1 service spec, which cannot turn green in Phase 1 | (A) — pre-assignment application is route-owned (03-01, 03-02); Phase 1 stays fully verifiable and the behavior is tested where the code lives | ✅ Resolved |

## Resolution Notes

**AR-3:** `invitation_tokens.user_id` becomes nullable and is populated at acceptance. `organization_id`
and `email` (CITEXT) are added so the token is self-describing without a `users` join. Legacy rows, if
any existed, would keep their `user_id`; none exist (AR-13).

**AR-7:** `invitationId` is the invitation row's UUID, used by the admin UI to reference the invite.

**AR-10:** The consume-and-create transaction is the only place the invitation is marked used. A second
concurrent submit finds the row already consumed and renders the generic expired page.

**AR-17 / AR-24:** Expired invitation rows are inert and cannot authenticate. No new worker, scheduler,
cache, table, or dependency is introduced, so the Complexity Escalation Gate does not trigger.

**AR-26:** `assurance:compat --select tenant-admin` is the registered selector that exercises the packed
SDK and CLI admin surfaces (`test-harness/assurance/README.md`). It must run from a clean committed
revision.

> **Bulk confirmation recorded:** the user replied "accept all" on 2026-09-26, accepting the technical
> recommendations AR-3, AR-4, AR-6, AR-7, AR-8, AR-9, AR-10, AR-14, AR-17, AR-20, AR-21, and AR-23.
> The gate is passed and plan authoring may proceed.

> **Decision reversal (2026-09-26):** AR-12 was originally set to 24 hours. The user reversed it
> during preflight: the 7-day (`604800`) default is kept, so `packages/server/src/lib/system-config-catalog.ts`,
> migration `030`, the seeded value, and the `invitation_ttl` rows in the documentation remain
> unchanged. This resolved preflight findings PF-003 and PF-004.

> **Runtime note (2026-09-26):** AR-27 was raised while executing Phase 1. ST-24 exercises
> pre-assignment application, which 03-01 and 03-02 keep in the accept route, so its test moved from
> the Phase 1 service spec to the Phase 2 route spec (`invitation-deferral.spec.test.ts`). The
> behavior stays specified once; only its test location changed.

# Execution Plan: DEF-21 Trust-Driven Consent

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Status**: Complete
> **Last Updated**: 2026-09-24 09:05
> **Progress**: 15/15 tasks (100%)
> **CodeOps Artifact Schema**: 1

## Overview

Make the OAuth consent page reachable for third-party clients through an explicit per-client
`requireConsent` flag, honor `prompt=consent` for every client except when nothing new is
requested, and remember granted consent per scope. Add server and browser coverage, keep the
tenant binding unchanged, and document the operator-facing behavior.

## Execution Contract

The task checkboxes below are the single source of truth. Mark the active task `[~]` with the
current date on implementation and update Progress/Last Updated; promote to `[x]` only after its
targeted command passes. A specification RED succeeds only when the named assertion fails while the
existing required lanes stay green.

## Targeted Verification Bindings

| Phase | Required targeted commands                                                                                                                                                                                      |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | `yarn workspace @portaidentity/server vitest run --project unit tests/unit/routes/clients.test.ts` (RED); `yarn workspace @portaidentity/server vitest run --project pentest tests/pentest/oidc-attacks/` (RED) |
| 2     | `yarn workspace @portaidentity/server vitest run --project unit tests/unit/routes/client-create-and-secret-eligibility.spec.test.ts tests/unit/routes/clients.test.ts`; `yarn test:structure`                   |
| 3     | `yarn workspace @portaidentity/server vitest run --project integration tests/integration/clients/`; `yarn workspace @portaidentity/server vitest run --project pentest tests/pentest/oidc-attacks/`             |
| 4     | `yarn test:ui`; `yarn workspace @portaidentity/server verify`; `yarn assurance:compat --select compatibility`; `yarn assurance:harness --project security --profile production-security`; `yarn test:structure` |

---

## Phase 1: Specification tests first

> **Lenses**: security, correctness

**Reference**: RD-05 R5.4; DEF-21; decisions D1–D8.
**Phase baseline tree**: aef46a1a656697afe54c5286c04330318db0e34d
**Scope mode**: strict
**Expected modification set**: new specification test files under `packages/server/tests/` plus the plan.

- [x] 1.1 [spec-author] Add the immutable consent-gate specification: with a `requireConsent` client the consent page renders; with a trusted client it auto-consents; `prompt=consent` renders the page for either client when a scope is missing; when nothing is missing the interaction finishes without a page even under `prompt=consent`; a new scope after consent re-prompts; `prompt=none` with a missing scope yields `consent_required` and no page. ✅ (completed: 2026-09-24 08:14; `packages/server/tests/e2e/auth/consent-require-consent.spec.test.ts`, 3 RED / 3 green)
- [x] 1.2 [spec-author] Add the client-contract specification: the admin API accepts `requireConsent` on create and update, defaults to `false`, and returns it on read, list, and update. ✅ (completed: 2026-09-24 08:14; `packages/server/tests/unit/routes/client-require-consent.spec.test.ts`, 3 RED / 2 green)
- [x] 1.3 [spec-author] Add the penetration specification: consent cannot be forced or bypassed (a client cannot self-set the flag; grant is bound to interaction and client; consent POST requires a valid CSRF token), and a cross-organization client still receives `404` before any interaction. ✅ (completed: 2026-09-24 08:14; `packages/server/tests/pentest/oidc-attacks/consent-authorization.spec.test.ts`, 1 RED / 4 green)
- [x] 1.4 Run the new specifications and record the exact RED for each. ✅ (completed: 2026-09-24 08:14; e2e 3 RED/3 green, unit 3 RED/2 green, pentest 1 RED/4 green; typecheck clean; inventory 336→339; structure 126/126)

**Phase gate:** every new specification fails for the intended missing behavior while the existing
required suites stay green.

---

## Phase 2: Server trust flag and admin API

> **Lenses**: correctness, security

**Reference**: RD-05; DEF-21; decisions D1, D6, D8.
**Scope mode**: strict

- [x] 2.1 Add `packages/server/migrations/032_client_require_consent.sql` adding `require_consent BOOLEAN NOT NULL DEFAULT FALSE` to `clients`. ✅ (completed: 2026-09-24 08:19; `032_client_require_consent.sql`)
- [x] 2.2 Thread the field through `packages/server/src/clients/{types,repository,service,validators}.ts`: persist on create/update, return on read/list, and add `requireConsent` to the `findForOidc` provider metadata. ✅ (completed: 2026-09-24 08:19; types, repository (defaults omitted callers to false), service, and `extraClientMetadata` registration)
- [x] 2.3 Extend `packages/server/src/routes/clients.ts` create/update schemas and every client response with `requireConsent`. ✅ (completed: 2026-09-24 08:19; `createClientSchema` and `updateClientSchema`; responses flow through `mapRowToClient`)
- [x] 2.4 Run the focused unit suites and update the exact server test-file inventory in `repo-tests/monorepo/server-package.spec.test.mjs` if new test files were added, then `yarn test:structure`. ✅ (completed: 2026-09-24 08:19; unit 42/42, client integration 12/12, e2e gate still 3 RED pending Phase 3, structure 126/126)

**Phase gate:** an admin can create and update a client with `requireConsent`; it defaults to
`false`; existing clients are unchanged.

---

## Phase 3: Consent behavior

> **Lenses**: security, correctness, semantics

**Reference**: RD-05 R5.4; DEF-21; decisions D2–D4, D7.
**Scope mode**: strict

- [x] 3.1 Replace the organization-equality branch in `showConsent` (`packages/server/src/routes/interactions.ts`) with the gate: finish silently when nothing is missing; otherwise render the page when `requireConsent` or `prompt=consent`, else auto-consent. ✅ (completed: 2026-09-24 08:31; the silent path reuses the provider-resolved `interaction.grantId` so already-approved scopes are never dropped; register-grant helper extracted)
- [x] 3.2 Keep the audit trail correct: `user.consent.granted` distinguishes auto-consent from an explicit approval, and a denial emits `user.consent.denied`. ✅ (completed: 2026-09-24 08:31; auto-consent, explicit approval, and denial each emit one audit event; the silent path changes nothing and emits none)
- [x] 3.3 Run the integration suites for `tests/integration/clients/` and the consent path, and the `oidc-attacks` penetration suite. ✅ (completed: 2026-09-24 08:31; unit 41/41, e2e auth 31/31, client integration 12/12, pentest oidc-attacks 39/39, lint clean)

**Phase gate:** a third-party client shows the consent page, an approved scope is remembered per
scope, a new scope re-prompts, and the tenant binding is unchanged.

---

## Phase 4: Browser acceptance, documentation, and closeout

> **Lenses**: integration, documentation, security

**Reference**: RD-05; DEF-21; decisions D1–D8.
**Scope mode**: strict

- [x] 4.1 Make the browser acceptance tests real: create a `requireConsent` client in the UI fixture and assert the page renders, approve returns a code, deny returns `access_denied`, and a repeat request with the same scopes does not re-prompt (`consent.spec.ts`, `consent-edge-cases.spec.ts`, `accessibility/form-accessibility.spec.ts`); run `yarn test:ui`. ✅ (completed: 2026-09-24 08:45; added a consent tenant + `startConsentAuthFlow` fixture; `consent.spec.ts` and the accessibility consent test now assert the page render; `consent-edge-cases.spec.ts` already asserts the unchanged auto-consent and cross-org rejection; full UI suite 133/133)
- [x] 4.2 Document the flag and behavior in `docs/guide/custom-ui.md` and the client docs, fix the introspection endpoint path in `docs/guide/deployment.md:905`, and update `techdocs/architecture/security.md`. ✅ (completed: 2026-09-24 08:45; consent trust model documented in `custom-ui.md` and `security.md`; introspection path corrected to `/:orgSlug/token/introspection`)
- [x] 4.3 Update `00-remaining-work.md` and `00-roadmap.md`: resolve DEF-21 and record the deferred SDK/CLI/admin-UI, connected-apps, and resource-server follow-ups. ✅ (completed: 2026-09-24 09:05; DEF-21 moved to the resolved backlog and the roadmap row set to Done; deferred follow-ups recorded)
- [x] 4.4 Full verification: `yarn workspace @portaidentity/server verify`, `yarn test:ui`, `yarn test:structure`, `yarn assurance:compat --select compatibility`, and `yarn assurance:harness --project security --profile production-security`. ✅ (completed: 2026-09-24 09:05; server verify unit 3683 / integration 477 / e2e 133 / pentest 268; UI 133/133; structure 126/126; assurance:compat compatibility exit 0; production-security harness passed=11 incomplete=0 exit 0)

**Phase gate:** the consent page is proven in a browser against a third-party client, the flag and
its memory semantics are documented, and the backlog no longer lists DEF-21.

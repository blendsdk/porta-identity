# Testing Strategy: Assurance Product Remediation

> **Document**: 07-testing-strategy.md
> **Parent**: [Index](00-index.md)

## Testing overview

Specification tests are immutable product oracles. They use public boundaries for behavior and
independent owned-state observers for nonmutation, atomicity, mail, Redis, and log facts (AR-7).
Implementation tests may inspect repositories, transactions, Lua, outbox claims, and event
construction after the product behavior is green.

## 🚨 Specification Test Cases

### Enumeration resistance

| # | Input / scenario | Expected output / behavior | Source |
| --- | --- | --- | --- |
| ST-01 | Submit structurally valid wrong-password attempts for active, absent, passwordless, disabled, suspended, and locked identities under the same tenant/client. | Every case performs one Argon2id verification and one fixed-shape failure operation; none authenticates; public status, page/body schema, security headers, cookies, and generic error are identical except the shared rate-limit state. | RD-05 R5.6; 03-01; AR-1 |
| ST-02 | Submit the same valid password to an absent identity and an eligible identity whose stored hash matches. | Absent identity follows the dummy-hash failure path; eligible identity alone authenticates. Dummy verification can never produce login/session/token effects. | RD-05 R5.6; 03-01; AR-1 |
| ST-03 | Request magic link and password reset for active, absent, and ineligible identities with identical admitted inputs. | Each request inserts exactly one same-schema tenant-bound recovery job and returns the same public response; no account-specific token/mail work completes in the request transaction. | RD-05 R5.6; 03-01; AR-1, AR-5 |
| ST-04 | Process queued jobs for active and absent identities. | Active job creates at most one intended artifact/mail; absent/ineligible job is a successful no-op; terminal state and operational output disclose no account existence. | RD-05 R5.6; 03-01; AR-1, AR-5 |
| ST-05 | Crash/restart after job claim and inject transient database/SMTP failures, including mail accepted before the SMTP result becomes unknown. | Expired leases are reclaimed without charging unstarted work, retry schedule is bounded, exactly one active artifact exists, every bounded resend carries that same artifact, duplicate physical delivery occurs only after an unknown SMTP outcome, and terminal failure uses a closed reason. | 03-01; AR-5, AR-9, AR-12 |
| ST-06 | Compare retained timing diagnostic output for enumeration pairs. | Output is clearly non-gating and cannot transition a security claim or fail ordinary verification. | RD-05 R5.6; AR-1 |

### Magic-link authority and single use

| # | Input / scenario | Expected output / behavior | Source |
| --- | --- | --- | --- |
| ST-07 | Issue an Alpha interaction-bound artifact, then present it on Bravo's route. | Generic invalid/expired response; artifact remains unused; user/email/login/audit-success/Redis/session state is unchanged. | RD-05 R5.7/AC13; 03-02; AR-2 |
| ST-08 | After ST-07, present the exact same artifact on Alpha with the exact stored interaction/client. | One successful verification consumes the artifact, mutates the intended account once, writes durable audit, and creates one bound Redis continuation. | RD-05 R5.7/AC13; 03-02; AR-2 |
| ST-09 | Present an interaction-bound artifact with missing, changed, expired, or foreign-client interaction UID. | Generic rejection before artifact/account/session mutation; the query value never overrides stored authority. | RD-05 R5.7; 03-02; AR-2 |
| ST-10 | Present a standalone artifact with any interaction UID. | Generic rejection without consumption or account/session effect. | RD-05 R5.7; 03-02; AR-2 |
| ST-11 | Replay an already consumed artifact at its correct tenant. | Generic rejection and no second durable or session effect. | RD-05 R5.7; 03-02; AR-2 |
| ST-12 | Concurrently consume the same exact Redis continuation twice with correct tenant/interaction. | Exactly one consumer receives session data; the other receives none; key is absent afterward. | RD-05 R5.7; 03-02; AR-2 |
| ST-13 | Consume the Redis continuation with wrong tenant/interaction, then retry correctly. | Mismatch receives none and preserves the key; correct retry succeeds exactly once. | RD-05 R5.7; 03-02; AR-2 |

### Bulk, import, and export

| # | Input / scenario | Expected output / behavior | Source |
| --- | --- | --- | --- |
| ST-14 | Bulk request contains duplicate IDs or invalid action/reason/scope. | Whole request rejects before mutation/audit. | RD-05 R5.9/AC14; 03-03; AR-3 |
| ST-15 | Ordered bulk user request contains allowed Alpha user, missing ID, Bravo user under Alpha scope, and another allowed Alpha user. | Results preserve order; allowed items commit independently; missing/foreign share `not_found_or_not_authorized`; no Bravo effect/disclosure. | RD-05 R5.9/AC14; 03-03; AR-3 |
| ST-16 | Infrastructure fails after one bulk item commits. | Processing stops; committed row remains truthful, remaining rows are `not_attempted`, response has correlation ID, and raw dependency error is absent. | RD-05 R5.9/AC14; 03-03; AR-3 |
| ST-17 | Valid `merge` import includes existing and new tenant-qualified natural keys. | Existing rows are intentional `skipped`; new rows commit; no existing ownership/field changes occur. | RD-05 R5.9/AC14; 03-03; AR-3 |
| ST-18 | Valid `overwrite` import targets existing rows and includes immutable/credential fields. | Only documented mutable fields change; immutable ownership/IDs and existing credentials remain; prohibited secret-equivalent input rejects before mutation. | RD-05 R5.9/AC14; 03-03; AR-3 |
| ST-19 | `dry-run` import contains valid create/update/skip work. | Planner reports intended outcomes under one snapshot; database/audit/mail/cache are unchanged; credential output is boolean intent, never plaintext or fabricated identifiers. | RD-05 R5.9/AC14; 03-03; AR-3 |
| ST-20 | Import contains wrong version, unknown field, duplicate natural key, missing parent, invalid mapping, collision, foreign scope, or runtime item failure. | Complete import rejects/rolls back; no successful response contains `errors[]`; no partial durable state or credential disclosure. | RD-05 R5.9/AC14; 03-03; AR-3 |
| ST-21 | Export each supported entity with dedicated export plus entity-read permission and exact scope. | Only closed allowlisted fields are returned; organization/global and tenant/application scopes match the contract; audit records safe details only. | RD-05 R5.9/AC14; 03-03; AR-3 |
| ST-22 | Remove export authority or entity-read authority, or substitute foreign tenant/application scope. | Request rejects with no rows, count, or foreign identity disclosure. | RD-05 R5.9/AC14; 03-03; AR-3 |
| ST-23 | Export query would return 10,001 rows. | Stable `export_too_large`; no partial export body or silent truncation. | RD-05 R5.9/AC14; 03-03; AR-3 |
| ST-24 | Export CSV cells begin after optional whitespace with `=`, `+`, `-`, or `@`; audit metadata contains forbidden keys/values. | CSV formulas are neutralized before quoting; forbidden audit/private material is absent from CSV/JSON, logs, and evidence. | RD-05 R5.9/AC14; 03-03; AR-3 |

### Correlated security decisions

| # | Input / scenario | Expected output / behavior | Source |
| --- | --- | --- | --- |
| ST-80 | Allowed and denied admin reads traverse authentication, membership, permission, and resource boundaries. | Each request emits exactly one strict `security.decision.v1` event with final status/outcome and exact decision point/reason; no substring joining is needed. | RD-05 R5.17/AC15; 03-04; AR-4 |
| ST-81 | Authorized admin mutation succeeds, then its durable audit write is forced to fail in an isolated transaction test. | Success commits mutation+audit atomically; audit failure rolls back mutation and returns minimal failure. | RD-05 R5.17/AC15; 03-04; AR-4 |
| ST-82 | Malformed JSON, oversized body, Zod rejection, thrown handler, and Node HTTP parser failure occur. | Each covered request/connection emits one closed terminal event with server correlation and no raw rejected input/error; Koa and transport forms are distinguishable. | RD-05 R5.17/AC15; 03-04; AR-4 |
| ST-83 | Caller supplies request ID, encoded path/query, credentials, raw IDs, email, IP, user agent, stack, SQL, or infrastructure canaries. | Caller request ID is ignored as authority; all forbidden material is absent from event, ordinary logs, audit, response, and retained evidence. | RD-05 R5.17/AC15; 03-04; AR-4, AR-8 |
| ST-84 | Event sink throws while request is denied. | Denial remains denied; one bounded emergency counter/fallback occurs without sensitive text; request cannot become allowed. | RD-05 R5.17/AC15; 03-04; AR-4 |
| ST-85 | Rotate the cookie-key ring while retaining the prior key. | New protected references use the active derived key ID; prior references verify only with retained prior keys; cross-domain references differ. | 03-04; AR-8 |

## Test files

| Type | Planned files | Cases |
| --- | --- | --- |
| Specification | `packages/server/tests/unit/security/enumeration-resistance.spec.test.ts` | ST-01–ST-06 |
| Specification | `packages/server/tests/unit/auth/magic-link-tenant-binding.spec.test.ts` | ST-07–ST-13 |
| Specification | `packages/server/tests/unit/admin/administrative-data-contract.spec.test.ts` | ST-14–ST-24 |
| Specification | `packages/server/tests/unit/security/security-decision-event.spec.test.ts` | ST-80–ST-85 |
| Implementation | Concern-specific `*.impl.test.ts` files beside existing unit/integration projects | Repository, transaction, worker, Lua, redaction, and failure internals |
| Black box | Existing retained harness human-auth/P1/security projects | Public response, cross-tenant, MailHog, packed client, and log observations |

## Verification

- Targeted spec/implementation selectors for the active phase.
- Relevant integration, E2E, UI, and pentest projects with owned dependencies.
- `yarn assurance:harness` exact affected projects after product behavior is green.
- `yarn test:structure` for migrations, exports, package surfaces, and repository contracts.
- Authoritative final command: `yarn verify` (confirmed from project guidance).

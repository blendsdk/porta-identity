# Current State: DEF-8 Sequential-Use Delivered-Artifact Evidence

> **Document**: 02-current-state.md
> **Parent**: [Index](00-index.md)

## Existing Implementation

### What Exists

The human-authentication assurance layer already defines the ST-46 oracle and everything around it:

- **Requirement catalog** — `human-auth-recovery-case-requirements.ts` builds the 3 profiles × (2
  controls + 5 probes) delivered-artifact case and assigns it `sentinelId: 'ST-46'` with
  `profileIds: ['magic-link','password-reset','invitation']`.
- **Generic seam** — `human-auth-cases-contract.ts` defines `HumanAuthCasesContract.observeCase()`
  and the observation shape. `human-auth-cases-adapter.ts:6-11` reads
  `PORTA_ASSURANCE_HUMAN_AUTH_ADAPTER` and, in live mode, throws
  `HUMAN_AUTH_LIVE_ADAPTER_UNAVAILABLE`.
- **Requirements rig** — `human-auth-cases-spec-rig.ts` mirrors `expectedFacts` verbatim and
  forces every side effect false and every protected state unchanged, so it never contacts Porta.
- **Immutable boundary spec** — `human-auth-boundaries.spec.test.ts:75-219` runs all sentinels
  through the seam; with the rig this is a catalog check, not evidence.
- **Live siblings** — `human-auth-functional-live-adapter.ts` and
  `human-auth-second-factor-live-adapter.ts` already prove the pattern: gate on
  `projectAdmitted && profile === 'production-security'`, self-resolve context, drive real HTTP and
  MailHog, and return typed observations to an immutable live spec.
- **Shared observers** — `human-auth-live-observers.ts` provides `mailhogInventoryPath`,
  `pollForExactHumanAuthMailValue`, `publicStateUnchanged` (requires `sha256:` digests),
  `configuredLifetimeObserved`, and the closed diagnostic vocabulary.
- **Live context** — `LiveTenantAdminContext` (`tenant-admin-live-context.ts`) resolves endpoints
  from the run manifests and exposes `rawRequest`, `adminHeaders`, `credential`, and `lifecycle`.
- **Harness** — `docker-compose.yml` runs nginx TLS + porta + postgres + redis + mailhog;
  `run-command.ts:800-851` runs the functional, second-factor, and tenant/admin live blocks under
  `--project security --profile production-security`, each after a lifecycle reset.
- **Product routes** — issuance and consumption exist for all three artifacts
  (`magic-link.ts`, `password-reset.ts`, `invitation.ts`), and the audit read API exists at
  `routes/audit.ts` (`GET /api/admin/audit`).

### Relevant Files

| File                                                               | Purpose                     | Changes Needed                               |
| ------------------------------------------------------------------ | --------------------------- | -------------------------------------------- |
| `test-harness/assurance/tests/human-auth-cases-adapter.ts`         | Seam mode dispatch          | Replace the live throw with the live adapter |
| `test-harness/assurance/tests/human-auth-recovery-live-adapter.ts` | Live ST-46 adapter          | New                                          |
| `test-harness/assurance/tests/human-auth-recovery.spec.test.ts`    | Immutable live spec         | New                                          |
| `test-harness/assurance/scripts/run-command.ts`                    | Selectors + harness blocks  | Add spec list, selector, live block          |
| `packages/server/src/routes/invitation.ts`                         | Invitation rejection path   | Add rejection audit event                    |
| `packages/server/tests/.../invitation*`                            | Product regression coverage | Add a rejection-audit assertion              |

### Code Analysis

The seam is all-or-nothing: `observeCase(requirement)` returns a complete observation whose
`controls` and `probes` are compared by id against the requirement (`human-auth-boundaries.spec.test.ts:85-92`),
and each probe must reference an existing control with the same action and boundary
(`:107-110`). A live adapter therefore cannot omit or fabricate steps.

## Gaps Identified

### Gap 1: No live ST-46 adapter

**Current Behavior:** live mode throws `HUMAN_AUTH_LIVE_ADAPTER_UNAVAILABLE`
(`human-auth-cases-adapter.ts:8`); ST-46 is only asserted by the self-fulfilling rig.
**Required Behavior:** a live adapter observes all 21 ST-46 steps through public HTTP, MailHog, and
admin APIs and returns truthful values.
**Fix Required:** implement `human-auth-recovery-live-adapter.ts` and dispatch to it (03-01).

### Gap 2: Invitation rejection is not audited

**Current Behavior:** the invitation invalid/used/expired path (`invitation.ts:222-236`) renders a
generic error without writing an audit event, while magic-link (`magic-link.ts:250`) and
password-reset (`password-reset.ts:422`) do.
**Required Behavior:** all three artifact kinds emit a rejection audit event carrying the
requirement's normalized class and no forbidden values.
**Fix Required:** add the invitation rejection audit event (03-02).

### Gap 3: The live spec and selector do not exist

**Current Behavior:** `human-auth-live` (`run-command.ts:427-432`) runs four service-free files;
no spec exercises the ST-46 cases contract live.
**Required Behavior:** an immutable live spec asserts the observed ST-46 case and runs in the
production-security harness block.
**Fix Required:** add the spec and wiring (03-03).

## Dependencies

### Internal Dependencies

- `human-auth-cases-contract.ts`, `human-auth-live-observers.ts`, `tenant-admin-live-context.ts`,
  `human-auth-functional-live-adapter.ts` (mechanics), `seed-arrangement.ts` fixtures.

### External Dependencies

- MailHog HTTP API; the owned production-security stack (nginx TLS, porta, postgres, redis).
- No new package dependency.

## Risks and Concerns

| Risk                                             | Likelihood | Impact | Mitigation                                                                       |
| ------------------------------------------------ | ---------- | ------ | -------------------------------------------------------------------------------- |
| Configured-expiry wait makes the live run slow   | High       | Low    | Issue the three expiry artifacts together and await once (~300s), bounded (AR-7) |
| Global TTL mutation leaks into sibling blocks    | Medium     | Medium | Restore config in `finally`; each block already resets the stack first           |
| Live run flakes (timing, eventual consistency)   | Medium     | Medium | Use bounded polling helpers and the established digest comparators               |
| Product audit change alters existing audit tests | Medium     | Medium | Extend, never replace, existing assertions (R5.13)                               |

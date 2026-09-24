# Harness Wiring: DEF-8 Sequential-Use Delivered-Artifact Evidence

> **Document**: 03-03-harness-wiring.md
> **Parent**: [Index](00-index.md)
> **Decision per AR #4, AR #7, AR #22, AR #27**

## Overview

This component registers the new live specification, runs it in the production-security harness,
and implements the bounded TTL control the configured-expiry probe needs. It keeps the existing
service-free `human-auth-live` selector service-free.

## Architecture

### Selectors and harness block

| Location                                                              | Change                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `run-command.ts` (const near `humanAuthFunctionalSpecificationFiles`) | Add `humanAuthRecoverySpecificationFiles = ['test-harness/assurance/tests/human-auth-recovery.spec.test.ts']`                                                                                                                                                                                                                                                                                                       |
| `internalTestSuites`                                                  | Add `'human-auth-recovery-specs': humanAuthRecoverySpecificationFiles`                                                                                                                                                                                                                                                                                                                                              |
| `assuranceAllInternalFiles`                                           | Add the recovery spec (it self-skips when not live)                                                                                                                                                                                                                                                                                                                                                                 |
| production-security block (last, after the tenant/admin block)        | Lifecycle `reset`, then run `humanAuthRecoverySpecificationFiles` with `{...environmentForManifest(active.lease.manifest), PORTA_ASSURANCE_PROJECT:'security', PORTA_ASSURANCE_HUMAN_AUTH_ADAPTER:'live', NODE_TLS_REJECT_UNAUTHORIZED:'0'}`, and fail fast on a non-zero exit. The block runs last because AR-29/AR-30 record that ST-46 can fail truthfully without stopping the other production-security blocks |
| `human-auth-live` selector                                            | Add only the new service-free adapter/observations impl test; never the live spec                                                                                                                                                                                                                                                                                                                                   |

The live spec skips unless `PORTA_ASSURANCE_HUMAN_AUTH_ADAPTER === 'live'`, mirroring
`human-auth-functional.spec.test.ts:225`.

### Bounded TTL control

The configured-expiry probe needs real expiry, but the default token TTLs are 900s / 3600s /
604800s. The adapter temporarily sets the catalog minimums and restores them.

| Step | Action                                                                                                                                                                              |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Read the current values from `GET /api/admin/config`                                                                                                                                |
| 2    | Batch-update `magic_link_ttl=60`, `password_reset_ttl=300`, `invitation_ttl=300` via the update endpoint in `packages/server/src/routes/config.ts` (requires `admin:config:update`) |
| 3    | Issue the three expiry artifacts                                                                                                                                                    |
| 4    | Await past the boundary once (bounded at ~300s + slack)                                                                                                                             |
| 5    | Consume each artifact and require `expired-artifact`                                                                                                                                |
| 6    | Restore the original values in `finally`, even on failure                                                                                                                           |

The five provider-startup TTL settings are not touched; the three token TTLs are read at runtime and
the instance clears its local cache after commit, so the change is visible immediately.

## Error Handling

| Error Case                            | Handling Strategy                                                          | AR Ref |
| ------------------------------------- | -------------------------------------------------------------------------- | ------ |
| TTL update rejected                   | Abort the spec with the closed diagnostic; do not fall back to a long wait | AR-7   |
| Restore fails                         | Surface `cleanupFailed` so the harness exits with its cleanup code         | AR-7   |
| Live spec run without the adapter env | Skip, as the functional/second-factor specs do                             | AR-4   |
| Standalone `human-auth-live` run      | Stays service-free; the live spec is not listed there                      | AR-22  |

> **Traceability:** AR-4, AR-7, AR-22 in 00-ambiguity-register.md.

## Verification

| Purpose                              | Command                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------- |
| Service-free adapter/observer checks | `yarn assurance:test --select human-auth-live`                            |
| Service-free recovery spec wiring    | `yarn assurance:test --select human-auth-recovery-specs`                  |
| Real ST-46 evidence                  | `yarn assurance:harness --project security --profile production-security` |
| Repo verification                    | `yarn verify`                                                             |
| Structure contracts                  | `yarn test:structure`                                                     |

Record the harness result artifact id and pass counts in `99-execution-plan.md` and
`codeops/features/test-assurance/00-remaining-work.md` (AR-28).

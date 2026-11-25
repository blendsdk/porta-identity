# Assurance Evidence: Device Authorization

> **Parent**: [Index](00-index.md)
> **CodeOps Artifact Schema**: 1
> **Source revision**: `ea5a7ac7` (Phase 5 fixes)

## Final Selectors

| Selector | Run / result | Outcome |
|---|---|---|
| `pnpm assurance:harness --project security --profile production-security` | `1201d2ee-f05d-4c48-8c1c-64d225293e2b` | **exit 0**; production exposure 11 passed, 0 product failures, 0 incomplete, 0 execution failures; human authentication 7, second factor 4, tenant/admin 17, delivered artifact 5 |
| `pnpm assurance:compat --select compatibility` | `5403ee1c-8d4f-4e21-98ed-931d7d5b5080` | **exit 0**; SDK and CLI 1.18.1 at `ea5a7ac7` |
| `pnpm test:pentest` | local | 51 files, 341 tests passed |
| `pnpm --filter @portaidentity/server test:unit` | local | 270 files, 4598 tests passed |
| Device integration | local | 32 tests passed |
| Device CLI E2E | local | 1 test passed |
| `pnpm harness:test` | `58c56afd-cd52-45e3-ae9c-d097fe51c740` | 6 tests passed |
| `pnpm test:structure` | local | 179 pass, 0 fail |
| CI full gate | run `45653909802` | **success** — all six jobs: Verify Monorepo, UI Tests, OIDC Harness, Public Documentation, Production Docker Build, Production Dependency Audit at `8d12ce29` |
| `pnpm docs:build` | local | passed |

## Production-Security Notes

The prior accepted record reported three incomplete forwarding-context observations and exit 40. The
current production-security collector observed all 11 exposure cases as passed with no incomplete
product or execution failure, so the selector exited 0. The correlated-log gap remains declared in
the observation artifact (`correlatedLogGap: correlated-security-decision-event-unavailable`); no
accepted case gap remains.

## Browser Suite Note

The full UI suite ran 142 tests with 141 passed. One reset-password test failed with a PostgreSQL
`40P01` deadlock between `invalidateOtherPasswordResetTokens` and `updateHumanPassword` while a
timed-out lockout test was still finishing requests. The affected `reset-password.spec.ts` file
passes 10/10 alone and 20/20 with `--repeat-each=2`; the failure is unrelated to the device flow and
is recorded here rather than retried away. CI remains the authoritative full browser gate.

## Specialist Review

The final `oidc-provider-reviewer` verdict is **PASSED WITH NOTES**: no new critical or major
finding. SR-001 (session rotation) and SR-003 (Grant fixture shape) are resolved; SR-002 is fixed;
SR-011 is recorded as the approved concurrent-tab residual under 03-05 §Concurrent Approval. The
remaining minor notes are accepted in the findings ledger.

## Evidence Artifacts

- `test-harness/.assurance-results/1201d2ee-f05d-4c48-8c1c-64d225293e2b/production-exposure/production-security/observation.json`
- `test-harness/.assurance-results/5403ee1c-8d4f-4e21-98ed-931d7d5b5080/compat/compatibility/result.json`

Artifacts are ignored by Git and remain in the owner-only assurance result store for this run.

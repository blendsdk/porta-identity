# DEF-25 Phase 1 Review

> **Document**: phase-1-review.md
> **Parent**: [Index](00-index.md)
> **Phase**: 1 — Rate limit the real token and introspection endpoints
> **Reviewed**: 2026-09-23
> **Reviewers**: phase-reviewer (RV), security-auditor (SA), in parallel; one fix re-review by the security auditor

## Findings and rulings

| ID | Severity | Finding | Ruling | Resolution |
| -- | -------- | ------- | ------ | ---------- |
| SA-001 | 🟠 | The per-client key comes from an unauthenticated value, so a caller could vary `client_id` to mint unlimited per-IP budgets | Fix | Added an aggregate per-IP counter ahead of the per-client counter on both endpoints (`token` 300/5 min, `introspection` 600/1 min) plus a regression test |
| SA-002 / RV-001 | 🟡 | The `429` was emitted before the OIDC CORS middleware, so browsers could not read it | Fix | The limiter reflects the request origin on the `429` and runs before the CORS client lookup, so throttling still precedes that work |
| SA-003 | 🔵 | The OIDC body was parsed (1 MB) before throttling | Fix | OIDC body parser bounded to `100kb` |
| SA-004 / RV-003 | 🔵 / 🟡 | Basic parsing unbounded; scheme case-sensitive | Fix | Client id bounded to 255; scheme matched case-insensitively; missing separator treated as `unknown` |
| RV-002 | 🟡 | The enforcement spec could pass vacuously | Fix | Probe now asserts it is not already `429` and has remaining budget |
| RV-004 | 🔵 | No Basic case in the introspection suite | Fix | Added |
| RV-005 | 🔵 | Unused export | Fix | `presentedClientId` no longer exported |
| RV-006 | 🔵 | SDK docs and README advertised the wrong `/oidc/token` path | Fix | Corrected to `/token` |
| SA-005 | 🟡 | Mounting the limiters after `oidcPreflightCors` put a client DB lookup before throttling | Fix | Reverted the order and set CORS on the `429` directly, so the limiter runs before any client lookup |
| SA-006 | 🔵 | The per-IP counter is global test state; integration/E2E were not re-run | Verified | `yarn test:integration` 477 and `yarn test:e2e` 127 pass |

No critical finding. The path/mount change itself was confirmed correct.

## Fix verification

| Command | Result |
| ------- | ------ |
| `tsc --project packages/server/tsconfig.json --noEmit` | exit 0 |
| `token-rate-limiter` + `introspection-rate-limiter` unit | 49 passed |
| `forwarded-client-ip-identity.spec.test.ts` pentest | 3 passed |
| `yarn workspace @portaidentity/server lint` | exit 0 |
| `yarn test:structure` | 126 passed |
| `yarn workspace @portaidentity/server vitest run --project integration` | 477 passed |
| `yarn workspace @portaidentity/server vitest run --project e2e` | 127 passed |

## Notes

- The re-review confirmed all eight original findings resolved and raised SA-005 and SA-006;
  both are now closed without a third review pass.
- The live ST-53 evidence is collected in Phase 2.

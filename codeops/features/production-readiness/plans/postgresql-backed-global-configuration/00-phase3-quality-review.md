# Phase 3 Quality Review: SDK and Conventional CLI

> **Status**: Complete; SA-001 resolved by verified, independently re-reviewed fix
> **Last Updated**: 2026-09-16 21:57
> **Fix baseline tree**: 370d53d9f4126b68ac106f793efcff70f25fa28a
> **Baseline tree**: f5feca3a1e4a6dbe7b747ff83c7d2eb77e1843d9
> **Candidate revision**: 0c031ecbcfe151b96d790e7fcf575e59b18c3c68 (unpublished)
> **Scope mode**: strict

Correctness review reports no RV findings. Full root verification and all six clean-revision
packed-client compatibility journeys pass. Security review identifies one necessary correction;
passing tests do not waive it. No optional enhancements or new support surfaces are proposed.

| Finding | Severity | Evidence | Ruling |
|---|---|---|---|
| SA-001 | MAJOR | `packages/sdk/src/domains/config.ts:52–56` interpolates a mutation key. Runtime agent arguments at `agent.ts:637–641` are not constrained by the TypeScript key union. URL normalization can redirect `../applications/<appId>/claims/<claimId>/users/<userId>` to the unrelated claim-value PUT route (`custom-claims.ts:200–209`), which accepts a `{ value }` body. Backend RBAC remains enforced, but the configuration tool's operation boundary is bypassed. | User approved AR-21 on 2026-09-16; publication and Phase 4 wait for verified fix and scoped re-review. |

Independent challenge confirms the finding and the narrow remediation: encode the mutation key,
reject bare `.` and `..` before transport, and add malformed runtime/real-agent regressions covering
traversal, supplied percent escapes, backslashes and dot segments. Encoding alone leaves bare dots
unchanged and permits URL normalization outside the config prefix. No registry, schema framework,
broad agent refactor, harness or backend change is needed. The exact proposed set and verification
are recorded in AR-21. Approval is recorded below; the fix receives one scoped re-review.

The user approved AR-21 with "i approve". Independent author added 18 immutable runtime/real-agent
confinement regressions: all 18 failed before the fix while all seven prior transport cases passed.
Only the existing mutation domain changed: encode the key, reject bare dots, preserve native body
and result. Full SDK verification passes 558 cases, lint/compiler/build; structure passes 104.
Logs: `/tmp/porta-config-phase3-confinement-sdk-verify.log` and
`/tmp/porta-config-phase3-confinement-structure.log`. Clean fix-candidate compatibility and the
single scoped re-review remain required before publication. No server or CLI implementation changed;
the prior passing root verification is retained, with affected SDK verification repeated.

Clean compatibility run `c8301fdb-c0cc-494e-a7c8-49cc4804382b` exits 0 on revision
`730982708fa82710e19145e3a7ec0ad81d334da4`: six of six packed-client journeys and fixture oracles
pass, no forbidden output, valid source/package provenance, primary tree unchanged, successful
cleanup and no residue. Log: `/tmp/porta-config-phase3-confinement-clean-compat.log`.
The single fix-scoped correctness review reports no RV findings; the security auditor explicitly
resolves SA-001 and reports no residual scoped findings. Publication and Phase 4 may proceed.
The opted-in incremental documentation hook updates the existing API architecture page; ADR-016
intent remains unchanged. Final full-plan gates remain required.

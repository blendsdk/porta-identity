# Phase 4 Quality Review: Attributed Server-Process Coverage

> **Status**: Closed — corrections verified
> **Phase baseline**: `f3bd7aa8d31ea4a9ae5b3bc38bfba2372b90270d`
> **Pre-review implementation roll-up**: `c58fe466`
> **Correction authority**: `--auto-design`; AR-53 records the delegated correction design

## Finding Disposition

No finding was waived or dismissed. Overlapping correctness and security findings are grouped by
root cause. The single bounded re-review found two residual Major gaps; both were corrected and
verified without running a prohibited third review.

| Finding | Severity | Required correction | Status |
| ------- | -------- | ------------------- | ------ |
| P4-QA-01 | Major | Bind clean source, lock, and source-tree identities to immutable image labels and revalidate them before conversion | Verified |
| P4-QA-02 | Major | Authorize capture and termination only for the exact Porta container recorded by the durable lifecycle lease | Verified |
| P4-QA-03 | Major | Prevent a losing concurrent startup from invoking unscoped cleanup against another run | Verified |
| P4-QA-04 | Major | Run conversion under a managed deadline so signals and timeouts enter exact stack cleanup promptly | Verified |
| P4-QA-05 | Major | Emit observation evidence only after complete success and emit a distinct sanitized failure artifact otherwise | Verified |
| P4-QA-06 | Major | Prove dependency exclusions, defer unproven pathless scripts, and retain exact classification/conversion failures | Verified |
| P4-QA-07 | Major | Exercise the real graceful-flush boundary for nonzero, OOM, forced, and incomplete outcomes | Verified |
| P4-QA-08 | Minor | Remove stale bind-mount terminology after the named-volume redesign | Verified |

## Bounded Re-review Residuals

| Residual | Correction | Verification |
| -------- | ---------- | ------------ |
| Startup provenance ran outside sanitized failure handling | Move clean-provenance initialization inside the guarded command path; emit setup exit 30 and owner-only `coverage-failure.json` without exception text or paths | A real dirty temporary Git repository exits 30 with the exact startup marker and sanitized artifact |
| Container-wide coverage included entrypoint and lifecycle CLI migrations | Unset `NODE_V8_COVERAGE` for every auxiliary CLI process and reject raw evidence containing more than one unique PID | Multi-PID implementation case rejects; both replacement captures contain only PID 7 |

## Evidence

| Gate | Result |
| ---- | ------ |
| Coverage specification and implementation selector | 57/57 passed, including dirty startup, exact container, real termination, auxiliary-process exclusion, and multi-PID rejection |
| Replacement fixed-seed captures | Runs `adefb62a-5151-4209-a838-e3457462f60a` and `96f6fd1d-978e-42dd-bc0f-c4f4447be4da` each retained two raw files from only PID 7 |
| Reproducibility | Both observations contain 137 normalized paths and exact digest `sha256:9c26ad1b89ba2d6cc82a492ae3c3e4643849f924f629aaa0c2c68319f387fa8f` |
| Observed totals | 815/6,319 statements, 84/3,009 branches, 105/914 functions, and 811/6,096 lines in both runs |
| Provenance and cleanup | Both manifests bind revision `5754a9a85341896a5abf116bf61fe1f9ba28d3a3`, source digest `sha256:e10c25346295d511b0f4ff1b361f790dabe6573d25ce1cba899104618b236ca7`, complete graceful flush, and no remaining owned containers |
| Full repository verification | Passed: 68 structure tests, 226 server files / 3,354 tests, 31 SDK files / 404 tests, and 29 CLI files / 355 tests |
| Documentation | Incremental architecture update formatted and `yarn docs:build` passed |

The review therefore closes with attributable, server-process-only, observation-mode evidence. No
coverage threshold, CI lane, release policy, or product behavior changed.

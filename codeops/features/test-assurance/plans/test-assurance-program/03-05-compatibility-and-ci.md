# Component: Packed Compatibility and Continuous Adoption

> **Parent**: [Plan Index](00-index.md)
> **Owns**: RD-04 and RD-07

## Packed SDK and CLI Consumer

`test-harness/consumers/` contains source templates only. A run builds the active packages, creates
SDK and CLI tarballs with the existing package manager, verifies package identity/content, and
installs them with production dependencies into an ignored temporary directory outside the Yarn
workspace. Tests never import `packages/*/src` or resolve workspace symlinks.

The compatibility project covers a minimal high-value matrix:

| Consumer               | Live journey                                                                                                                                             |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SDK Node export        | authenticate through a supported public API, read/list tenant-scoped data, make one authorized mutation, observe exact error semantics                   |
| SDK browser export     | load declared browser entry and complete a supported public-client interaction where practical                                                           |
| CLI binary             | execute `porta` from the packed bin, authenticate through its supported flow, run representative read/mutation commands, and verify exit/output contract |
| Negative compatibility | wrong tenant/role/credential/endpoint produces the exact public error without secret leakage                                                             |

Evidence binds package names, versions, tarball integrity hashes, Node version, server image digest,
and fixture identity. Existing mock-based SDK/CLI suites remain unchanged and fast.

## Command and Lane Model

| Lane                | Initial policy                                                                                        | Promotion rule                                                    |
| ------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `yarn verify`       | Unchanged mandatory workspace gate                                                                    | Never absorbs Docker/browser/fault campaigns                      |
| `yarn harness:test` | Existing required black-box lane; gains stable protocol/security/compatibility projects progressively | A project joins only when deterministic and within agreed runtime |
| Coverage            | Observation command/artifact                                                                          | No-regression after reproducibility                               |
| Curated faults      | Explicit on-demand command                                                                            | Scheduled/PR-targeted only after runtime and <1% flake evidence   |
| Automated mutation  | Pilot/on-demand only                                                                                  | Separate approval after useful survivor rate and bounded runtime  |

The read-only branch workflow is not edited during initial infrastructure phases. CI contract tests
are authored before any later workflow change. The harness remains publish-independent and uses no
release credentials.

## Reliability and Retention

- Representative stability set: 100 completed fixed-input shuffled runs; flake rate <1%.
- Record p50 and p95 per project/fault; timeout budgets come from observed p95 plus documented headroom.
- Retry is diagnostic only; a retry-pass is a flake, not a clean pass.
- Sanitized summaries and machine-readable manifests follow the repository/CI retention policy;
  raw coverage, traces, logs, tarballs, and credentials remain generated and uncommitted.
- Interrupted or failed runs clean owned resources and leave an actionable recovery command/state.
- Changed requirements, source boundaries, dependencies, fixtures, or sentinels mark affected
  assurance claims stale until rerun.

## Documentation

Update the current test inventory with delivered evidence categories, commands, attribution limits,
and closed/named gaps. Update ADR-014 from Proposed only after the architecture exists; never rewrite
design intent to match an implementation deviation silently.

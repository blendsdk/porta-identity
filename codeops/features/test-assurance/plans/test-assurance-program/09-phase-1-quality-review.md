# Phase 1 Quality Review: Claim, Command, and Traceability Foundation

> **Status**: Passed — single re-review consumed; residual technical corrections verified
> **Phase baseline**: `1f13810104601b76056e795049e76e68e9415488`
> **Implementation roll-up**: `09c828b15865`
> **Frozen corrective specifications**: `8c0ef09f`
> **First correction**: `d9aa6f73`
> **Final correction**: `19b1c06a`
> **Correction authority**: `--auto-design`, AR-33

## Finding Disposition

No finding is waived or dismissed. The correction keeps product source, CI workflows, deployment,
publishing, and security policy out of scope.

| Finding | Severity | Required correction | Status |
| ------- | -------- | ------------------- | ------ |
| RV-001 | Critical | Restore immutable-oracle separation and move collection/dispatcher diagnostics to `*.impl.test.*` | Fixed; re-review confirmed |
| RV-002 | Major | Apply assured-state invariants to loaded catalogs as well as transitions | Fixed; re-review confirmed |
| RV-003 | Major | Fail closed on missing, malformed, or unknown sentinel inventory | Fixed; re-review confirmed |
| SA-001 | Major | Prevent caller mutation from authorizing evidence | Fixed after re-review: opaque token and module-private snapshot |
| RV-004 | Major | Validate mappings against independently grounded Must/source authority | Fixed after re-review: source clause is derived from its RD identity |
| RV-005 | Major | Emit and re-parse schema-complete result and manifest records | Fixed; re-review confirmed |
| RV-006 | Major | Separate observed raw RED exit `1` from normalized wrapper exit `21` | Fixed; re-review confirmed |
| RV-007 | Major | Reject hand-written manifests that do not match current source and exact result artifacts | Fixed after re-review: manifest authority is re-derived before branding |
| SA-002 | Major | Refuse passing evidence from dirty/unbound source and record commit/tree/tool digests | Fixed; re-review confirmed |
| SA-003 | Major | Redact and post-scan personal data as well as secrets before persistence | Fixed; re-review confirmed |
| SA-004 | Major | Retain escalation until the complete child process group has terminated | Fixed after re-review: resistant-grandchild regression is green |

## Corrective RED Evidence

The corrective specification run exited `1` before implementation. It failed only on the newly
required contracts: absent schema-complete foundation records, absent canonical context/authority
loaders, optional inventory bypass, ambiguous RED-exit schema, retained PII, and missing managed
signal-probe ownership. Direct SIGINT and SIGTERM cases each timed out waiting for a managed child
before the dispatcher fix. The original Task 1.2 evidence remains raw child exit `1`; exit `21` is
only the normalized assurance test-failure class.

The migration-era root-script oracle conflicted with the later approved root-owned assurance
boundary. Its unaffected Turbo assertions remain in place, while the superseding exact root static
and alias contract is now isolated in `assurance-root-contract.spec.test.mjs`. Dispatcher
introspection and progressive collection live only in implementation tests.

## Verification Contract

The correction is eligible for commit only after corrective specifications, implementation tests,
structure tests, typecheck, lint, and unchanged `yarn verify` pass. Because attributable evidence
requires a clean committed tree, `yarn assurance:validate` must return setup exit `30` without
creating a run before commit, then pass and produce schema-valid ignored evidence from the clean
correction commit. Exactly one independent correctness/security re-review follows.

## Re-review and Final Closure

The only permitted independent re-review was run against `8c0ef09f..d9aa6f73`. It confirmed
RV-001, RV-002, RV-003, RV-005, RV-006, SA-002, and SA-003, but kept SA-001, RV-004, and SA-004
open and added RV-007. Auto-design selected the sole in-scope secure correction for each; none was
waived or dismissed. Commit `19b1c06a` stores validation authority behind an opaque token and
module-private snapshot, re-derives manifest identity from the current clean Git tree and exact
owned result artifacts, derives every source clause from its requirement/RD identity, and keeps
bounded signal escalation active until all descendants are absent. The quality protocol forbids a
third review pass, so final closure rests on the immutable specifications, focused adversarial
implementation tests, and authoritative verification rather than an unrecorded extra review.

Final evidence: `yarn assurance:test --select assurance-governance`, lint, typecheck, all 68
structure tests, and unchanged `yarn verify` passed. The latter retained 224 server files / 3,348
tests, 31 SDK files / 404 tests, and 29 CLI files / 355 tests. Clean-tree assurance run
`e5586c13-3f0c-4878-bc95-29135039a4a1` is bound to `19b1c06a`, reported successfully, uses `0700`
directories and `0600` files, and passed the residual secret/PII scan.

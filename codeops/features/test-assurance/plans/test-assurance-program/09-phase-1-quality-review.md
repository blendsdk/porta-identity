# Phase 1 Quality Review: Claim, Command, and Traceability Foundation

> **Status**: Corrected — independent re-review pending
> **Phase baseline**: `1f13810104601b76056e795049e76e68e9415488`
> **Implementation roll-up**: `09c828b15865`
> **Correction authority**: `--auto-design`, AR-33

## Finding Disposition

No finding is waived or dismissed. The correction keeps product source, CI workflows, deployment,
publishing, and security policy out of scope.

| Finding | Severity | Required correction | Status |
| ------- | -------- | ------------------- | ------ |
| RV-001 | Critical | Restore immutable-oracle separation and move collection/dispatcher diagnostics to `*.impl.test.*` | Corrected; re-review pending |
| RV-002 | Major | Apply assured-state invariants to loaded catalogs as well as transitions | Corrected; re-review pending |
| RV-003 / SA-001 | Major | Fail closed on canonical reviewed sentinel inventory and owned-run provenance | Corrected; re-review pending |
| RV-004 | Major | Validate exact mappings against an independent Must/node/source inventory | Corrected; re-review pending |
| RV-005 | Major | Emit and re-parse schema-complete result and manifest records | Corrected; re-review pending |
| RV-006 | Major | Separate observed raw RED exit `1` from normalized wrapper exit `21` | Corrected; re-review pending |
| SA-002 | Major | Refuse passing evidence from dirty/unbound source and record commit/tree/tool digests | Corrected; re-review pending |
| SA-003 | Major | Redact and post-scan personal data as well as secrets before persistence | Corrected; re-review pending |
| SA-004 | Major | Forward direct signals to a managed child group and await termination/cleanup | Corrected; re-review pending |

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

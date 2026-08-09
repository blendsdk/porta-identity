# Component: Assurance Model and Evidence

> **Parent**: [Plan Index](00-index.md)
> **Owns**: RD-01 and evidence aspects of RD-07

## Target Structure

```text
test-harness/assurance/
├── README.md                    # durable claim/evidence rules
├── schema.ts                   # Zod claim, result, gap, fault schemas
├── traceability.json           # machine-checked requirement → case → task → claim edges
├── slices/                     # typed actor/action/resource and threat profiles
├── claims/                     # one reviewed JSON record per claim
│   ├── tenant-rbac/
│   ├── protocol-token/
│   ├── human-auth/
│   └── validation-exposure/
├── faults/                     # reviewed metadata + patch files
└── scripts/
    ├── validate-assurance.ts
    ├── render-summary.ts
    └── redact-evidence.ts
```

Generated result bundles live under an ignored `test-harness/.assurance-results/<run-id>/`; the
repository commits definitions and sanitized examples only.

## Claim Contract

Each claim record has these required fields:

| Field                    | Rule                                                                               |
| ------------------------ | ---------------------------------------------------------------------------------- |
| `id`                     | Allowlisted stable identifier, globally unique                                     |
| `slice`, `risk`, `owner` | Enumerated ownership and priority                                                  |
| `sources`                | Requirement/contract/standard references with version and section                  |
| `threat`                 | Prohibited outcome or functional failure                                           |
| `oracle`                 | Public observation and exact expected result; no production helper reference       |
| `sentinels`              | Existing test paths plus case names and positive/negative classification           |
| `status`                 | `unreviewed`, `incomplete`, `blocked`, `assured`, or `stale`                       |
| `evidence`               | Build identity, fixture identity, commands, results, fault IDs, coverage reference |
| `gaps`                   | Explicit list; must be empty for `assured`                                         |
| `reopenWhen`             | Source, dependency, fixture, or implementation boundary changes                    |
| `profile`                | Exact `operational` or `production-security` execution profile                     |
| `sliceProfile`           | Reference to the complete actor/action/resource and threat profile                 |

The validator resolves referenced files, prevents duplicate IDs, enforces a negative sentinel for
critical claims, validates state transitions, and rejects `assured` without a green result and
killed fault. The renderer never changes claim state.

Every slice profile contains typed actors, actions, resources/assets, allowed/unauthenticated/
forbidden/not-found results, entry points, trust boundaries, abuse and rejection classes,
prohibited side effects, required privacy-safe security/audit events, and recovery expectations.
The validator rejects a missing actor/action/resource combination or an incomplete profile. The
traceability graph rejects any Must requirement without at least one specification subcase, owning
execution task, and claim, and rejects dangling or duplicated edges.

## Evidence Bundle

Every run records a manifest, sanitized machine-readable results, coverage/fault references, and a
Markdown summary. Source revision, image/package digest, dependency lock digest, fixture digest,
command, start/end time, and tool versions are mandatory. Secrets and raw identity artifacts are
redacted before disk writes; the redaction layer has adversarial specification tests.

## Defect and Gap Routing

An exact test failure is first classified as implementation defect, oracle conflict, infrastructure
failure, or non-reproducible. A verified product defect preserves the expected oracle, changes the
claim to `blocked`, records observed/required behavior and severity, and points to a separately
authorized work item. Assurance implementation never edits product source to close it.

## Failure Handling

- Invalid definitions fail before services start.
- Missing tests or evidence cannot be downgraded to warnings for critical claims.
- Unknown or stale build identity makes a run invalid.
- Report generation failure leaves raw sanitized evidence available and exits non-zero.
- Any redaction canary in output is a security failure; the artifact is not retained.
- A RED-phase run is successful evidence only when the command exits non-zero with the exact
  registered assertion signature. Syntax, setup, timeout, cleanup, or unrelated failures never
  satisfy RED; previously required lanes remain green while the new case is isolated from required
  collection until its owning green task.

## Harness-Internal Test Boundary

Root-owned aliases use the existing `tsx` dependency and Node's test runner to collect only
`test-harness/assurance/**/*.spec.test.ts` and `*.impl.test.ts`. Root `devDependencies` directly own
Zod and every imported test/tool dependency. A harness-specific TypeScript config, ESLint/static
boundary, and repository structure specifications prove that Node tests and directory-scoped
Playwright `*.spec.test.ts` files are collected exactly once. The harness remains outside the Yarn
workspace and receives no package manifest or extra test framework. Playwright remains the
external journey runner; root Node/tsx owns harness-internal specifications only.

## Verification

Specification cases ST-01 through ST-08 precede schema and report implementation. Run targeted
Node/Playwright checks during iteration, then `yarn verify` before every task checkpoint.

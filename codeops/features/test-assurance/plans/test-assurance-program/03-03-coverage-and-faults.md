# Component: Coverage Attribution and Fault Sensitivity

> **Parent**: [Plan Index](00-index.md)
> **Owns**: RD-03 and RD-06

## Server-Process Coverage Pipeline

1. Build the harness image from a recorded revision and retain its image digest.
2. Set `NODE_V8_COVERAGE` only for the Porta container and mount an ignored raw-output directory.
3. Execute a fixed-seed harness project/risk slice.
4. Gracefully terminate the Node process so V8 flushes coverage before container removal.
5. Validate all raw records refer to the expected runtime and compiled `/app/dist` files.
6. Merge process records with `@bcoe/v8-coverage`.
7. Convert ranges through exact direct dependencies `@bcoe/v8-coverage@1.0.2`,
   `ast-v8-to-istanbul@1.0.5`, and `acorn@8.18.0`, plus the matching emitted source maps and
   sources.
8. Reject paths outside the server package or without matching build provenance.
9. Emit exact covered/total statements, branches, functions, and lines plus HTML/JSON summaries.

The first spike uses one known module with positive and unexecuted branches and manually samples
mapped lines. It is a hard stop/go gate: no baseline or ratchet follows if provenance, clean flush,
or mapping is unreliable. Vitest and harness coverage remain separate until repeated combined
reports prove identical path normalization and no double counting.

## Ratchet Stages

| Stage                 | Gate                                                                               |
| --------------------- | ---------------------------------------------------------------------------------- |
| Observation           | Report exact counts and exclusions; never blocks                                   |
| Reproducible baseline | Two clean fixed-seed runs have identical totals and covered counts                 |
| No-regression         | Covered count may not fall and total growth must be explained                      |
| Changed security code | Changed lines and branches require evidence or a named reviewed gap                |
| Slice floor           | Only audited files/claims receive a raised floor after exact specs and faults pass |

Rounded percentages are display-only. The inherited global 80%/75% thresholds are not enabled
against an incomplete baseline.

## Curated Fault Catalog

Each fault has an ID, rationale, target revision/range/hash, patch, affected claim, named sentinels,
expected failure signature, timeout, and cleanup rule. Initial classes cover:

- remove tenant predicate or tenant cache scope;
- bypass organization-membership or role checks;
- relax exact redirect URI, PKCE, JWT algorithm/issuer/audience/expiry checks;
- accept reused authorization, refresh, recovery, reset, magic-link, or OTP artifacts;
- weaken CSRF/cookie/rate-limit enforcement;
- expose stack, SQL, token, key, path, or version details.

The runner creates a disposable worktree/build context, validates the patch target, builds, starts a
fresh harness stack, and runs only designated sentinels. `killed` requires the intended assertion to
fail. `survived`, `invalid`, `infrastructure-failed`, and `timeout` are distinct outcomes. The runner
always cleans its owned worktree, image, stack, processes, and evidence staging area.

## Automated Mutation Pilot

After curated faults meet reliability/runtime gates, evaluate one TypeScript ESM-compatible runner
against a small pure module and one selected critical boundary. The pilot must support include-only
targets, test selection, timeouts, machine-readable survivors, and no source-tree mutation. If it
cannot meet those criteria, record a no-go result and retain curated faults as the required method;
do not add a broad or unstable gate.

## Verification

ST-19 through ST-29 precede the pipeline and fault runner. The coverage spike, each fault class, and
any mutation pilot run in explicit assurance commands; `yarn verify` remains the per-task repository
gate.

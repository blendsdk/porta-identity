# RD-06: Fault Sensitivity and Targeted Mutation

> **Document**: RD-06-fault-sensitivity-and-mutation.md
> **Status**: Complete
> **Created**: 2026-08-09
> **Project**: Porta Test Assurance
> **Depends On**: RD-01, RD-02, RD-05
> **CodeOps Artifact Schema**: 1

---

## Feature Overview

Legacy tests often begin green because behavior already exists. This requirement proves that
selected assurance tests detect realistic broken controls using reviewed, reproducible fault
patches and later targeted automated mutation. It explicitly rejects repository-wide mutation
scores as the initial objective (AR #15, AR #16).

## Functional Requirements

### Must Have

- [ ] **R6.1 (L)** Define a versioned curated-fault manifest containing stable fault ID, affected
      claim/control, target revision constraints, patch artifact, explicit claim–sentinel–expected-
      signature tuples, build command, execution command, and cleanup verification. One fault may
      support multiple claims only when every tuple is independently executed and killed.
- [ ] **R6.2 (L)** Apply faults only to a disposable temporary worktree or Docker build context; no
      bypass flag, dormant mutation, or fault-selection code may enter production source (AR #15).
- [ ] **R6.3 (M)** A fault is killed only when at least one designated exact assertion fails for the
      intended behavior; compilation, startup, fixture, timeout, unrelated test, or cleanup failure
      is an invalid run, not a kill.
- [ ] **R6.4 (L)** The delivered tenant/admin control checks represent missing tenant scope on one
      read and one write plus removed admin authentication/membership/RBAC. Protocol, human-auth,
      and P1 source-variation campaigns are deferred and receive no sensitivity credit.
- [ ] **R6.5 (M)** A risk slice may be described as fault-sensitive only after it kills its
      applicable curated checks. Slices whose campaigns are deferred remain explicitly
      `not-sensitivity-proven` even when their ordinary black-box behavior is green (AR #25).
- [ ] **R6.6 (M)** Legacy specification tests that are naturally green before test implementation
      shall record that result and use an applicable curated fault or controlled mutation as their
      red/sensitivity proof (AR #16).
- [ ] **R6.7 (L)** Only after curated-fault reliability is proven may an automated mutation pilot
      target small security-critical modules; generated code, type-only files, barrels, migrations,
      and mechanical mappings shall be excluded.
- [ ] **R6.8 (M)** Surviving mutations shall be classified as test gap, equivalent/nonviable mutant,
      uncovered requirement, or infrastructure failure with a recorded reason and reviewer.
- [ ] **R6.9 (M)** Mutation success shall be evaluated per audited control/slice, not by one global
      repository score.
- [ ] **R6.10 (M)** The runner shall restore the original revision and prove the primary worktree is
      unchanged after success, failure, interruption, or timeout.

### Should Have

- [ ] **R6.11 (M)** Later automated mutations should prioritize conditional boundaries, removed
      authorization predicates, comparator changes, TTL checks, single-use transitions, and error
      redaction over cosmetic string mutations.
- [ ] **R6.12 (S)** Results should report median/p95 runtime and invalid-run rate per fault to guide
      CI-lane decisions.

### Won't Have (Out of Scope)

- Whole-repository mutation as an initial gate.
- Fault injection through production environment variables or endpoints.
- Protocol, human-auth, and P1 disposable source-variation campaigns in this assurance program.
- Counting setup/build crashes as killed mutants.
- Changing specification expectations because a mutation survives.

## Technical Requirements

### Curated Fault Execution

```text
verified baseline revision
  → disposable checkout/build context
  → validate target precondition
  → apply one fault patch
  → build and start successfully
  → run designated sentinel tests
  → classify intended failure
  → collect redacted evidence
  → destroy disposable context
  → verify primary tree unchanged
```

Only one semantic fault is active per run unless a later requirement explicitly defines an
interaction fault. Patch target mismatches fail closed.

### Survivor Policy

| Classification         | Completion effect                                                    |
| ---------------------- | -------------------------------------------------------------------- |
| Test gap               | Slice blocked until an independent specification test kills it       |
| Equivalent/nonviable   | Requires reason and independent review; does not count against slice |
| Requirement gap        | Reopen requirement authority; no implementation-derived expectation  |
| Infrastructure failure | Invalid run; repair harness and rerun                                |

## Integration Points

- RD-01 maps each fault to a claim and records evidence.
- RD-02 supplies an isolated server and proves cleanup.
- RD-05 identifies control-specific faults and designated sentinels.
- RD-07 owns on-demand execution and any later promotion.

## Scope Decisions

| Decision         | Options Considered                                 | Chosen              | Rationale                                                | AR Ref |
| ---------------- | -------------------------------------------------- | ------------------- | -------------------------------------------------------- | ------ |
| Initial approach | Manual edits / curated patches / full mutation     | Curated patches     | Reproducible, reviewable, and bounded                    | AR #15 |
| Legacy red       | Waive / artificial expectation / sensitivity proof | Sensitivity proof   | Preserves correct immutable oracle                       | AR #16 |
| Scoring          | Global / per module / per control                  | Per audited control | Matches assurance claims and avoids misleading aggregate | AR #15 |

## Security Considerations

- **Data sensitivity**: Faults and survivors describe bypasses; artifacts remain restricted and
  redact credentials and tokens.
- **Input validation**: Fault IDs, paths, revisions, and commands use allowlists and canonical paths.
- **Authentication and authorization**: Fault contexts contain synthetic data only and run on
  isolated loopback infrastructure.
- **Injection risks**: Patch metadata is data, never evaluated shell; target files must resolve
  beneath the disposable checkout.
- **Encryption**: Faults may weaken crypto validation only inside disposable builds and never expose
  real keys.
- **Rate limiting**: Fault runs use dedicated state and do not change production/default settings.
- **Infrastructure**: The runner must never target the primary worktree, `main`, production images,
  or external deployments.

## Acceptance Criteria

1. [ ] The curated manifest validates stable IDs, explicit claim–sentinel–expected-signature tuples,
       target preconditions, patch existence, designated tests, and cleanup instructions; a shared
       fault cannot close a claim whose own tuple was not independently killed.
2. [ ] Tenant-scope and RBAC checks build successfully and are detected by their designated
       black-box sentinels for the intended reason. Redirect/PKCE, ID-token emission/signing,
       wrong-token-type/opaque-token consumption, replay, CSRF/cookies, rate limiting, and
       disclosure sensitivity remain named deferred campaigns; no JWT access-token consumer is
       assumed and no deferred slice is called sensitivity-proven.
3. [ ] A deliberately broken build, startup, fixture, and unrelated-test case is reported `invalid`,
       never `killed`.
4. [ ] A sentinel that passes under its governing fault produces a survivor, blocks the claim, and
       does not modify the specification expectation.
5. [ ] Interrupting the runner leaves the primary worktree byte-for-byte unchanged and removes or
       reports the disposable context for safe recovery.
6. [ ] The automated mutation pilot, if implemented, targets only explicitly selected modules and
       emits survivor classifications rather than a repository-wide pass percentage.
7. [ ] No production source, runtime configuration, Docker production asset, or published package
       contains a fault selector, bypass, or dormant mutant.

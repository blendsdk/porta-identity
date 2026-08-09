# RD-07: Continuous Assurance and Non-Functional Requirements

> **Document**: RD-07-continuous-assurance-and-non-functional-requirements.md
> **Status**: Complete
> **Created**: 2026-08-09
> **Project**: Porta Test Assurance
> **Depends On**: RD-01, RD-02, RD-03, RD-04, RD-05, RD-06
> **CodeOps Artifact Schema**: 1

---

## Feature Overview

This non-functional requirement keeps the assurance system reproducible, maintainable, private,
release-safe, and honest over time. It defines execution lanes and promotion evidence without
silently changing publication or risk-acceptance policy (AR #2, AR #14, AR #21, AR #26).

## Functional Requirements

### Must Have

- [ ] **R7.1 (M)** `yarn verify` shall remain the authoritative fast workspace verification command
      and shall not invoke harness, curated-fault, or mutation campaigns (AR #21).
- [ ] **R7.2 (M)** Black-box assurance shall extend the existing harness CI job; curated faults and
      mutation shall remain explicit on-demand commands until separately promoted.
- [ ] **R7.3 (M)** New or changed behavior shall use specification-first ordering: specification
      test, red phase, implementation, green phase, implementation tests, full verification.
- [ ] **R7.4 (M)** Existing behavior whose specification starts green shall use RD-06 sensitivity
      evidence rather than corrupting the oracle to force red.
- [ ] **R7.5 (M)** A check may be proposed for required CI only after 100 consecutive representative
      runs show less than 1% infrastructure/test flake, its p50 and p95 runtime are recorded, and
      its failure ownership and recovery procedure are documented.
- [ ] **R7.6 (M)** Promotion to a new blocking release/merge gate requires separate user approval;
      this feature may prepare evidence but cannot grant that policy change (AR #14, AR #21).
- [ ] **R7.7 (M)** Assurance reports shall distinguish product failure, test failure, fixture/setup
      failure, coverage incompleteness, fault-run invalidity, and cleanup failure with distinct
      non-zero outcomes where automated.
- [ ] **R7.8 (M)** Every completed risk slice shall update the claim catalog, test inventory,
      applicable technical documentation, and its exact coverage/fault baselines.
- [ ] **R7.9 (M)** Generated evidence shall use synthetic data, redact sensitive values, have an
      explicit retention/access policy in CI, and remain uncommitted unless sanitized source
      fixtures or baseline metadata are intentionally versioned (AR #22).
- [ ] **R7.10 (M)** All assurance commands shall be repeatable from the repository root, non-
      interactive in CI, safe for concurrent worktrees, and clean up owned resources after signals.
- [ ] **R7.11 (M)** Changes to authentication mechanisms, tenant resolution, crypto algorithms,
      client types, admin surfaces, compatibility policy, or normative standards shall mark affected
      claims stale and reopen their owning risk slice.
- [ ] **R7.12 (M)** Full feature completion requires every Must requirement in RD-01–RD-07 to be
      evidenced, all P0/P1 slices complete or explicitly blocked by separately tracked defects, and
      all authoritative repository verification green.

### Should Have

- [ ] **R7.13 (M)** Reports should trend claim states, exact coverage counts, fault kills/survivors,
      invalid runs, runtime, and flake without ranking quality by raw test count.
- [ ] **R7.14 (S)** Sharded or parallel execution should be enabled only after deterministic
      isolation is proven and shall produce the same evidence as serial execution.
- [ ] **R7.15 (S)** Optional property-based and resilience campaigns should remain separate until
      their oracles, reproducibility, and runtime meet the same promotion criteria.

### Won't Have (Out of Scope)

- Automatic publishing, deployment, or merge-policy changes.
- Automatic security-risk acceptance.
- Production telemetry or user-data collection for the test program.
- A second harness, external scanner integration, or browser-matrix expansion.

## Technical Requirements

### Command and Lane Model

| Lane                | Initial policy                         | Purpose                                                                  |
| ------------------- | -------------------------------------- | ------------------------------------------------------------------------ |
| `yarn verify`       | Existing required behavior unchanged   | Structure, active packages, lint, typecheck, build, server/SDK/CLI tests |
| `yarn test:ui`      | Existing separate lane                 | Chromium Porta UI behavior                                               |
| `yarn harness:test` | Existing separate lane, extended       | SPA/BFF/protocol/security/compatibility black-box assurance              |
| Coverage            | Observation-only until RD-03 stability | Attributed execution evidence                                            |
| Curated faults      | Explicit on demand                     | P0/P1 sensitivity proof                                                  |
| Automated mutation  | Explicit pilot                         | Targeted internal mutation after curated reliability                     |

### Availability and Recovery

- An assurance infrastructure failure shall not masquerade as a product pass or product defect.
- Cleanup shall run after success, assertion failure, setup failure, timeout, SIGINT, and SIGTERM.
- An incomplete cleanup shall print exact owned resources and a safe recovery command.
- Commands shall never delete resources outside their resolved project/worktree identity.

### Compatibility and Evolution

The initial compatibility contract is current server × current packed SDK/CLI. Mixed-version
support, N/N-1, released artifact retention, and public compatibility promises require a new user
scope decision (AR #20).

### Commonly Forgotten Requirements

| Concern                                                          | Disposition                                                                  |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Audit logging                                                    | Security-event behavior audited in RD-05; harness logs are redacted evidence |
| Export/import                                                    | P1 assurance in RD-05                                                        |
| API versioning                                                   | Existing public contract only; no version change                             |
| Accessibility                                                    | Existing targeted UI suite retained; expansion outside scope                 |
| Backup/DR                                                        | Harness state is disposable; product backup/DR unchanged                     |
| Monitoring                                                       | CI evidence and exit classes only; no production monitoring change           |
| Email/i18n/timezones                                             | Applicable authentication behavior audited; product expansion excluded       |
| GDPR/retention                                                   | Synthetic data only; CI evidence retention must be explicit                  |
| Sessions/admin/configuration                                     | P0/P1 risk slices in RD-05                                                   |
| Validation/injection/auth/rate/secrets/encryption/infrastructure | Mandatory RD-05 and project security invariants                              |

## Integration Points

- RD-01 provides claim and evidence states.
- RD-02 provides deterministic lifecycle and cleanup.
- RD-03 supplies reproducible coverage baselines.
- RD-04 supplies live consumer compatibility.
- RD-05 supplies ordered security claims.
- RD-06 supplies sensitivity proof.

## Scope Decisions

| Decision          | Options Considered                           | Chosen                | Rationale                                          | AR Ref         |
| ----------------- | -------------------------------------------- | --------------------- | -------------------------------------------------- | -------------- |
| Fast verification | Expand / replace / preserve                  | Preserve              | Keeps releases and development usable              | AR #2, AR #21  |
| Expensive checks  | Required now / manual forever / staged lanes | Staged lanes          | Builds evidence before policy promotion            | AR #14, AR #21 |
| Risk acceptance   | Tool / agent / user-policy owner             | Existing policy owner | Assurance cannot accept a known security violation | AR #26         |

## Security Considerations

- **Data sensitivity**: Evidence retention and access are explicit; secrets and PII are redacted.
- **Input validation**: Commands validate revision, path, project identity, artifact type, and
  configuration before execution.
- **Authentication and authorization**: CI secrets are exposed only to the step requiring them;
  current local assurance requires no external credential.
- **Injection risks**: No untrusted branch, path, report, or fixture value is evaluated by a shell.
- **Encryption**: Harness TLS remains active; repository/CI storage protections apply.
- **Rate limiting**: Assurance never disables limits globally and owns only dedicated test state.
- **Infrastructure**: Containers remain isolated, ephemeral, non-production, and ownership-scoped.

## Acceptance Criteria

1. [ ] Root `yarn verify` invokes none of the harness, coverage, curated-fault, or mutation commands
       and passes after the assurance foundation is installed.
2. [ ] The existing harness job executes all configured harness projects and preserves its current
       independent CI-job boundary.
3. [ ] Curated-fault and mutation commands cannot become required checks through this feature's
       implementation alone; promotion requires a separately recorded user policy decision.
4. [ ] Before any promotion proposal, 100 representative runs are recorded, fewer than one run is
       flaky for infrastructure/test reasons, and p50/p95 runtime and recovery ownership are present.
5. [ ] Forced product, assertion, setup, incomplete-coverage, invalid-fault, and cleanup failures
       produce distinguishable report classifications.
6. [ ] SIGINT/SIGTERM during each assurance command either removes all owned resources or reports
       their exact identifiers and a bounded recovery command without touching another worktree.
7. [ ] A seeded evidence bundle containing representative sensitive values contains none after
       redaction and declares access and retention metadata.
8. [ ] Changing a registered security invariant or compatibility boundary changes affected claims
       from `assured` to `stale` before a subsequent report can succeed.
9. [ ] Feature completion reports Must/Should/out-of-scope counts, all verification commands, every
       blocked defect, and every named residual gap without claiming absolute exploit absence.

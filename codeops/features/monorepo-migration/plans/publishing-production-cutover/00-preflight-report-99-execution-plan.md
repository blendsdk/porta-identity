# Preflight Report: T-02 Publishing and production cutover — Iteration 5

> **Status**: ✅ PASSED — all 5 major and 1 minor findings resolved
> **Iteration**: 5 (bounded verification of accepted minimal fixes)
> **Artifact**: `codeops/features/monorepo-migration/plans/publishing-production-cutover/99-execution-plan.md`
> **Artifact SHA-256**: `97d1493e9c74f6eb86af93c021788d40c81e8ced2a756d8eefbddae9110f5151`
> **Scope Mode**: Strict
> **Last Updated**: 2026-08-26

> **SAME-SESSION REVIEW:** The plan revision and audit occurred in the same session. Three
> independent audit clusters and an independent recommendation challenger were used.

## Audit contract and context

- **Target:** the single lightweight execution plan at the hash above.
- **Authorized scope:** one coordinated `1.7.0` npm release using the existing token with
  provenance, followed by three-package Trusted Publishing and token removal; the same `1.7.0`
  Docker image version; no broader publishing redesign.
- **Grounding:** package manifests, release/Docker/CI workflows, release tests, Lockstep 1.3.0,
  Node/npm toolchain, AR-11 and AR-24 through AR-29, and current npm/GitHub documentation.
- **Applicable lenses:** web application, distributed/concurrent workflow, data/migration and
  compatibility.

## Summary

| Finding                                          | Severity | Decision |
| ------------------------------------------------ | -------- | -------- |
| PF-019 — CI-tested release candidate lifecycle   | 🟠 Major | Resolved |
| PF-020 — Docker workflow handoff                 | 🟠 Major | Resolved |
| PF-021 — Trusted Publishing npm toolchain        | 🟠 Major | Resolved |
| PF-022 — Bootstrap authority and recovery window | 🟠 Major | Resolved |
| PF-023 — Trusted Publisher acceptance evidence   | 🟠 Major | Resolved |
| PF-024 — Exact verification commands             | 🟡 Minor | Resolved |

All other checks across the 13 dimensions passed. Scope-creep review was clean.

## Findings

### PF-019: Lockstep must prepare the exact candidate before `main` CI 🟠 MAJOR

**Dimensions:** Logical contradictions, feasibility, ordering, codebase alignment
**Location:** plan lines 31-49 and 80-92
**Evidence:** current manifests remain `1.6.2`; Lockstep 1.3.0 versions, commits/tags, then
publishes and pushes only after publication. A raw `workflow_run.head_sha` checkout is detached,
and Lockstep has no hook between manifest updates and its commit for derived SDK/CLI constants.

The live job cannot both mutate package bytes after CI and claim it publishes the CI-tested
revision. Partial failure can also lose the runner-local release commit.

**Recommendation:** Run Lockstep version preparation with `--no-git-commit` on the feature branch,
stamp derived constants, commit the complete `1.7.0` candidate, and run `main` CI on those exact
bytes. The live job publishes that SHA unchanged and creates/pushes `v1.7.0` only after npm
observation. This is simpler than a two-run workflow state machine.

**Confidence:** High. **Challenger:** converged.
**User Decision:** Accepted recommendation; applied and verified in Iteration 5.

### PF-020: A tag pushed by `GITHUB_TOKEN` will not trigger Docker publication 🟠 MAJOR

**Dimensions:** Logical contradictions, feasibility, edge cases
**Location:** plan lines 15-17 and 50-54
**Evidence:** `.github/workflows/docker.yml:28-30` relies on a tag push, while GitHub suppresses
new workflow runs caused by repository `GITHUB_TOKEN` events except explicit dispatch events.

**Recommendation:** After pushing the verified tag, explicitly dispatch `docker.yml` with required
tag and SHA inputs. The Docker workflow validates that the tag resolves to the supplied CI-tested
SHA, checks out the tag, and publishes the four aliases. Do not add a PAT or GitHub App credential.

**Confidence:** High. **Challenger:** converged.
**User Decision:** Accepted recommendation; applied and verified in Iteration 5.

### PF-021: The workflow does not provide a supported npm CLI 🟠 MAJOR

**Dimensions:** Dependency issues, feasibility
**Location:** plan lines 24-30 and 40-47
**Evidence:** the repository has no npm release dependency and the current Node 22.23.1 toolchain
supplies npm 10.9.8. npm Trusted Publishing requires Node >=22.14 and npm >=11.5.1; `npm trust`
evidence commands require the newer npm 11 command surface.

**Recommendation:** Pin one exact local npm 11 release that satisfies the publish and trust-command
floors, make Lockstep use that binary through the Yarn script PATH, and assert it before publish.
Reject runtime installation and runner-bundled drift.

**Confidence:** High. **Challenger:** converged.
**User Decision:** Accepted recommendation; applied and verified in Iteration 5.

### PF-022: Bootstrap authority cannot be proven read-only and recovery needs the token 🟠 MAJOR

**Dimensions:** Ambiguity, testability, security, edge cases
**Location:** plan lines 44-46, 55-63, and 83-86

No read-only npm operation conclusively proves that a token can create the nonexistent server
package. Also, “first publish step only” conflicts with missing-only recovery after a partial
publish.

**Recommendation:** Before merge, require redacted token identity/scope, organization authority,
SDK/CLI access, target-version absence, and tarball evidence. Treat the first live server publish
as the conclusive creation check and publish it first. Define a bounded `1.7.0` bootstrap window in
which only exact-candidate publish/recovery commands receive the token; publish only missing
packages, then configure Trusted Publishing and revoke/remove the token.

**Confidence:** High. **Challenger:** converged.
**User Decision:** Accepted recommendation; applied and verified in Iteration 5.

### PF-023: OIDC readiness must not claim an unperformed tokenless publish 🟠 MAJOR

**Dimensions:** Testability, completeness
**Location:** plan lines 57-59, 70-76, and 87-89

npm does not validate Trusted Publisher settings when saved, and `npm whoami` cannot prove OIDC.
The token-authenticated `1.7.0` release therefore cannot be end-to-end proof of tokenless publishing.

**Recommendation:** Capture redacted exact mappings for all three packages, token revocation and
GitHub-secret absence, workflow identity, `id-token: write`, supported Node/npm, and absence of
token variables in the durable workflow. Record the first actual tokenless publish as pending
until the next version rather than claiming it at `1.7.0`.

**Confidence:** High. **Challenger:** diverged — it also proposed a non-publishing OIDC-token
minting mode. That proves GitHub can mint a token but still cannot validate npm's saved mapping, so
the recommendation omits that extra workflow surface and states the remaining limitation plainly.
**User Decision:** Accepted recommendation; applied and verified in Iteration 5.

### PF-024: Planned verification entry points are not named 🟡 MINOR

**Dimension:** Testability
**Location:** plan lines 31-35, 64-69, and 95-100
**Evidence:** current `package.json` has no release dry-run or preflight scripts.

**Recommendation:** Name exact root `release:prepare`, `release:preflight`, and
`release:publish` commands plus the exact repository-contract selector in the plan and tests.

**User Decision:** Accepted recommendation; applied and verified in Iteration 5.

## External standards

- [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers/)
- [npm provenance](https://docs.npmjs.com/generating-provenance-statements/)
- [npm trust command](https://docs.npmjs.com/cli/v11/commands/npm-trust/)
- [GitHub workflow-trigger behavior](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)

## Verdict

The bounded recheck confirmed one exact pre-CI candidate, a pinned npm CLI, explicit Docker
dispatch without another credential, a bounded bootstrap/recovery window, honest OIDC readiness
evidence, and exact release commands. No blocking or residual minor finding remains. Execution may
begin. No implementation, npm publication, GitHub mutation, or Docker publication was performed.

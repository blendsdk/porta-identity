# Porta Roadmap Closeout

> **Feature**: Finish active verification work and reconcile stale roadmap records
> **Status**: Executing — Phase 6 integration; 37/44 verified
> **Created**: 2026-10-31
> **Implements**: _maintenance/T-07
> **CodeOps Artifact Schema**: 1
> **Reasoning**: high — security evidence, reviewed baselines and cross-feature tracking

## Overview

This is the coordinated closeout requested after invitation revocation landed in develop.
Existing plans contain historical rollout checkboxes, superseded security blockers and two real
pnpm verification gaps. The work must distinguish missing bookkeeping from missing proof.

The plan closes the selected active obligations, integrates through develop and leaves the
explicitly excluded assurance work visible. It does not claim the entire product or assurance
program is finished. The owning scope and acceptance criteria are in [01](01-requirements.md).

## Minimum-Sufficient Baseline

**Original goal:** close the identified half-finished active work, including necessary bounded
repairs, while Admin UI and releases wait (AR-1–5).

**Smallest viable design:** reuse original task owners, existing commands, existing baseline
structures, GitHub evidence and the established PR flow. Add this plan and one concise execution
evidence document. No new product API, runner, service, validator, dependency or policy engine.

**Excluded machinery:** a new roadmap parser or assurance runner would duplicate existing tools;
manual review of unsupported legacy checklist syntax is sufficient for this closeout.

**Approved complexity:** None. A newly discovered need for a larger mechanism reopens AR-4/11.

## Document Index

| Document | Owner of |
| --- | --- |
| [Ambiguity register](00-ambiguity-register.md) | User decisions and approval boundaries |
| [Requirements](01-requirements.md) | Scope, exclusions and completion criteria |
| [Current state](02-current-state.md) | Repository facts, paths and evidence candidates |
| [Evidence and reconciliation](03-01-evidence-and-reconciliation.md) | Rules for admitting evidence and changing old task states |
| [Verification and repairs](03-02-verification-and-repairs.md) | Concrete selectors, baseline review and bounded repair procedure |
| [Integration and cleanup](03-03-integration-and-cleanup.md) | Ownership, commits, portfolio cascade and final CI |
| [Testing strategy](07-testing-strategy.md) | Input-to-outcome acceptance cases and command gates |
| [Execution plan](99-execution-plan.md) | Ordered, single-source task progress |
| [Execution evidence](08-closeout-evidence.md) (created during execution) | Evidence contract, observations and dispositions |
| [Findings ledger](05-findings.md) | Phase review findings and rulings |
| [Preflight report](00-preflight-report.md) | Audit trail, findings and user decisions |

## Staging and Execution

- Draft location: `/home/gevik/.opencode/plan/porta-roadmap-closeout/`.
- Authorized eventual location: `codeops/features/_maintenance/plans/porta-roadmap-closeout/`.
- Repository examined: `/home/gevik/workdir/github/porta/porta-identity`.
- Observed integration checkpoint: `origin/develop` `c73cc7446006632272908a8043563086604cd9ff` on develop.
- Local `develop` is `6c2c6aa0` and 22 commits behind `origin/develop`; fetch and branch from
  `origin/develop`, not the stale local branch.
- Before execution, verify current develop, review this staged plan, switch to Build mode and
  promote the documents into the approved repository location, including `08-closeout-evidence.md`
  and `00-preflight-report.md`. If T-07 was allocated meanwhile, resolve that collision before
  registering anything (AR-6/11).
- Use `exec-plan` for execution and `git-commit` for verified checkpoints. Commit mode is chosen
  when execution starts; historical auto-commit permission for #196 is not silently reused.

## Specialist Agents

**None** — no new standing specialist is needed. Existing reviewer/security-auditor roles with
bounded evidence packets cover the task; a generic independent agent is the fallback.

Detection evidence: `codeops/codeops.json:5-8` requires independent review; the ratchet schema,
selector dispatcher and named predecessor plans fit a task packet. This is a one-off closeout,
not a recurring domain gap. No project-local agent/configuration files are created.

Required execution reviews: correctness/provenance of historical closure; security review of
tenant/umbrella conclusions and any baseline proposal; release/dependency review of remote
verification. Critical/major findings retain the repository's explicit ruling gate.

## Domain Lenses

| Lens | Application |
| --- | --- |
| Web application | Exact human-auth recovery, tenant/admin and protocol assertions |
| Distributed and concurrent | CI revisions, image identity, shared host ownership and cached builds |
| Data and migration | pnpm lockfile ingestion, historical artifact compatibility and reviewed baselines |

Specialist check: **None**. No project-local agent or configuration files are created. The
project-level check state is managed by the authorized execution workflow; no hidden workflow or
permission edit is made by this plan.

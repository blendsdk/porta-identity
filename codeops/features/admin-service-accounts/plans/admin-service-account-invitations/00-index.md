# Admin Service-Account Invitations

> **Feature**: Bundle C — invitation-only Admin API machine access
> **Status**: Plan preflight passed; ready for execution-entry verification
> **Created**: 2026-11-04
> **Implements**: admin-service-accounts/T-01
> **CodeOps Artifact Schema**: 1

## Overview

Implement issue #184 under the user-approved invitation-only contract. This is not an extension
of tenant authentication or general machine administration. The owning scope and user decisions
are in [the register](00-ambiguity-register.md), particularly AR-15–17. Technical choices carry
AR-18–20 provenance. The approved invocation is `--auto-design --auto-commit` under root
bundle-c-20261104; reserved decisions remain user-owned.

## Minimum-Sufficient Baseline

**Original goal:** Give unattended invitation automation explicitly bound, auditable and revocable
machine access without keeping a human administrator's session in a public service.

**Smallest viable design:** One PostgreSQL binding table and permanent internal user flag;
existing native opaque client-credentials tokens and transaction/audit machinery; focused
authentication, credential and role guards; one client subresource and matching SDK/CLI methods.

**Excluded machinery:** General identity-type registry, account conversion, token-wrapper store,
per-secret token lineage, worker, new cache, shared package, new dependency, new test framework,
Admin UI, release/deployment automation. **Approved complexity:** None beyond direct feature code.

## Documents

| Document                                                  | Owner                                                               |
| --------------------------------------------------------- | ------------------------------------------------------------------- |
| [00-ambiguity-register](00-ambiguity-register.md)         | Authority, options and decision provenance                          |
| [01-requirements](01-requirements.md)                     | Standalone product requirements                                     |
| [02-current-state](02-current-state.md)                   | Observed implementation and risk boundaries                         |
| [03-01-policy-storage](03-01-policy-storage.md)           | Schema, validation and internal policy interface                    |
| [03-02-account-lifecycle](03-02-account-lifecycle.md)     | Provisioning, permanent classification and mutation guards          |
| [03-03-machine-invitations](03-03-machine-invitations.md) | Token issuance, exact route opt-in and durable invitation authority |
| [03-04-sdk-cli](03-04-sdk-cli.md)                         | Public wire, SDK and conventional CLI integration                   |
| [07-testing-strategy](07-testing-strategy.md)             | Immutable specification cases and verification selections           |
| [99-execution-plan](99-execution-plan.md)                 | Sole task-progress authority                                        |

## Delivery and quality

Phases are dependency-ordered; every phase is specification-first. Add no public management
route until permanent account guards and machine authorization exist. Domain lenses: web
application, data/migration, distributed/concurrent. Review add-ons: security, api-surface and
concurrency; correctness/maintainability/standards always apply. Security profiles: auth-protocol,
tenant-isolation and owasp-web. The feature branch does not update the portfolio.

## Specialist Agents

**None** — the check found no capability gap requiring a standing specialist. Native OIDC,
PostgreSQL migration/locking and existing assurance conventions fit bounded dynamic packets for
generic independent authors/reviewers. The current codeops.json has strict independent review,
no specialized routing policy, and no recurring feature findings ledger demonstrating a packet
failure. This check does not create agents, routing policy or workflow files (AR-20).

## Completion boundary

The feature is not implemented merely because this plan exists. Every execution task, immutable
oracle, independent review and applicable production/packed/CI gate must qualify the same named
source. Cleanup and retained limitations are recorded before completion. No merge, release,
deployment or issue mutation is included.

# Record Deletion and Lifecycle Simplification Implementation Plan

> **Feature**: Consistent permanent record deletion with direct cascade and targeted logout
> **Status**: Planning Complete — Preflight Passed
> **Created**: 2026-09-05
> **Revised**: 2026-09-06
> **Implements**: admin-ui/RD-10
> **CodeOps Artifact Schema**: 1

## Overview

This plan gives Porta one record-ending operation: Delete. It removes Archive, Restore, Destroy,
Purge, and whole-client Revoke from the Admin API, SDK, conventional CLI, and embedded Admin UI.
Organizations retain Active/Suspended; applications, modules, and clients retain Active/Inactive.
Revoke remains only for credentials and protocol/security artifacts.

The Admin API, SDK, and conventional CLI expose direct confirmed deletion for eight record types.
The embedded Admin UI covers its five existing surfaces: organizations, users, applications,
modules, and clients. PostgreSQL cascade owns relational cleanup. Each security-relevant delete
captures affected authority before deletion, commits database changes and audit atomically, then
schedules one best-effort Redis cleanup callback. PostgreSQL remains authoritative throughout.

## Minimum-Sufficient Baseline

| Concern            | Chosen design                                                                                       |
| ------------------ | --------------------------------------------------------------------------------------------------- |
| Product vocabulary | Delete records; disable/suspend temporarily; revoke only security artifacts                         |
| Public surfaces    | Existing Admin API, SDK domains, conventional CLI commands, and Admin UI                            |
| Database work      | Existing transaction boundary plus set-based capture and foreign-key cascade                        |
| Redis work         | One post-commit `setImmediate` callback; no wait, retry, worker, or queue                           |
| Authority          | Reliable Session tracking plus live PostgreSQL validation for every backed OIDC/authorization read  |
| Safety             | One confirmation; protect only the control-plane organization and last active capable administrator |
| Deployment         | Forward migration plus ordinary reset/migrate/init; no data conversion or rollback machinery        |

No generic deletion framework, preview endpoint, dry-run, force switch, background job, reverse
index, token deny-list, or compatibility alias is introduced.

## Document Index

| Document                                                            | Purpose                                                    |
| ------------------------------------------------------------------- | ---------------------------------------------------------- |
| [Ambiguity Register](00-ambiguity-register.md)                      | Imported approved decisions and plan-local closure         |
| [Requirements](01-requirements.md)                                  | Delivery boundary and traceability                         |
| [Current State](02-current-state.md)                                | Verified code and schema gaps                              |
| [Lifecycle and Transaction Design](03-01-transactional-deletion.md) | Routes, permissions, cascades, audit, migration            |
| [Authority and Cleanup](03-02-authority-and-cleanup.md)             | Affected-user capture, PostgreSQL authority, Redis cleanup |
| [SDK, CLI, and Admin UI](03-03-sdk-and-admin-ui.md)                 | Public commands and interactive behavior                   |
| [Invitation and Environment](03-04-invitation-and-playground.md)    | Invitation continuity and reset/migrate/init               |
| [Testing Strategy](07-testing-strategy.md)                          | Immutable specifications and verification matrix           |
| [Execution Plan](99-execution-plan.md)                              | Specification-first task sequence                          |

## Administrator Journey

1. Choose Delete for an eligible record.
2. Read the irreversible warning and affected data classes.
3. Choose **Keep** or **Delete <name>**, with Keep initially focused.
4. On success, use the reloaded authoritative collection or return to login if the current user was
   affected.

## Primary Implementation Areas

- `packages/server/src/routes/`, domain repositories/services, permissions, OIDC/RBAC, and audit
- `packages/server/migrations/` and initialization permission/role mapping
- `packages/sdk/src/domains/`, public types, and agent tool descriptors
- `packages/cli/src/commands/` and `packages/cli/src/admin/`
- server, SDK, CLI, embedded Admin UI, existing compiled PTY, security, and migration suites
- public docs and maintainer architecture documentation

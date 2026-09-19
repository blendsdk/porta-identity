# Production Security Corrections Implementation Plan

> **Feature**: Encrypted signing-key mutations and single-use TOTP
> **Status**: Planning Complete
> **Created**: 2026-09-12
> **Implements**: production-readiness/RD-01
> **CodeOps Artifact Schema**: 1

## Overview

This plan closes the two production security gaps in RD-01. Admin-created signing keys receive the
same AES-256-GCM protection as bootstrap keys, and accepted TOTP time steps become single-use. It
also makes the production secret requirements and key-restart boundary explicit.

## Minimum-Sufficient Design

| Concern | Direct solution |
|---|---|
| Key writes | Reuse the current Admin request transaction, encryption helper, and post-commit hook |
| Key bootstrap | Use one PostgreSQL transaction-scoped table lock, recheck, and optional insertion |
| JWKS cache | Add one in-process generation counter to reject stale in-flight loads |
| TOTP replay | Add one nullable column and one exact-row conditional update |
| Enrollment | Reuse the current transaction helper and `2fa_verify` limiter |
| Operations | Validate unequal root secrets and print/document the all-instance restart requirement |

No service, worker, queue, Redis replay state, distributed cache coordination, live provider
rebuild, compatibility layer, dependency, or new administrator workflow is added (AR-7).

## Document Index

| # | Document | Purpose |
|---:|---|---|
| AR | [Ambiguity Register](00-ambiguity-register.md) | Approved implementation choices |
| 01 | [Requirements Delta](01-requirements.md) | RD ownership and plan-specific constraints |
| 02 | [Current State](02-current-state.md) | Verified implementation gaps and reuse points |
| 03-01 | [Signing Keys](03-01-signing-keys.md) | Encryption, transactions, bootstrap, cache, diagnostics |
| 03-02 | [TOTP Replay](03-02-totp-replay.md) | Schema, validation, atomic consumption, routes |
| 03-03 | [Production Operations](03-03-production-configuration-and-operations.md) | Secret separation, CLI, docs, restart contract |
| 07 | [Testing Strategy](07-testing-strategy.md) | Immutable cases and verification matrix |
| 99 | [Execution Plan](99-execution-plan.md) | Specification-first task checklist |

## Scope Controls

- Keep changes localized in the current modules; the existing large TOTP files are not split as
  part of this correction (AR-7).
- Do not preserve or convert unused plaintext signing rows. Reset and initialize the database
  (AR-5).
- Do not expose stored parameters, time steps, keys, codes, cryptographic fields, raw errors,
  stacks, SQL details, or internal paths.
- Do not change OIDC algorithms, TOTP parameters, or public Admin authorization contracts (AR-6).

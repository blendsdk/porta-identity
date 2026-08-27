# JSVision Admin Foundation Implementation Plan

> **Feature**: Embed a secure, authenticated JSVision administration shell in the Porta CLI
> **Status**: Planning Complete
> **Created**: 2026-08-27
> **Implements**: admin-ui/RD-01
> **CodeOps Artifact Schema**: 1

## Overview

This plan replaces the retired optional browser-GUI launcher with `porta admin`, a directly embedded JSVision terminal application. The first milestone deliberately proves only the foundations needed by later administration modules: terminal lifecycle, responsive application chrome, secure server selection, verified OIDC authentication, durable rotated credentials, and sanitized failure handling.

It also adds an isolated, persistent Docker Compose playground with trusted local TLS and MailHog. The playground uses Porta's reserved loopback DNS test mechanism, exposes only HTTPS and MailHog on IPv4 loopback, and gives maintainers a deterministic environment in which to explore later invitation, recovery, OTP, and administration journeys. Full administration screens remain outside this plan. (AR-2, AR-5, AR-20, AR-24)

## Document Index

| #     | Document                                                                  | Description                                                           |
| ----- | ------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| AR    | [Ambiguity Register](00-ambiguity-register.md)                            | Confirmed scope and security decisions                                |
| 00    | [Index](00-index.md)                                                      | Overview and navigation                                               |
| RD-01 | [Requirements](../../requirements/RD-01-jsvision-admin-foundation.md)     | Authoritative capability requirements and acceptance criteria         |
| 01    | [Requirements Traceability](01-requirements.md)                           | Plan mapping to the authoritative RD                                  |
| 02    | [Current State](02-current-state.md)                                      | Repository evidence, gaps, and risks                                  |
| 03-01 | [Command and TUI Shell](03-01-command-and-tui-shell.md)                   | Command contract, application state, layout, and terminal lifecycle   |
| 03-02 | [Authentication and Credentials](03-02-authentication-and-credentials.md) | OIDC validation, session verification, and atomic refresh persistence |
| 03-03 | [Admin Playground](03-03-admin-playground.md)                             | Compose, trusted TLS, MailHog, bootstrap, persistence, and reset      |
| 03-04 | [Packaging and Documentation](03-04-packaging-and-documentation.md)       | Dependency/package contracts and documentation boundaries             |
| 07    | [Testing Strategy](07-testing-strategy.md)                                | Immutable specification cases and verification matrix                 |
| 99    | [Execution Plan](99-execution-plan.md)                                    | Specification-first phase and task checklist                          |

## Quick Reference

| Concern            | Confirmed outcome                                                                                                     |
| ------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Command            | `porta admin`; `porta gui` is removed without an alias (AR-3)                                                         |
| Runtime            | Node 22+ interactive terminal with lockstep `@jsvision/core` and `@jsvision/ui` dependencies (AR-4, AR-19, AR-22)     |
| Authentication     | Browser/manual Authorization Code + PKCE with nonce and full ES256 ID-token verification (AR-6, AR-27)                |
| Live session check | Exact server binding followed by issuer UserInfo verification (AR-7)                                                  |
| Playground         | `yarn admin:env up \| stop \| reset \| status`, persistent data, trusted local HTTPS, and MailHog (AR-8–AR-15, AR-23) |
| Scope boundary     | Application/session shell only; no administrative data modules (AR-2, AR-20)                                          |

### Usage Examples

```bash
porta admin --server https://porta.example.com
yarn admin:env up
porta admin --server https://porta-admin-playground.ci.portaidentity.com:3543
```

The reserved `ci.portaidentity.com` example belongs only to maintainer documentation and tests; public CLI documentation uses generic operator-owned HTTPS origins. (AR-18, AR-24)

## Related Files

The work primarily affects `packages/cli/src/auth/`, `packages/cli/src/admin/`, `packages/cli/src/commands/`, `packages/cli/src/credential-store.ts`, `packages/sdk/src/auth/cli-auth.ts`, server initialization output/tests, package manifests and lockfile, `docker/admin-playground/`, root lifecycle scripts, CLI/public docs, staged project-guidance notes, `techdocs/`, and their focused test trees. Exact ownership appears in the component documents and execution tasks. (AR-30)

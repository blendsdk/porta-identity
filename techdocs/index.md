---
techdocs: true
---

# Porta Technical Documentation

> **Project**: Porta
> **Type**: Multi-tenant OIDC Provider (API / SaaS)
> **Tech Stack**: TypeScript, Koa, node-oidc-provider, PostgreSQL, Redis
> **Last Updated**: 2026-08-26

---

## Purpose

This section contains the technical architecture documentation for Porta —
system design, data models, infrastructure, architecture decisions, and
developer guides. It is written for developers who maintain, extend, or
contribute to the Porta codebase.

For product documentation (how to use, configure, and administer Porta),
see the [main documentation](../docs/).

## Contents

- **[Architecture](architecture/system-overview.md)** — System overview, data model, API design, infrastructure, security
- **[Architecture Decisions](decisions/index.md)** — Record of all significant design choices with rationale
- **[Developer Guides](guides/getting-started.md)** — Setup, development workflow, deployment procedures
- **[Reference](reference/configuration.md)** — Configuration options, external integrations

## Quick Navigation

| Section                                                       | What You'll Find                                                              |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| [System Overview](architecture/system-overview.md)            | High-level architecture, component diagram, request flow                      |
| [Data Model](architecture/data-model.md)                      | Domain entities, relationships, database schema                               |
| [API Design](architecture/api-design.md)                      | REST conventions, authentication, pagination, error handling                  |
| [Infrastructure](architecture/infrastructure.md)              | Docker, deployment, CI/CD, monitoring                                         |
| [Security](architecture/security.md)                          | Threat model, crypto standards, multi-tenant isolation                        |
| [Decision Log](decisions/index.md)                            | Architecture Decision Records (ADRs)                                          |
| [Getting Started](guides/getting-started.md)                  | Developer setup, prerequisites, first run                                     |
| [Development Workflow](guides/development.md)                 | Coding patterns, testing, module conventions                                  |
| [Release Operations](guides/releasing.md)                     | Lockstep npm release, Trusted Publishing cutover, and Docker verification     |
| [SDK CLI Migration Record](guides/sdk-cli-migration.md)       | Historical rationale for adopting the shared SDK in the CLI                   |
| [Deployment](guides/deployment.md)                            | Production deployment, Docker, environment config                             |
| [Configuration Reference](reference/configuration.md)         | All environment variables, config options, defaults                           |
| [Integrations](reference/integrations.md)                     | PostgreSQL, Redis, SMTP, node-oidc-provider                                   |
| [Current Test Inventory](reference/current-test-inventory.md) | Test-suite counts, execution layers, behavior coverage, and assurance limits  |
| [Retired v5 Playgrounds](reference/retired-playgrounds.md)    | Why the unsupported playgrounds were removed and how to recover them from Git |
